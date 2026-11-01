import { describe, expect, it } from "vitest";
import { formatPhilippineDateTime } from "./aiInsights";

describe("formatPhilippineDateTime", () => {
  it("interprets timezone-less server timestamps as UTC", () => {
    expect(formatPhilippineDateTime("2026-11-01T17:37:55.355")).toBe("Nov 2, 2026, 1:37 AM PHT");
  });

  it("preserves timestamps that already include an explicit timezone", () => {
    expect(formatPhilippineDateTime("2026-11-01T17:37:55.355Z")).toBe("Nov 2, 2026, 1:37 AM PHT");
    expect(formatPhilippineDateTime("2026-11-02T01:37:55.355+08:00")).toBe("Nov 2, 2026, 1:37 AM PHT");
  });
});
