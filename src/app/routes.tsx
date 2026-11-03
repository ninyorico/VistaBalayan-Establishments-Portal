import { createBrowserRouter, Navigate } from "react-router";
import Login from "./pages/Login";
import LegalPage from "./pages/LegalPages";
import OfficerLayout from "./layouts/OfficerLayout";
import StaffLayout from "./layouts/StaffLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";

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
          const Page = (await import("./pages/staff/SubmitAccommodationReport")).default;
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
