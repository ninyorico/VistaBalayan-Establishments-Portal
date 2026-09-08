import { supabase } from "../../lib/supabase";
import { Outlet, NavLink, useNavigate } from "react-router";
import { LayoutDashboard, FileUp, Bed, History, BarChart3, Brain, User, LogOut, Menu, Building2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { canSubmitAccommodationReport, canSubmitVisitorReport } from "../../lib/establishmentReportForms";
import NotificationCenter from "../components/NotificationCenter";

const menuItems = [
  { path: "/staff", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/staff/submit-visitor-report", icon: FileUp, label: "Resort report", form: "visitor" },
  { path: "/staff/submit-accommodation-report", icon: Bed, label: "Hotel report", form: "accommodation" },
  { path: "/staff/submission-history", icon: History, label: "Submission history" },
  { path: "/staff/analytics", icon: BarChart3, label: "Analytics" },
  { path: "/staff/ai-insights", icon: Brain, label: "AI insights" },
  { path: "/staff/manage-listing", icon: Building2, label: "Public listing" },
];

export default function StaffLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [establishment, setEstablishment] = useState<any>(null);
  useEffect(() => { (async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data: profile } = await supabase.from("profiles").select("establishment_id").eq("id", user.id).maybeSingle(); if (!profile?.establishment_id) return; const { data } = await supabase.from("establishments").select("type,total_rooms").eq("id", profile.establishment_id).maybeSingle(); setEstablishment(data); })(); }, []);
  const visibleMenuItems = menuItems.filter((item) => item.form === "visitor" ? canSubmitVisitorReport(establishment) : item.form === "accommodation" ? canSubmitAccommodationReport(establishment) : true);
  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = "/admin/login"; };
  const closeSidebarOnMobile = () => { if (window.innerWidth < 1024) setSidebarOpen(false); };

  return (
    <div className="min-h-[100dvh] tourism-shell text-clay-foreground">
      {sidebarOpen && <div className="fixed inset-0 z-[85] bg-clay-foreground/35 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-[90] overflow-hidden border-r border-clay-border bg-white/72 shadow-clayCard backdrop-blur-xl transition-all duration-300 ${sidebarOpen ? "w-[84vw] max-w-80" : "w-0 lg:w-72"}`}>
        <div className="border-b border-clay-border bg-gradient-to-br from-white/90 via-sky-50/80 to-violet-50/70 p-6"><div className="flex items-center gap-3"><div className="clay-orb flex h-12 w-12 items-center justify-center bg-gradient-to-br from-sky-400 to-violet-700 text-sm font-black text-white">VB</div><div><p className="font-heading text-xl font-black tracking-tight">VistaBalayan</p><p className="text-sm font-semibold text-clay-accent">Establishment Portal</p></div></div></div>
        <div className="mx-4 mt-5 rounded-[24px] bg-gradient-to-br from-sky-400 to-violet-600 p-4 text-white shadow-clayButton"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /><div><p className="text-xs font-bold uppercase tracking-widest text-white/75">Your workspace</p><p className="mt-1 font-heading font-black">Keep reports current</p></div></div></div>
        <nav className="space-y-2 overflow-y-auto p-4">{visibleMenuItems.map((item) => <NavLink key={item.path} to={item.path} end={item.path === "/staff"} onClick={closeSidebarOnMobile} className={({ isActive }) => `group flex min-h-12 items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-bold transition-all duration-300 ${isActive ? "-translate-y-0.5 bg-gradient-to-r from-sky-500 to-violet-600 text-white shadow-clayButton" : "text-clay-muted hover:-translate-y-0.5 hover:bg-white/80 hover:text-clay-accent hover:shadow-clayCard"}`}><item.icon className="h-5 w-5" /><span>{item.label}</span></NavLink>)}</nav>
      </aside>
      <div className="lg:ml-72"><header className="sticky top-0 z-[80] border-b border-clay-border bg-white/60 shadow-[0_12px_40px_rgba(160,150,180,.12)] backdrop-blur-xl"><div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8"><button onClick={() => setSidebarOpen(!sidebarOpen)} className="clay-button flex h-11 w-11 items-center justify-center lg:hidden" aria-label="Toggle navigation"><Menu className="h-5 w-5" /></button><div className="hidden items-center gap-3 lg:flex"><div className="rounded-full bg-sky-100 px-4 py-2 text-xs font-bold uppercase tracking-widest text-sky-700">Establishment workspace</div><span className="text-sm font-medium text-clay-muted">Submit, track, grow</span></div><div className="flex items-center gap-3"><NotificationCenter role="establishment_staff" /><div className="h-8 w-px bg-violet-200" /><div className="relative"><button onClick={() => setProfileDropdownOpen(!profileDropdownOpen)} className="flex min-h-11 items-center gap-3 rounded-[20px] px-2 py-1.5 transition hover:bg-white/80 hover:shadow-clayCard"><div className="clay-orb flex h-10 w-10 items-center justify-center bg-gradient-to-br from-pink-400 to-violet-600 text-sm font-black text-white">ES</div><div className="hidden text-left sm:block"><p className="text-sm font-bold">Establishment staff</p><p className="text-xs text-clay-muted">staff@establishment.com</p></div></button>{profileDropdownOpen && <div className="absolute right-0 z-50 mt-3 w-60 rounded-[24px] border border-clay-border bg-white/90 p-2 shadow-clayCard backdrop-blur-xl"><button onClick={() => { navigate("/staff/profile"); setProfileDropdownOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-[16px] px-4 text-left text-sm font-bold hover:bg-violet-50"><User className="h-5 w-5 text-clay-accent" />Profile</button><button onClick={() => { handleLogout(); setProfileDropdownOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-[16px] px-4 text-left text-sm font-bold text-red-600 hover:bg-red-50"><LogOut className="h-5 w-5" />Logout</button></div>}</div></div></div></header><main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8"><Outlet /></main></div>
    </div>
  );
}
