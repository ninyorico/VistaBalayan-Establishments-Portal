import { createBrowserRouter, Navigate, useRouteError, isRouteErrorResponse } from "react-router";
import Login from "./pages/Login";
import LegalPage from "./pages/LegalPages";
import OfficerLayout from "./layouts/OfficerLayout";
import StaffLayout from "./layouts/StaffLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoadingState } from "./components/vista/PolishedShell";
import NotFound from "./pages/NotFound";

const STAFF_CHUNK_RETRY_KEY = "vistabalayan:staff-chunk-retry";

function StaffRouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? error.statusText : error instanceof Error ? error.message : "";
  const isChunkError = /dynamically imported module|importing a module script|Loading chunk/i.test(message);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-lg rounded-3xl bg-[#E0E5EC] p-6 text-center shadow-[9px_9px_16px_rgba(163,177,198,0.6),-9px_-9px_16px_rgba(255,255,255,0.55)]">
        <h1 className="text-xl font-bold text-[#193364]">This page could not be loaded</h1>
        <p className="mt-2 text-sm text-[#64748b]">
          {isChunkError ? "The page was updated while it was open. Refresh and try again." : "Please refresh the page and try again."}
        </p>
        <button
          type="button"
          className="mt-5 rounded-2xl bg-[#193364] px-5 py-3 font-semibold text-white"
          onClick={() => window.location.reload()}
        >
          Refresh page
        </button>
      </div>
    </div>
  );
}

const reloadOnceAfterChunkFailure = async <T,>(load: () => Promise<T>) => {
  try {
    const result = await load();
    sessionStorage.removeItem(STAFF_CHUNK_RETRY_KEY);
    return result;
  } catch (error) {
    if (!sessionStorage.getItem(STAFF_CHUNK_RETRY_KEY)) {
      sessionStorage.setItem(STAFF_CHUNK_RETRY_KEY, "1");
      window.location.reload();
      return new Promise<T>(() => {});
    }
    sessionStorage.removeItem(STAFF_CHUNK_RETRY_KEY);
    throw error;
  }
};

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/admin/login" replace /> },
  { path: "/explore", element: <Navigate to="/admin/login" replace /> },
  { path: "/admin/login", Component: Login },
  { path: "/privacy-policy", element: <LegalPage document="privacy" /> },
  { path: "/terms-and-conditions", element: <LegalPage document="terms" /> },
  { path: "/cookie-policy", element: <LegalPage document="cookies" /> },
  {
    path: "/officer",
    element: (
      <ProtectedRoute allowedRoles={["municipal_officer"]}>
        <OfficerLayout />
      </ProtectedRoute>
    ),
    HydrateFallback: () => <LoadingState label="Loading officer portal" />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./pages/officer/Dashboard")).default }) },
      { path: "establishments", lazy: async () => ({ Component: (await import("./pages/officer/Establishments")).default }) },
      { path: "review-moderation", lazy: async () => ({ Component: (await import("./pages/officer/ReviewModeration")).default }) },
      { path: "report-monitoring", lazy: async () => ({ Component: (await import("./pages/officer/ReportMonitoring")).default }) },
      { path: "visitor-monitoring", element: <Navigate to="/officer/report-monitoring" replace /> },
      { path: "accommodation-monitoring", element: <Navigate to="/officer/report-monitoring" replace /> },
      { path: "reports", lazy: async () => ({ Component: (await import("./pages/officer/Reports")).default }) },

      { path: "analytics", lazy: async () => ({ Component: (await import("./pages/officer/Analytics")).default }) },
      { path: "ai-insights", lazy: async () => ({ Component: (await import("./pages/officer/AIInsights")).default }) },
      { path: "settings", lazy: async () => ({ Component: (await import("./pages/officer/Settings")).default }) },
    ],
  },
  {
    path: "/staff",
    element: (
      <ProtectedRoute allowedRoles={["establishment_staff"]}>
        <StaffLayout />
      </ProtectedRoute>
    ),
    HydrateFallback: () => <LoadingState label="Loading staff portal" />,
    errorElement: <StaffRouteError />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./pages/staff/Dashboard")).default }) },
      {
        path: "submit-visitor-report",
        lazy: async () => {
          const Page = (await import("./pages/staff/SubmitVisitorReport")).default;
          return { Component: () => <ProtectedRoute requireActiveStaff><Page /></ProtectedRoute> };
        },
      },
      {
        path: "submit-accommodation-report",
        lazy: async () => {
          const Page = (await reloadOnceAfterChunkFailure(() => import("./pages/staff/SubmitAccommodationReport"))).default;
          return { Component: () => <ProtectedRoute requireActiveStaff><Page /></ProtectedRoute> };
        },
      },
      { path: "submission-history", lazy: async () => ({ Component: (await import("./pages/staff/SubmissionHistory")).default }) },
      { path: "analytics", lazy: async () => ({ Component: (await import("./pages/staff/Analytics")).default }) },
      { path: "ai-insights", lazy: async () => ({ Component: (await import("./pages/staff/AIInsights")).default }) },
      { path: "profile", lazy: async () => ({ Component: (await import("./pages/staff/Profile")).default }) },
      {
        path: "manage-listing",
        lazy: async () => {
          const Page = (await import("./pages/staff/ManageListing")).default;
          return { Component: () => <ProtectedRoute requireActiveStaff><Page /></ProtectedRoute> };
        },
      },
    ],
  },
  { path: "*", Component: NotFound },
]);
