import { RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";

export default function OfflinePage() {
  const [isChecking, setIsChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);

  const handleRetry = () => {
    setIsChecking(true);
    setStillOffline(false);

    window.setTimeout(() => {
      if (navigator.onLine) {
        window.location.reload();
        return;
      }

      setIsChecking(false);
      setStillOffline(true);
    }, 250);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#E0E5EC] px-5 py-10 text-[#0B2530]">
      <section
        aria-labelledby="offline-title"
        className="w-full max-w-xl rounded-[2rem] bg-[#E0E5EC] p-7 text-center shadow-[12px_12px_24px_rgba(163,177,198,0.62),-12px_-12px_24px_rgba(255,255,255,0.62)] sm:p-10"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#E0E5EC] text-[#E35D6A] shadow-[inset_8px_8px_14px_rgba(163,177,198,0.6),inset_-8px_-8px_14px_rgba(255,255,255,0.6)]">
          <WifiOff aria-hidden="true" className="h-9 w-9" strokeWidth={1.8} />
        </div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[#6C63FF]">VistaBalayan</p>
        <h1 id="offline-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          You are offline
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#5D6F73] sm:text-base">
          VistaBalayan needs an internet connection to load current tourism data and submit reports. Check your connection, then try again.
        </p>
        {stillOffline && (
          <p role="alert" className="mt-4 text-sm font-medium text-[#B54755]">
            You are still offline. Please reconnect and try again.
          </p>
        )}
        <button
          type="button"
          onClick={handleRetry}
          disabled={isChecking}
          className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#193364] px-5 py-3 text-sm font-semibold text-white shadow-[6px_6px_12px_rgba(163,177,198,0.55),-6px_-6px_12px_rgba(255,255,255,0.5)] transition hover:bg-[#27477d] active:translate-y-px disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isChecking ? "animate-spin" : ""}`} />
          {isChecking ? "Checking connection…" : "Try again"}
        </button>
      </section>
    </main>
  );
}
