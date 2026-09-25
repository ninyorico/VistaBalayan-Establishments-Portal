import { Outlet, NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Building2,
  ClipboardCheck,
  FileText,
  BarChart3,
  Brain,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { useEffect, useState } from "react";

import NotificationCenter from "../components/NotificationCenter";
import { useAuth } from "../../contexts/AuthContext";

const menuItems = [
  { path: "/officer", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/officer/establishments", icon: Building2, label: "Establishments" },
  { path: "/officer/report-monitoring", icon: ClipboardCheck, label: "Report Monitoring" },
  { path: "/officer/reports", icon: FileText, label: "Reports" },
  { path: "/officer/analytics", icon: BarChart3, label: "Analytics" },
  { path: "/officer/ai-insights", icon: Brain, label: "AI Insights" },
];

export default function OfficerLayout() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSidebarOpen(false);
      setProfileDropdownOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/admin/login";
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return "MTO";
  };

  return (
    <div className="min-h-[100dvh] vb-dashboard-canvas text-black">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 bg-black/50 z-[45] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`vb-dashboard-sidebar fixed left-0 top-0 lg:top-0 h-full lg:h-full transition-all duration-300 ${
          sidebarOpen ? "w-[82vw] max-w-80 z-50" : "w-0 lg:w-64 z-40"
        } overflow-hidden`}
      >
        <div className="vb-dashboard-sidebar-brand p-6">
          <div className="flex items-center gap-3">
            <div className="vb-dashboard-avatar flex h-11 w-11 items-center justify-center text-sm font-black text-[#6C63FF]">VB</div>
            <div>
              <h1 className="text-xl font-black tracking-[-0.035em] text-black">VistaBalayan</h1>
              <p className="mt-0.5 text-xs font-black uppercase tracking-widest text-black">Tourism Officer</p>
            </div>
          </div>
        </div>

        <nav className="h-[calc(100vh-130px)] space-y-2 overflow-y-auto bg-[#FFFDF5] p-4 lg:h-auto">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/officer"}
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
        <header className="vb-dashboard-topbar sticky top-0 z-40">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="vb-dashboard-button bg-[#E0E5EC] p-2.5 lg:hidden"
              >
                <Menu className="w-5 h-5 text-[#6C63FF]" />
              </button>

            </div>

            <div className="flex items-center gap-3">
              <NotificationCenter role="municipal_officer" />

              <div className="h-8 w-px bg-black"></div>

              <div className="relative">
                <button
                  type="button"
                  aria-label="Open account menu"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg border-2 border-transparent px-2 py-1.5 transition-colors hover:border-black sm:gap-3"
                >
                  <div className="vb-dashboard-avatar flex h-9 w-9 items-center justify-center text-xs font-black text-[#6C63FF] sm:h-10 sm:w-10 sm:text-sm">
                    {getInitials()}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-semibold text-[#0F172A]">
                      {profile?.full_name || "Authenticated officer"}
                    </div>
                    <div className="text-xs text-slate-500 truncate max-w-[180px]">
                      {profile?.email || ""}
                    </div>
                  </div>
                </button>

                {/* Profile Dropdown */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
                    <button
                      onClick={() => {
                        navigate("/officer/settings");
                        setProfileDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F2F5F7] transition-colors text-left"
                    >
                      <Settings className="w-5 h-5 text-[#6B7280]" />
                      <span className="text-sm font-medium text-[#0F172A]">Settings</span>
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
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}