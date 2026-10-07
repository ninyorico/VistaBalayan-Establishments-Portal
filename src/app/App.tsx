import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import { AuthProvider } from "../contexts/AuthContext";
import CookieConsent from "./components/CookieConsent";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <CookieConsent />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}
