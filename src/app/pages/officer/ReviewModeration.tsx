import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Flag, Loader2, MessageSquareWarning, RefreshCw, ShieldAlert } from "lucide-react";
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

export default function ReviewModeration() {
  const [reviews, setReviews] = useState<ModerationReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const moderate = async (review: ModerationReview, action: "remove" | "restore") => {
    if (action === "remove" && review.report_count < 1 && !window.confirm("Remove this review from the public site? Use this only for content that violates the community rules.")) return;
    const reason = action === "remove"
      ? window.prompt("Why is this review being removed?", review.latest_report_reason || "Violates public review rules")
      : null;
    if (action === "remove" && !reason?.trim()) return;
    const { error: moderateError } = await supabase.rpc("moderate_establishment_rating", {
      p_rating_id: review.id,
      p_action: action,
      p_reason: reason?.trim() || null,
    });
    if (moderateError) {
      setError(moderateError.message);
      return;
    }
    await loadReviews();
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-3 text-[#6474A5]"><Loader2 className="h-5 w-5 animate-spin" />Loading review moderation...</div>;

  const reportedCount = reviews.filter((review) => review.report_count > 0 && !review.is_hidden).length;
  const removedCount = reviews.filter((review) => review.is_hidden).length;
  const visibleCount = reviews.length - removedCount;

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
          <button type="button" onClick={() => void loadReviews()} disabled={refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#E0E5EC] px-5 py-2.5 text-sm font-semibold text-[#193364] shadow-[5px_5px_10px_rgba(163,177,198,.5),-5px_-5px_10px_rgba(255,255,255,.75)] transition hover:text-[#6C63FF] active:translate-y-px active:shadow-[inset_3px_3px_7px_rgba(163,177,198,.45),inset_-3px_-3px_7px_rgba(255,255,255,.75)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh reviews</button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/70 bg-[#E0E5EC] p-5 shadow-[7px_7px_14px_rgba(163,177,198,.48),-7px_-7px_14px_rgba(255,255,255,.72)]"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6474A5]">Awaiting review</p><p className="mt-2 text-3xl font-bold text-[#193364]">{reportedCount}</p><p className="mt-1 text-xs text-[#5D6F73]">Reported public reviews</p></div>
        <div className="rounded-3xl border border-white/70 bg-[#E0E5EC] p-5 shadow-[7px_7px_14px_rgba(163,177,198,.48),-7px_-7px_14px_rgba(255,255,255,.72)]"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6474A5]">Visible reviews</p><p className="mt-2 text-3xl font-bold text-[#38B2AC]">{visibleCount}</p><p className="mt-1 text-xs text-[#5D6F73]">Currently shown publicly</p></div>
        <div className="rounded-3xl border border-white/70 bg-[#E0E5EC] p-5 shadow-[7px_7px_14px_rgba(163,177,198,.48),-7px_-7px_14px_rgba(255,255,255,.72)]"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6474A5]">Removed</p><p className="mt-2 text-3xl font-bold text-[#B56B78]">{removedCount}</p><p className="mt-1 text-xs text-[#5D6F73]">Hidden with audit history</p></div>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200/70 bg-[#F7E6E8] px-4 py-3 text-sm text-[#8B3442] shadow-[inset_3px_3px_7px_rgba(181,107,120,.12),inset_-3px_-3px_7px_rgba(255,255,255,.65)]">{error}</div>}

      {reviews.length === 0 ? (
        <div className="rounded-[2rem] border border-white/70 bg-[#E0E5EC] p-10 text-center shadow-[8px_8px_18px_rgba(163,177,198,.5),-8px_-8px_18px_rgba(255,255,255,.76)]"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E0E5EC] text-[#6474A5] shadow-[inset_4px_4px_8px_rgba(163,177,198,.45),inset_-4px_-4px_8px_rgba(255,255,255,.72)]"><ShieldAlert className="h-8 w-8" /></div><h2 className="mt-4 text-lg font-semibold text-[#193364]">No reviews to moderate</h2><p className="mt-1 text-sm text-[#5D6F73]">Public reviews and reports will appear here.</p></div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <article key={review.id} className={`rounded-[2rem] border p-5 transition sm:p-6 ${review.is_hidden ? "border-slate-300/70 bg-[#D5DAE2] shadow-[inset_5px_5px_11px_rgba(163,177,198,.4),inset_-5px_-5px_11px_rgba(255,255,255,.65)]" : "border-white/70 bg-[#E0E5EC] shadow-[8px_8px_18px_rgba(163,177,198,.5),-8px_-8px_18px_rgba(255,255,255,.76)]"}`}>
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-[#193364]">{review.establishment_name}</h2><span className="rounded-full bg-[#E0E5EC] px-2.5 py-1 text-xs font-semibold text-[#6474A5]">{review.rating}/5 stars</span>{review.report_count > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"><Flag className="h-3 w-3" />{review.report_count} report{review.report_count === 1 ? "" : "s"}</span>}{review.is_hidden && <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"><EyeOff className="h-3 w-3" />Removed publicly</span>}</div>
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
          ))}
        </div>
      )}
    </div>
  );
}
