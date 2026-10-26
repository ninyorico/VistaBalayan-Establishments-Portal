import { describe, expect, it } from "vitest";
import { classifyPerformance, inclusivePercentile } from "./performanceClassification";

describe("inclusivePercentile", () => {
  it("uses inclusive linear interpolation", () => {
    expect(inclusivePercentile([100, 200, 500, 800], 0.25)).toBe(175);
    expect(inclusivePercentile([100, 200, 500, 800], 0.75)).toBe(575);
  });

  it("returns null for an empty sample", () => {
    expect(inclusivePercentile([], 0.25)).toBeNull();
  });
});

describe("classifyPerformance", () => {
  it("classifies counts relative to P25 and P75", () => {
    const result = classifyPerformance(
      [
        { id: "a", name: "A", visitorCount: 100 },
        { id: "b", name: "B", visitorCount: 200 },
        { id: "c", name: "C", visitorCount: 500 },
        { id: "d", name: "D", visitorCount: 800 },
      ],
      2,
    );

    expect(result.thresholds).toEqual({ p25: 175, p75: 575 });
    expect(result.rows.map((row) => row.classification)).toEqual([
      "LOW",
      "MODERATE",
      "MODERATE",
      "HIGH",
    ]);
  });

  it("does not treat missing reports as zero and marks them insufficient", () => {
    const result = classifyPerformance(
      [
        { id: "a", name: "A", visitorCount: 100 },
        { id: "b", name: "B", visitorCount: null },
        { id: "c", name: "C", visitorCount: 500 },
      ],
      5,
    );

    expect(result.rows.every((row) => row.classification === "INSUFFICIENT_DATA")).toBe(true);
    expect(result.rows.find((row) => row.id === "b")?.visitorCount).toBeNull();
  });
});
