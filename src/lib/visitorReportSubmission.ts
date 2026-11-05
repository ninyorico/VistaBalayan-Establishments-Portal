export interface VisitorReportIdentity {
  id?: string;
  guest_group_name?: string | null;
  residence_category?: string | null;
}

export interface VisitorReportReconciliationResult<T extends VisitorReportIdentity> {
  updates: Array<{ id: string; values: T }>;
  inserts: T[];
  deletes: string[];
}

const identityKey = (row: VisitorReportIdentity) => {
  const groupName = String(row.guest_group_name || "").trim();
  const category = String(row.residence_category || "").trim();
  return groupName && category ? `${groupName}::${category}` : null;
};

export function buildVisitorReportReconciliation<T extends VisitorReportIdentity>({
  existing,
  desired,
}: {
  existing: T[];
  desired: T[];
}): VisitorReportReconciliationResult<T> {
  const existingByKey = new Map<string, T>();
  existing.forEach((row) => {
    const key = identityKey(row);
    if (key) existingByKey.set(key, row);
  });

  const desiredKeys = new Set<string>();
  const updates: Array<{ id: string; values: T }> = [];
  const inserts: T[] = [];

  desired.forEach((row) => {
    const key = identityKey(row);
    if (!key) {
      inserts.push(row);
      return;
    }
    desiredKeys.add(key);
    const previous = existingByKey.get(key);
    if (previous?.id) updates.push({ id: previous.id, values: row });
    else inserts.push(row);
  });

  const deletes = existing
    .filter((row) => {
      const key = identityKey(row);
      return Boolean(key && !desiredKeys.has(key));
    })
    .flatMap((row) => row.id ? [row.id] : []);

  return { updates, inserts, deletes };
}
