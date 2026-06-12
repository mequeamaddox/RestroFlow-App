import { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";

export default function FirebaseAuth() {
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (isSignedIn) {
      window.location.href = '/';
    }
  }, [isSignedIn]);

  return null;
}