import { supabase } from "../../lib/supabase";

import { Outlet, NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  FileUp,
  Bed,
  History,
  BarChart3,
  Brain,
  User,
  LogOut,
  Menu,
  Settings,
  Building2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { canSubmitAccommodationReport, canSubmitVisitorReport } from "../../lib/establishmentReportForms";
import NotificationCenter from "../components/NotificationCenter";

const menuItems = [
  { path: "/staff", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/staff/submit-visitor-report", icon: FileUp, label: "Resort", form: "visitor" },
  { path: "/staff/submit-accommodation-report", icon: Bed, label: "Hotels", form: "accommodation" },
  { path: "/staff/submission-history", icon: History, label: "Submission History" },
  { path: "/staff/analytics", icon: BarChart3, label: "Analytics" },
  { path: "/staff/ai-insights", icon: Brain, label: "AI Insights" },
  { path: "/staff/manage-listing", icon: Building2, label: "Manage Public Listing" },
];

export default function StaffLayout() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [establishment, setEstablishment] = useState<any>(null);

  useEffect(() => {
    const loadEstablishment = async () => {
      if (!profile?.establishment_id) return;

      const { data: establishmentData } = await supabase
        .from("establishments")
        .select("type,total_rooms,reporting_mode")
        .eq("id", profile.establishment_id)
        .maybeSingle();

      setEstablishment(establishmentData);
    };

    void loadEstablishment();
  }, [profile?.establishment_id]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSidebarOpen(false);
      setProfileDropdownOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const visibleMenuItems = menuItems.filter((item) => {
    if (item.form === "visitor") return canSubmitVisitorReport(establishment);
    if (item.form === "accommodation") return canSubmitAccommodationReport(establishment);
    return true;
  });

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/admin/login";
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-[100dvh] vb-dashboard-canvas text-black">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-[85] bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`vb-dashboard-sidebar fixed left-0 top-0 lg:top-0 h-full lg:h-full transition-all duration-300 ${
          sidebarOpen ? "w-[82vw] max-w-80 z-[90]" : "w-0 lg:w-64 z-40"
        } overflow-hidden`}
      >
        <div className="vb-dashboard-sidebar-brand p-6">
          <div className="flex items-center gap-3">
            <div className="vb-dashboard-avatar flex h-11 w-11 items-center justify-center text-sm font-black text-[#6C63FF]">VB</div>
            <div>
              <h1 className="text-xl font-black tracking-[-0.035em] text-black">VistaBalayan</h1>
              <p className="mt-0.5 text-xs font-black uppercase tracking-widest text-black">Establishment Staff</p>
            </div>
          </div>
        </div>

        <nav className="h-[calc(100vh-130px)] space-y-2 overflow-y-auto bg-[#FFFDF5] p-4 lg:h-auto">
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/staff"}
              onClick={closeSidebarOnMobile}
              className={({ isActive }) =>
                `vb-dashboard-nav-item flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                  isActive
                    ? "vb-dashboard-nav-active"
                    : "text-black"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Navbar */}
        <header className="vb-dashboard-topbar sticky top-0 z-[80]">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <button
              type="button"
              aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="vb-dashboard-button bg-[#E0E5EC] p-2.5 lg:hidden"
            >
              <Menu className="w-5 h-5 text-[#6C63FF]" />
            </button>

            <div className="flex items-center gap-3">
              <NotificationCenter role="establishment_staff" />

              <div className="h-8 w-px bg-black"></div>

              <div className="relative">
                <button
                  type="button"
                  aria-label="Open account menu"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg border-2 border-transparent px-2 py-1.5 transition-colors hover:border-black sm:gap-3"
                >
                  <div className="vb-dashboard-avatar flex h-9 w-9 items-center justify-center text-xs font-black text-[#6C63FF] sm:h-10 sm:w-10 sm:text-sm">
                    ES
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-semibold text-[#0F172A]">
                      Establishment Staff
                    </div>
                    <div className="text-xs text-[#6B7280]">
                      staff@establishment.com
                    </div>
                  </div>
                </button>

                {/* Profile Dropdown */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
                    <button
                      onClick={() => {
                        navigate("/staff/profile");
                        setProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F2F5F7] transition-colors text-left"
                    >
                      <User className="w-5 h-5 text-[#6B7280]" />
                      <span className="text-sm font-medium text-[#0F172A]">Profile</span>
                    </button>
                    <div className="border-t border-[#D9E2EC] my-2"></div>
                    <button
                      onClick={() => {
                        handleLogout();
                        setProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left"
                    >
                      <LogOut className="w-5 h-5 text-red-600" />
                      <span className="text-sm font-medium text-red-600">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="w-full p-3 sm:p-4 lg:p-4 xl:p-5 2xl:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
