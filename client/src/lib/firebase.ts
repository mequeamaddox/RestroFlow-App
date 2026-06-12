// client/src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

// Prefer Vite envs (Render injects these at build), fall back to hardcoded
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ??
    "AIzaSyCJ0kNSDxogO-XvbCnSAxHWzg0gcJFK6zA",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
    "restroflowsoftware.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "restroflowsoftware",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
    "restroflowsoftware.appspot.com",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "924139270468",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ??
    "1:924139270468:web:bcb1101e22319c4985e711",
};

// Avoid noisy logs in prod; if you want one, keep it behind a dev check
// if (import.meta.env.DEV) console.log("Firebase config loaded:", { projectId: firebaseConfig.projectId });

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
