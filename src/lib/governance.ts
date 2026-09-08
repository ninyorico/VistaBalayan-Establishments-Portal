import { supabase } from "./supabase";

export type UserRole = "municipal_officer" | "establishment_staff";
export type ReportStatus = "draft" | "pending" | "submitted" | "under_review" | "validated" | "needs_review" | "on_hold" | "approved" | "rejected" | "archived";
export type ReportTable = "visitor_reports" | "accommodation_reports";

export interface AuditLogEntry {
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  previous_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  notes?: string | null;
}

export const roleHomePath = (role?: string | null) => {
  if (role === "municipal_officer") return "/officer";
  if (role === "establishment_staff") return "/staff";
  return "/admin/login";
};

export const normalizeReportStatus = (status?: string | null): ReportStatus => {
  const normalized = String(status || "pending").toLowerCase().replace(/\s+/g, "_");
  if (["draft", "pending", "submitted", "under_review", "validated", "needs_review", "on_hold", "approved", "rejected", "archived"].includes(normalized)) {
    return normalized as ReportStatus;
  }
  return "pending";
};

export const reportStatusLabel = (status?: string | null) =>
  normalizeReportStatus(status)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const reportStatusClasses: Record<ReportStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  pending: "bg-yellow-100 text-yellow-700 ring-yellow-200",
  submitted: "bg-yellow-100 text-yellow-700 ring-yellow-200",
  under_review: "bg-blue-100 text-blue-700 ring-blue-200",
  validated: "bg-green-100 text-green-700 ring-green-200",
  needs_review: "bg-orange-100 text-orange-700 ring-orange-200",
  on_hold: "bg-orange-100 text-orange-700 ring-orange-200",
  approved: "bg-green-100 text-green-700 ring-green-200",
  rejected: "bg-red-100 text-red-700 ring-red-200",
  archived: "bg-slate-100 text-slate-700 ring-slate-200",
};

export const ensureMunicipalOfficer = async () => {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("You must be logged in as a municipal tourism officer.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "municipal_officer") {
    throw new Error("Only municipal tourism officers can perform this action.");
  }

  return { user, profile };
};

export const createAuditLog = async (entry: AuditLogEntry) => {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: entry.actor_id || null,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id || null,
    previous_values: entry.previous_values || null,
    new_values: entry.new_values || null,
    notes: entry.notes || null,
  });

  // Audit logging should improve traceability but must not block the officer workflow
  // on older databases that have not received the audit_logs migration yet.
  if (error) console.warn("Audit log was not saved:", error.message);
};

export const updateReportStatusWithAudit = async ({
  table,
  id,
  status,
  notes,
  action,
}: {
  table: ReportTable;
  id: string;
  status: ReportStatus;
  notes?: string | null;
  action?: string;
}) => {
  const { user } = await ensureMunicipalOfficer();

  const { data: before } = await supabase
    .from(table)
    .select("id,status,notes,reviewed_by,reviewed_at")
    .eq("id", id)
    .maybeSingle();

  const reviewedAt = new Date().toISOString();
  const updatePayload = {
    status,
    reviewed_by: user.id,
    reviewed_at: reviewedAt,
    notes: notes || null,
  };

  const { error } = await supabase
    .from(table)
    .update(updatePayload)
    .eq("id", id);

  if (error) throw error;

  await createAuditLog({
    actor_id: user.id,
    action: action || `report_${status}`,
    entity_type: table,
    entity_id: id,
    previous_values: before || null,
    new_values: updatePayload,
    notes: notes || null,
  });
};

export const calculateAverageResolutionHours = (reports: Array<{ created_at?: string | null; reviewed_at?: string | null; status?: string | null }>) => {
  const resolved = reports
    .filter((report) => ["approved", "rejected"].includes(normalizeReportStatus(report.status)))
    .map((report) => {
      const created = report.created_at ? new Date(report.created_at).getTime() : NaN;
      const reviewed = report.reviewed_at ? new Date(report.reviewed_at).getTime() : NaN;
      if (!Number.isFinite(created) || !Number.isFinite(reviewed) || reviewed < created) return null;
      return (reviewed - created) / (1000 * 60 * 60);
    })
    .filter((hours): hours is number => typeof hours === "number");

  if (!resolved.length) return 0;
  return resolved.reduce((sum, hours) => sum + hours, 0) / resolved.length;
};

export const confidenceTone = (confidence?: number | null) => {
  const value = Number(confidence || 0);
  if (value >= 0.8) return "High confidence";
  if (value >= 0.55) return "Medium confidence";
  if (value > 0) return "Low confidence - review needed";
  return "Needs human review";
};
