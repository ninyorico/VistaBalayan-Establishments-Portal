import { Outlet, NavLink, useNavigate } from "react-router";
import { LayoutDashboard, Building2, ClipboardCheck, FileText, BarChart3, Brain, LogOut, Menu, Settings, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import NotificationCenter from "../components/NotificationCenter";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profile = { full_name: "Municipal Tourism Officer", email: "officer@balayan.gov" };
  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = "/admin/login"; };
  const closeSidebarOnMobile = () => { if (window.innerWidth < 1024) setSidebarOpen(false); };
  const initials = profile.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2);

  return (
    <div className="min-h-[100dvh] tourism-shell text-clay-foreground">
      {sidebarOpen && <div className="fixed inset-0 z-[85] bg-clay-foreground/35 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-[90] overflow-hidden border-r border-clay-border bg-white/72 shadow-clayCard backdrop-blur-xl transition-all duration-300 ${sidebarOpen ? "w-[84vw] max-w-80" : "w-0 lg:w-72"}`}>
        <div className="border-b border-clay-border bg-gradient-to-br from-white/90 via-violet-50/80 to-pink-50/70 p-6">
          <div className="flex items-center gap-3">
            <div className="clay-orb flex h-12 w-12 items-center justify-center bg-gradient-to-br from-violet-400 to-violet-700 text-sm font-black text-white">VB</div>
            <div><p className="font-heading text-xl font-black tracking-tight">VistaBalayan</p><p className="text-sm font-semibold text-clay-accent">Tourism Officer Portal</p></div>
          </div>
        </div>
        <div className="mx-4 mt-5 rounded-[24px] bg-gradient-to-br from-violet-500 to-pink-500 p-4 text-white shadow-clayButton">
          <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /><div><p className="text-xs font-bold uppercase tracking-widest text-white/75">Workspace</p><p className="mt-1 font-heading font-black">Municipal insights</p></div></div>
        </div>
        <nav className="space-y-2 overflow-y-auto p-4">
          {menuItems.map((item) => <NavLink key={item.path} to={item.path} end={item.path === "/officer"} onClick={closeSidebarOnMobile} className={({ isActive }) => `group flex min-h-12 items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-bold transition-all duration-300 ${isActive ? "-translate-y-0.5 bg-gradient-to-r from-violet-500 to-violet-700 text-white shadow-clayButton" : "text-clay-muted hover:-translate-y-0.5 hover:bg-white/80 hover:text-clay-accent hover:shadow-clayCard"}`}><item.icon className="h-5 w-5" /><span>{item.label}</span></NavLink>)}
        </nav>
      </aside>
      <div className="lg:ml-72">
        <header className="sticky top-0 z-[80] border-b border-clay-border bg-white/60 shadow-[0_12px_40px_rgba(160,150,180,.12)] backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="clay-button flex h-11 w-11 items-center justify-center lg:hidden" aria-label="Toggle navigation"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-3 lg:flex"><div className="rounded-full bg-violet-100 px-4 py-2 text-xs font-bold uppercase tracking-widest text-violet-700">Municipal workspace</div><span className="text-sm font-medium text-clay-muted">Monitor, understand, improve</span></div>
            <div className="flex items-center gap-3"><NotificationCenter role="municipal_officer" /><div className="h-8 w-px bg-violet-200" /><div className="relative"><button onClick={() => setProfileDropdownOpen(!profileDropdownOpen)} className="flex min-h-11 items-center gap-3 rounded-[20px] px-2 py-1.5 transition hover:bg-white/80 hover:shadow-clayCard"><div className="clay-orb flex h-10 w-10 items-center justify-center bg-gradient-to-br from-sky-400 to-violet-600 text-sm font-black text-white">{initials}</div><div className="hidden text-left sm:block"><p className="text-sm font-bold">{profile.full_name}</p><p className="text-xs text-clay-muted">{profile.email}</p></div></button>{profileDropdownOpen && <div className="absolute right-0 z-50 mt-3 w-60 rounded-[24px] border border-clay-border bg-white/90 p-2 shadow-clayCard backdrop-blur-xl"><button onClick={() => { navigate("/officer/settings"); setProfileDropdownOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-[16px] px-4 text-left text-sm font-bold text-clay-foreground hover:bg-violet-50"><Settings className="h-5 w-5 text-clay-accent" />Settings</button><button onClick={() => { handleLogout(); setProfileDropdownOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-[16px] px-4 text-left text-sm font-bold text-red-600 hover:bg-red-50"><LogOut className="h-5 w-5" />Logout</button></div>}</div></div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
