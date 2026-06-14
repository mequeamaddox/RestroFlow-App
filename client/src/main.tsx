import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  createRoot(document.getElementById("root")!).render(
    <div style={{
      minHeight: "100vh",
      background: "#0f172a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
      padding: "2rem",
    }}>
      <div style={{
        background: "#1e293b",
        border: "1px solid #ef4444",
        borderRadius: "12px",
        padding: "2.5rem",
        maxWidth: "520px",
        width: "100%",
      }}>
        <div style={{ color: "#ef4444", fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          ⚠️ Missing configuration
        </div>
        <p style={{ color: "#cbd5e1", marginBottom: "1.25rem", lineHeight: 1.6 }}>
          <code style={{ background: "#0f172a", padding: "2px 6px", borderRadius: 4, color: "#f472b6" }}>
            VITE_CLERK_PUBLISHABLE_KEY
          </code>{" "}
          is not set. This variable must be present at build time so Vite can bundle it into the app.
        </p>
        <div style={{ background: "#0f172a", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "0.5rem", fontWeight: 600 }}>
            Add to Railway → Service → Variables:
          </p>
          <code style={{ color: "#34d399", fontSize: "0.875rem", display: "block" }}>
            VITE_CLERK_PUBLISHABLE_KEY = pk_live_…
          </code>
          <code style={{ color: "#34d399", fontSize: "0.875rem", display: "block", marginTop: "0.25rem" }}>
            CLERK_SECRET_KEY = sk_live_…
          </code>
        </div>
        <p style={{ color: "#64748b", fontSize: "0.8rem" }}>
          After adding the variables, redeploy so Railway runs a fresh build with them present.
        </p>
      </div>
    </div>
  );
} else {
  createRoot(document.getElementById("root")!).render(
    <ClerkProvider publishableKey={publishableKey}>
      <App />
    </ClerkProvider>
  );
}
