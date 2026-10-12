import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Flag, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-3xl font-bold text-[#193364]">Review moderation</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5D6F73]">Review public comments reported by visitors and remove content that violates the community rules. Removal hides the review publicly and keeps an audit record.</p>
        </div>
        <button type="button" onClick={() => void loadReviews()} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E0E5EC] px-4 py-2 text-sm font-semibold text-[#193364] shadow-[4px_4px_8px_rgba(163,177,198,.45),-4px_-4px_8px_rgba(255,255,255,.6)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {reviews.length === 0 ? (
        <div className="rounded-3xl border border-[#AFB3B5]/45 bg-[#F5F8FF] p-10 text-center shadow-tourism"><ShieldAlert className="mx-auto h-10 w-10 text-[#6474A5]" /><h2 className="mt-3 text-lg font-semibold text-[#193364]">No reviews to moderate</h2><p className="mt-1 text-sm text-[#5D6F73]">Public reviews and reports will appear here.</p></div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <article key={review.id} className={`rounded-3xl border p-5 shadow-tourism ${review.is_hidden ? "border-slate-300 bg-slate-100/80" : "border-[#AFB3B5]/45 bg-[#F5F8FF]"}`}>
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-[#193364]">{review.establishment_name}</h2><span className="rounded-full bg-[#E0E5EC] px-2.5 py-1 text-xs font-semibold text-[#6474A5]">{review.rating}/5 stars</span>{review.report_count > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"><Flag className="h-3 w-3" />{review.report_count} report{review.report_count === 1 ? "" : "s"}</span>}{review.is_hidden && <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700"><EyeOff className="h-3 w-3" />Removed publicly</span>}</div>
                  <p className="mt-2 text-sm text-[#5D6F73]">{review.reviewer_name || "Anonymous visitor"} · {new Date(review.created_at).toLocaleString()}</p>
                  {review.comment ? <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">{review.comment}</p> : <p className="mt-4 text-sm italic text-slate-500">No comment; rating only.</p>}
                  {review.latest_report_reason && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><span className="font-semibold">Latest report:</span> {review.latest_report_reason}</p>}
                  {review.moderation_reason && <p className="mt-3 rounded-2xl bg-slate-200/80 p-3 text-sm text-slate-700"><span className="font-semibold">Removal reason:</span> {review.moderation_reason}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
                  {!review.is_hidden ? <button type="button" onClick={() => void moderate(review, "remove")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"><EyeOff className="h-4 w-4" />Remove publicly</button> : <button type="button" onClick={() => void moderate(review, "restore")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F4C75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B3B5C]"><Eye className="h-4 w-4" />Restore publicly</button>}
                  {review.report_count > 0 && <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800"><AlertTriangle className="h-4 w-4" />Reported content</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
