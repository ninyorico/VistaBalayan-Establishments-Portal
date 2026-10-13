import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Filter, Flag, Loader2, MessageSquareWarning, RefreshCw, ShieldAlert, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";

type ModerationReview = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  rating: number;
  reviewer_name: string | null;
  comment: string | null;
  created_at: string;
  is_hidden: boolean;
  moderation_reason: string | null;
  report_count: number;
  latest_report_reason: string | null;
  latest_report_created_at: string | null;
};

type ModerationTarget = {
  review: ModerationReview;
  action: "remove" | "restore";
};

type ReviewFilter = "all" | "awaiting" | "visible" | "removed";

export default function ReviewModeration() {
  const [reviews, setReviews] = useState<ModerationReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moderationTarget, setModerationTarget] = useState<ModerationTarget | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [moderating, setModerating] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

  const loadReviews = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    const { data, error: loadError } = await supabase.rpc("get_review_moderation_queue");
    if (loadError) setError(loadError.message);
    else setReviews((data || []) as ModerationReview[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadReviews(true);
  }, [loadReviews]);

  useEffect(() => {
    if (!moderationTarget) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !moderating) {
        setModerationTarget(null);
        setModerationReason("");
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [moderationTarget, moderating]);

  const executeModeration = async (review: ModerationReview, action: "remove" | "restore", reason: string | null = null) => {
    setModerating(true);
    setError(null);
    const { error: moderateError } = await supabase.rpc("moderate_establishment_rating", {
      p_rating_id: review.id,
      p_action: action,
      p_reason: reason?.trim() || null,
    });
    if (moderateError) {
      setError(moderateError.message);
      setModerating(false);
      return;
    }
    setModerationTarget(null);
    setModerationReason("");
    await loadReviews();
    setModerating(false);
  };

  const requestRemoval = (review: ModerationReview) => {
    setModerationReason(review.latest_report_reason || "");
    setModerationTarget({ review, action: "remove" });
  };

  const moderate = async (review: ModerationReview, action: "remove" | "restore") => {
    if (action === "remove") {
      requestRemoval(review);
      return;
    }
    await executeModeration(review, action);
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-3 text-[#6474A5]"><Loader2 className="h-5 w-5 animate-spin" />Loading review moderation...</div>;

  const reportedCount = reviews.filter((review) => review.report_count > 0 && !review.is_hidden).length;
  const removedCount = reviews.filter((review) => review.is_hidden).length;
  const visibleCount = reviews.length - removedCount;
  const filteredReviews = reviews.filter((review) => {
    if (reviewFilter === "awaiting") return review.report_count > 0 && !review.is_hidden;
    if (reviewFilter === "visible") return !review.is_hidden;
    if (reviewFilter === "removed") return review.is_hidden;
    return true;
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/70 bg-[#E0E5EC] p-5 shadow-[10px_10px_22px_rgba(163,177,198,.55),-10px_-10px_22px_rgba(255,255,255,.8)] sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#E0E5EC] text-[#6C63FF] shadow-[inset_4px_4px_8px_rgba(163,177,198,.45),inset_-4px_-4px_8px_rgba(255,255,255,.72)]"><MessageSquareWarning className="h-7 w-7" /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6474A5]">Community safety</p>
              <h1 className="mt-1 text-2xl font-bold tracking-[-0.025em] text-[#193364] sm:text-3xl">Review moderation</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5D6F73]">Review public comments reported by visitors and remove content that violates the community rules. Removal hides the review publicly and keeps an audit record.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <label className="relative flex min-h-11 items-center gap-2 rounded-2xl bg-[#E0E5EC] px-4 text-sm font-semibold text-[#193364] shadow-[inset_4px_4px_8px_rgba(163,177,198,.4),inset_-4px_-4px_8px_rgba(255,255,255,.72)]"><Filter className="h-4 w-4 shrink-0 text-[#6C63FF]" /><span className="sr-only">Filter reviews</span><select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)} className="min-w-0 flex-1 appearance-none bg-transparent pr-5 outline-none"><option value="all">All reviews</option><option value="awaiting">Awaiting review</option><option value="visible">Visible reviews</option><option value="removed">Removed reviews</option></select><span className="pointer-events-none absolute right-4 text-xs text-[#6474A5]">⌄</span></label>
            <button type="button" onClick={() => void loadReviews()} disabled={refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#E0E5EC] px-5 py-2.5 text-sm font-semibold text-[#193364] shadow-[5px_5px_10px_rgba(163,177,198,.5),-5px_-5px_10px_rgba(255,255,255,.75)] transition hover:text-[#6C63FF] active:translate-y-px active:shadow-[inset_3px_3px_7px_rgba(163,177,198,.45),inset_-3px_-3px_7px_rgba(255,255,255,.75)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh reviews</button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="min-w-0 rounded-2xl border border-white/70 bg-[#E0E5EC] p-3 shadow-[5px_5px_10px_rgba(163,177,198,.48),-5px_-5px_10px_rgba(255,255,255,.72)] sm:rounded-3xl sm:p-5"><p className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-[#6474A5] sm:text-xs sm:tracking-[0.12em]">Awaiting review</p><p className="mt-1 text-2xl font-bold leading-tight text-[#193364] sm:mt-2 sm:text-3xl">{reportedCount}</p><p className="mt-1 hidden text-xs text-[#5D6F73] sm:block">Reported public reviews</p></div>
        <div className="min-w-0 rounded-2xl border border-white/70 bg-[#E0E5EC] p-3 shadow-[5px_5px_10px_rgba(163,177,198,.48),-5px_-5px_10px_rgba(255,255,255,.72)] sm:rounded-3xl sm:p-5"><p className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-[#6474A5] sm:text-xs sm:tracking-[0.12em]">Visible reviews</p><p className="mt-1 text-2xl font-bold leading-tight text-[#38B2AC] sm:mt-2 sm:text-3xl">{visibleCount}</p><p className="mt-1 hidden text-xs text-[#5D6F73] sm:block">Currently shown publicly</p></div>
        <div className="min-w-0 rounded-2xl border border-white/70 bg-[#E0E5EC] p-3 shadow-[5px_5px_10px_rgba(163,177,198,.48),-5px_-5px_10px_rgba(255,255,255,.72)] sm:rounded-3xl sm:p-5"><p className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-[#6474A5] sm:text-xs sm:tracking-[0.12em]">Removed</p><p className="mt-1 text-2xl font-bold leading-tight text-[#B56B78] sm:mt-2 sm:text-3xl">{removedCount}</p><p className="mt-1 hidden text-xs text-[#5D6F73] sm:block">Hidden with audit history</p></div>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200/70 bg-[#F7E6E8] px-4 py-3 text-sm text-[#8B3442] shadow-[inset_3px_3px_7px_rgba(181,107,120,.12),inset_-3px_-3px_7px_rgba(255,255,255,.65)]">{error}</div>}

      {filteredReviews.length === 0 ? (
        <div className="rounded-[2rem] border border-white/70 bg-[#E0E5EC] p-10 text-center shadow-[8px_8px_18px_rgba(163,177,198,.5),-8px_-8px_18px_rgba(255,255,255,.76)]"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E0E5EC] text-[#6474A5] shadow-[inset_4px_4px_8px_rgba(163,177,198,.45),inset_-4px_-4px_8px_rgba(255,255,255,.72)]"><ShieldAlert className="h-8 w-8" /></div><h2 className="mt-4 text-lg font-semibold text-[#193364]">No matching reviews</h2><p className="mt-1 text-sm text-[#5D6F73]">Try another moderation filter.</p></div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((review) => {
            const status = review.is_hidden
              ? { label: "Removed publicly", icon: EyeOff, tone: "removed" as const }
              : review.report_count > 0
                ? { label: "Awaiting review", icon: Flag, tone: "awaiting" as const }
                : { label: "Visible publicly", icon: Eye, tone: "visible" as const };
            const StatusIcon = status.icon;
            const statusStyles = {
              visible: "border-[#38B2AC]/40 bg-[#DDF3F0] text-[#176F6A] shadow-[inset_3px_3px_7px_rgba(56,178,172,.14),inset_-3px_-3px_7px_rgba(255,255,255,.68)]",
              awaiting: "border-[#E7A93B]/45 bg-[#F7EAC7] text-[#745B22] shadow-[inset_3px_3px_7px_rgba(190,157,75,.16),inset_-3px_-3px_7px_rgba(255,255,255,.62)]",
              removed: "border-[#B56B78]/40 bg-[#F4E1E5] text-[#8B3442] shadow-[inset_3px_3px_7px_rgba(181,107,120,.14),inset_-3px_-3px_7px_rgba(255,255,255,.68)]",
            };
            return (
            <article key={review.id} className={`rounded-[2rem] border p-5 transition sm:p-6 ${review.is_hidden ? "border-slate-300/70 bg-[#D5DAE2] shadow-[inset_5px_5px_11px_rgba(163,177,198,.4),inset_-5px_-5px_11px_rgba(255,255,255,.65)]" : "border-white/70 bg-[#E0E5EC] shadow-[8px_8px_18px_rgba(163,177,198,.5),-8px_-8px_18px_rgba(255,255,255,.76)]"}`}>
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-[#193364]">{review.establishment_name}</h2><span className="rounded-full bg-[#E0E5EC] px-2.5 py-1 text-xs font-semibold text-[#6474A5]">{review.rating}/5 stars</span><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status.tone]}`}><StatusIcon className="h-3 w-3" />{status.label}</span>{review.report_count > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-[#E7A93B]/45 bg-[#F7EAC7] px-2.5 py-1 text-xs font-semibold text-[#745B22]"><Flag className="h-3 w-3" />{review.report_count} report{review.report_count === 1 ? "" : "s"}</span>}</div>
                  <p className="mt-2 text-sm text-[#5D6F73]">{review.reviewer_name || "Anonymous visitor"} · {new Date(review.created_at).toLocaleString()}</p>
                  {review.comment ? <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-[#E0E5EC] p-4 text-sm leading-6 text-[#46586A] shadow-[inset_4px_4px_8px_rgba(163,177,198,.34),inset_-4px_-4px_8px_rgba(255,255,255,.7)]">{review.comment}</p> : <p className="mt-4 rounded-2xl bg-[#E0E5EC] p-4 text-sm italic text-[#6474A5] shadow-[inset_4px_4px_8px_rgba(163,177,198,.28),inset_-4px_-4px_8px_rgba(255,255,255,.65)]">No comment; rating only.</p>}
                  {review.latest_report_reason && <p className="mt-3 rounded-2xl border border-[#D5B66D]/50 bg-[#F4E8C8] p-3 text-sm text-[#745B22] shadow-[inset_3px_3px_7px_rgba(190,157,75,.16),inset_-3px_-3px_7px_rgba(255,255,255,.62)]"><span className="font-semibold">Latest report:</span> {review.latest_report_reason}</p>}
                  {review.moderation_reason && <p className="mt-3 rounded-2xl bg-[#D5DAE2] p-3 text-sm text-[#46586A] shadow-[inset_3px_3px_7px_rgba(163,177,198,.3),inset_-3px_-3px_7px_rgba(255,255,255,.62)]"><span className="font-semibold">Removal reason:</span> {review.moderation_reason}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
                  {!review.is_hidden ? <button type="button" onClick={() => void moderate(review, "remove")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#E0E5EC] px-4 py-2 text-sm font-semibold text-[#A74758] shadow-[5px_5px_10px_rgba(163,177,198,.48),-5px_-5px_10px_rgba(255,255,255,.7)] transition hover:text-[#8B3442] active:translate-y-px active:shadow-[inset_3px_3px_7px_rgba(163,177,198,.4),inset_-3px_-3px_7px_rgba(255,255,255,.7)]"><EyeOff className="h-4 w-4" />Remove publicly</button> : <button type="button" onClick={() => void moderate(review, "restore")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#E0E5EC] px-4 py-2 text-sm font-semibold text-[#0F4C75] shadow-[5px_5px_10px_rgba(163,177,198,.48),-5px_-5px_10px_rgba(255,255,255,.7)] transition hover:text-[#0B3B5C] active:translate-y-px active:shadow-[inset_3px_3px_7px_rgba(163,177,198,.4),inset_-3px_-3px_7px_rgba(255,255,255,.7)]"><Eye className="h-4 w-4" />Restore publicly</button>}
                  {review.report_count > 0 && <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#F4E8C8] px-4 py-2 text-xs font-semibold text-[#745B22] shadow-[inset_3px_3px_7px_rgba(190,157,75,.14),inset_-3px_-3px_7px_rgba(255,255,255,.6)]"><AlertTriangle className="h-4 w-4" />Reported content</span>}
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}

      {moderationTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#193364]/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !moderating) { setModerationTarget(null); setModerationReason(""); } }}>
          <section className="w-full max-w-lg rounded-[2rem] border border-white/75 bg-[#E0E5EC] p-6 shadow-[14px_14px_30px_rgba(25,51,100,.28),-10px_-10px_24px_rgba(255,255,255,.78)] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="remove-review-title">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E0E5EC] text-[#A74758] shadow-[inset_4px_4px_8px_rgba(163,177,198,.42),inset_-4px_-4px_8px_rgba(255,255,255,.72)]"><EyeOff className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6474A5]">Moderation action</p><h2 id="remove-review-title" className="mt-1 text-xl font-bold text-[#193364]">Remove this review?</h2></div></div>
              <button type="button" onClick={() => { if (!moderating) { setModerationTarget(null); setModerationReason(""); } }} disabled={moderating} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E0E5EC] text-[#6474A5] shadow-[4px_4px_8px_rgba(163,177,198,.42),-4px_-4px_8px_rgba(255,255,255,.7)] transition hover:text-[#193364] active:shadow-[inset_3px_3px_6px_rgba(163,177,198,.4),inset_-3px_-3px_6px_rgba(255,255,255,.7)] disabled:opacity-50" aria-label="Close removal confirmation"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-5 text-sm leading-6 text-[#5D6F73]">Remove the review from the public site? Use this only for content that violates the community rules. The original review will be preserved in the moderation record.</p>
            <div className="mt-5"><label htmlFor="moderation-reason" className="text-sm font-semibold text-[#193364]">Removal reason <span className="font-normal text-[#A74758]">(required)</span></label><textarea id="moderation-reason" value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} disabled={moderating} maxLength={500} rows={3} placeholder="Explain which community rule was violated" className="mt-2 w-full resize-y rounded-2xl border border-white/70 bg-[#E0E5EC] p-4 text-sm leading-6 text-[#46586A] outline-none shadow-[inset_4px_4px_9px_rgba(163,177,198,.42),inset_-4px_-4px_9px_rgba(255,255,255,.72)] placeholder:text-[#8290A0] focus:border-[#6C63FF]/50 focus:ring-2 focus:ring-[#6C63FF]/20" /> <p className="mt-1 text-right text-xs text-[#6474A5]">{moderationReason.length}/500</p></div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setModerationTarget(null); setModerationReason(""); }} disabled={moderating} className="min-h-11 rounded-2xl bg-[#E0E5EC] px-5 py-2.5 text-sm font-semibold text-[#193364] shadow-[5px_5px_10px_rgba(163,177,198,.48),-5px_-5px_10px_rgba(255,255,255,.72)] transition hover:text-[#6C63FF] active:shadow-[inset_3px_3px_7px_rgba(163,177,198,.4),inset_-3px_-3px_7px_rgba(255,255,255,.7)] disabled:opacity-50">Cancel</button><button type="button" onClick={() => moderationTarget && void executeModeration(moderationTarget.review, moderationTarget.action, moderationReason)} disabled={moderating || moderationReason.trim().length < 3} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#A74758] px-5 py-2.5 text-sm font-semibold text-white shadow-[5px_5px_10px_rgba(163,177,198,.48),-5px_-5px_10px_rgba(255,255,255,.72)] transition hover:bg-[#8B3442] active:translate-y-px active:shadow-[inset_3px_3px_7px_rgba(93,38,51,.4),inset_-3px_-3px_7px_rgba(255,255,255,.35)] disabled:cursor-not-allowed disabled:opacity-50">{moderating ? <><Loader2 className="h-4 w-4 animate-spin" />Removing...</> : <><EyeOff className="h-4 w-4" />Remove review</>}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
