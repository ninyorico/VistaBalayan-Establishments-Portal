import { useMemo, useState } from "react";
import { Bed, ClipboardCheck, Users } from "lucide-react";
import VisitorMonitoring from "./VisitorMonitoring";
import AccommodationMonitoring from "./AccommodationMonitoring";

type MonitoringTab = "visitor" | "accommodation";

const tabs: Array<{
  id: MonitoringTab;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    id: "visitor",
    label: "Resort reports",
    description: "Resort arrivals, origin, and demographic records",
    icon: Users,
  },
  {
    id: "accommodation",
    label: "Hotel reports",
    description: "Hotel room occupancy, guest nights, and check-in records",
    icon: Bed,
  },
];

export default function ReportMonitoring() {
  const [activeTab, setActiveTab] = useState<MonitoringTab>("visitor");

  const activeLabel = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label || "Report monitoring",
    [activeTab]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0F4C75] text-white shadow-lg shadow-cyan-950/15">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-3xl">
                Report Monitoring
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Review submitted tourism records in one workspace. Use the tabs to switch between resort and hotel monitoring without leaving the workflow.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-2xl bg-slate-100 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                    isActive
                                          ? "bg-[#E0E5EC] text-[#6474A5] shadow-[inset_3px_3px_6px_rgba(163,177,198,.45),inset_-3px_-3px_6px_rgba(255,255,255,.5)]"
                                          : "text-slate-600 hover:bg-[#E0E5EC]/70 hover:text-[#3D4852]"
                  }`}
                  aria-pressed={isActive}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.id === "visitor" ? "Visitors" : "Rooms"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  isActive
                                      ? "border-[#C3CBD7] bg-[#E0E5EC] shadow-[inset_5px_5px_10px_rgba(163,177,198,.45),inset_-5px_-5px_10px_rgba(255,255,255,.5)]"
                                      : "border-transparent bg-[#E0E5EC]/45 hover:border-[#C3CBD7] hover:bg-[#E0E5EC]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`rounded-xl p-2 ${isActive ? "bg-[#6C63FF] text-white shadow-[3px_3px_7px_rgba(163,177,198,.5),-3px_-3px_7px_rgba(255,255,255,.45)]" : "bg-[#E0E5EC] text-slate-500 shadow-[inset_3px_3px_6px_rgba(163,177,198,.35),inset_-3px_-3px_6px_rgba(255,255,255,.45)]"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">{tab.label}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{tab.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <section aria-label={activeLabel}>
        {activeTab === "visitor" ? <VisitorMonitoring embedded /> : <AccommodationMonitoring embedded />}
      </section>
    </div>
  );
}
