import { describe, expect, it } from "vitest";
import { buildVisitorReportReconciliation } from "./visitorReportSubmission";

describe("visitor report reconciliation", () => {
  it("updates the same group/category instead of inserting a duplicate", () => {
    const result = buildVisitorReportReconciliation({
      existing: [{ id: "old-1", guest_group_name: "Group A", residence_category: "THIS_PROVINCE" }],
      desired: [{ guest_group_name: "Group A", residence_category: "THIS_PROVINCE", total_visitors: 12 }],
    });

    expect(result.updates).toEqual([{ id: "old-1", values: result.updates[0].values }]);
    expect(result.inserts).toHaveLength(0);
    expect(result.deletes).toHaveLength(0);
    expect(result.updates[0].values.total_visitors).toBe(12);
  });

  it("inserts a new group while retaining the existing group", () => {
    const result = buildVisitorReportReconciliation({
      existing: [{ id: "old-1", guest_group_name: "Group A", residence_category: "THIS_PROVINCE" }],
      desired: [
        { guest_group_name: "Group A", residence_category: "THIS_PROVINCE", total_visitors: 5 },
        { guest_group_name: "Group B", residence_category: "THIS_PROVINCE", total_visitors: 3 },
      ],
    });

    expect(result.updates.map((item) => item.id)).toEqual(["old-1"]);
    expect(result.inserts).toHaveLength(1);
    expect(result.inserts[0].guest_group_name).toBe("Group B");
  });

  it("removes a previously saved category that is no longer in the edited group", () => {
    const result = buildVisitorReportReconciliation({
      existing: [
        { id: "old-1", guest_group_name: "Group A", residence_category: "THIS_PROVINCE" },
        { id: "old-2", guest_group_name: "Group A", residence_category: "FOREIGN" },
      ],
      desired: [{ guest_group_name: "Group A", residence_category: "THIS_PROVINCE", total_visitors: 5 }],
    });

    expect(result.deletes).toEqual(["old-2"]);
  });
});
