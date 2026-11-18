import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import { AuthProvider } from "../contexts/AuthContext";
import CookieConsent from "./components/CookieConsent";
import OfflinePage from "./components/OfflinePage";

export default function App() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (isOffline) {
    return <OfflinePage />;
  }

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <CookieConsent />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}
