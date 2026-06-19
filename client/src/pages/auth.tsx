import { useEffect, useState } from "react";
import { SignIn, useUser } from "@clerk/clerk-react";

export default function Auth() {
  const { isSignedIn, isLoaded } = useUser();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      window.location.href = '/';
    }
  }, [isSignedIn]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!isLoaded) setTimedOut(true);
    }, 10000);
    return () => clearTimeout(t);
  }, [isLoaded]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {timedOut ? (
        <div style={{
          background: "#1e293b",
          border: "1px solid #ef4444",
          borderRadius: "12px",
          padding: "2rem",
          maxWidth: "480px",
          width: "100%",
          fontFamily: "system-ui, sans-serif",
        }}>
          <div style={{ color: "#ef4444", fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
            Login unavailable
          </div>
          <p style={{ color: "#cbd5e1", marginBottom: "1rem", lineHeight: 1.6, fontSize: "0.9rem" }}>
            The login system (Clerk) failed to initialize. This is usually a configuration issue — not a browser problem.
          </p>
          <div style={{ background: "#0f172a", borderRadius: 8, padding: "0.875rem", marginBottom: "0.75rem" }}>
            <p style={{ color: "#94a3b8", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.5rem" }}>Most common causes:</p>
            <ul style={{ color: "#94a3b8", fontSize: "0.8rem", paddingLeft: "1rem", lineHeight: 1.8 }}>
              <li><code style={{ color: "#f472b6" }}>restroflowsolutions.com</code> not added to your Clerk production app's Domains</li>
              <li><code style={{ color: "#f472b6" }}>clerk.restroflowsolutions.com</code> CNAME not set in DNS</li>
              <li><code style={{ color: "#f472b6" }}>VITE_CLERK_PUBLISHABLE_KEY</code> missing in Railway at build time</li>
            </ul>
          </div>
          <p style={{ color: "#64748b", fontSize: "0.75rem" }}>
            Fix in: Clerk Dashboard → your production app → Domains
          </p>
        </div>
      ) : (
        <SignIn routing="hash" />
      )}
    </div>
  );
}
