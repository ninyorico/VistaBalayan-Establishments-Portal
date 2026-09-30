import { Navigate, useLocation } from "react-router";
import { ShieldAlert } from "lucide-react";
import { PageSkeleton } from "./vista/PolishedShell";
import { useAuth } from "../../contexts/AuthContext";
import { roleHomePath } from "../../lib/governance";

export function ProtectedRoute({ children, allowedRoles }: { children: JSX.Element; allowedRoles?: string[] }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageSkeleton label="Checking your access" />;
  }

  if (!profile) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">Access restricted</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Your account role is <span className="font-semibold capitalize">{profile.role.replace(/_/g, " ")}</span>. This area is limited to authorized users only.
          </p>
          <Navigate to={roleHomePath(profile.role)} replace />
        </div>
      </div>
    );
  }

  return children;
}
