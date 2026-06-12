import { useEffect } from "react";
import { SignIn, useUser } from "@clerk/clerk-react";

export default function Auth() {
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (isSignedIn) {
      window.location.href = '/';
    }
  }, [isSignedIn]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <SignIn routing="hash" />
    </div>
  );
}
