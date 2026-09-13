import { AlertCircle, Clock3, Inbox, Loader2, RefreshCw } from "lucide-react";

type DataStateProps = {
  state: "loading" | "empty" | "error" | "session-expired";
  message?: string;
  onRetry?: () => void;
};

export default function DataState({ state, message, onRetry }: DataStateProps) {
  const content = {
    loading: { icon: Loader2, title: "Loading", text: message || "Loading data…", spin: true },
    empty: { icon: Inbox, title: "No results", text: message || "There are no records to display.", spin: false },
    error: { icon: AlertCircle, title: "Backend error", text: message || "We could not load this data.", spin: false },
    "session-expired": { icon: Clock3, title: "Session expired", text: message || "Your session has expired. Sign in again to continue.", spin: false },
  }[state];
  const Icon = content.icon;

  return (
    <div role="status" aria-live="polite" className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <Icon className={`h-8 w-8 text-slate-400 ${content.spin ? "animate-spin" : ""}`} aria-hidden="true" />
      <div>
        <h3 className="font-semibold text-slate-800">{content.title}</h3>
        <p className="mt-1 max-w-md text-sm text-slate-500">{content.text}</p>
      </div>
      {(state === "error" || state === "session-expired") && onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl bg-[#0F4C75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B3B5C]">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}
