import { createBrowserRouter, Navigate } from "react-router";
import Login from "./pages/Login";
import OfficerLayout from "./layouts/OfficerLayout";
import StaffLayout from "./layouts/StaffLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import OfficerDashboard from "./pages/officer/Dashboard";
import Establishments from "./pages/officer/Establishments";
import ReportMonitoring from "./pages/officer/ReportMonitoring";
import Reports from "./pages/officer/Reports";
import Analytics from "./pages/officer/Analytics";
import AIInsights from "./pages/officer/AIInsights";
import Settings from "./pages/officer/Settings";
import StaffDashboard from "./pages/staff/Dashboard";
import SubmitVisitorReport from "./pages/staff/SubmitVisitorReport";
import SubmitAccommodationReport from "./pages/staff/SubmitAccommodationReport";
import SubmissionHistory from "./pages/staff/SubmissionHistory";
import StaffAnalytics from "./pages/staff/Analytics";
import StaffAIInsights from "./pages/staff/AIInsights";
import Profile from "./pages/staff/Profile";
import NotFound from "./pages/NotFound";
import ManageListing from "./pages/staff/ManageListing";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/admin/login" replace /> },
  { path: "/explore", element: <Navigate to="/admin/login" replace /> },
  { path: "/admin/login", Component: Login },
  {
    path: "/officer",
    element: (
      <ProtectedRoute allowedRoles={["municipal_officer"]}>
        <OfficerLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: OfficerDashboard },
      { path: "establishments", Component: Establishments },
      { path: "report-monitoring", Component: ReportMonitoring },
      { path: "visitor-monitoring", element: <Navigate to="/officer/report-monitoring" replace /> },
      { path: "accommodation-monitoring", element: <Navigate to="/officer/report-monitoring" replace /> },
      { path: "reports", Component: Reports },
      { path: "analytics", Component: Analytics },
      { path: "ai-insights", Component: AIInsights },
      { path: "settings", Component: Settings },
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
      { index: true, Component: StaffDashboard },
      { path: "submit-visitor-report", Component: SubmitVisitorReport },
      { path: "submit-accommodation-report", Component: SubmitAccommodationReport },
      { path: "submission-history", Component: SubmissionHistory },
      { path: "analytics", Component: StaffAnalytics },
      { path: "ai-insights", Component: StaffAIInsights },
      { path: "profile", Component: Profile },
      { path: "manage-listing", Component: ManageListing },
    ],
  },
  { path: "*", Component: NotFound },
]);
