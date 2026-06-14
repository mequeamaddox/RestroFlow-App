import * as Sentry from "@sentry/node";

// Must be initialised before any other imports so Sentry can instrument them.
// Silently no-ops when SENTRY_DSN is absent (dev / CI environments).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.1,
  // Suppress the "no DSN" warning in development
  ...(process.env.SENTRY_DSN ? {} : { enabled: false }),
});

import { clerkMiddleware, logClerkKeyDiagnostics } from './clerkAuth';
import { locationContextMiddleware } from './locationContext';
import { runStartupMigrations } from './startup-migrations';
import { validateObjectStorageConfig } from './objectStorage';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { securityHeaders, apiLimiter } from "./securityMiddleware";
import { startSpotOnSchedulers } from "./jobs/spoton.scheduler";
import { startAnalyticsScheduler } from "./jobs/analyticsScheduler";
import { startCloverScheduler } from "./jobs/clover.scheduler";

// Global error handlers — report to Sentry before deciding whether to keep the process alive
process.on('uncaughtException', (error) => {
  Sentry.captureException(error);
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  console.error('Unhandled Rejection:', reason);
});

const app = express();

// Configure trust proxy for Railway/Replit environment (fix rate limiting warning)
app.set('trust proxy', 1);

// Apply enterprise security middleware
app.use(securityHeaders);
app.use('/api/', apiLimiter);
// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
logClerkKeyDiagnostics();
app.use(clerkMiddleware({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
}));
app.use(locationContextMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await runStartupMigrations();
  validateObjectStorageConfig();

  const server = await registerRoutes(app);

  // Sentry error handler must come AFTER all routes and BEFORE the custom error handler
  // so it captures exceptions before we send the response to the client.
  Sentry.setupExpressErrorHandler(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    if (process.env.ENABLE_SCHEDULERS === 'true') {
      startSpotOnSchedulers();
      startAnalyticsScheduler();
      startCloverScheduler();
    } else {
      log('Schedulers disabled (set ENABLE_SCHEDULERS=true to enable)');
    }
  });
})();
