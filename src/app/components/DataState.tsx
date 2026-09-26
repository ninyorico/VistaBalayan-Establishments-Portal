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

  if (state === "loading") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[70dvh] items-center justify-center rounded-[2rem] bg-[#E0E5EC] p-5 sm:p-8">
        <div className="flex w-full max-w-md flex-col items-center rounded-[2rem] bg-[#E0E5EC] px-6 py-12 text-center shadow-[12px_12px_24px_rgba(163,177,198,0.6),-12px_-12px_24px_rgba(255,255,255,0.65)] sm:px-10">
          <div className="flex size-20 items-center justify-center rounded-full bg-[#E0E5EC] shadow-[inset_6px_6px_12px_rgba(163,177,198,0.55),inset_-6px_-6px_12px_rgba(255,255,255,0.7)]" aria-hidden="true">
            <div className="size-10 animate-spin rounded-full border-[5px] border-[#AFB3B5]/35 border-t-[#193364]" />
          </div>
          <p className="mt-6 text-lg font-semibold text-[#193364]">Loading</p>
          <p className="mt-2 text-sm text-[#6B7280]">{content.text}</p>
        </div>
      </div>
    );
  }

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
