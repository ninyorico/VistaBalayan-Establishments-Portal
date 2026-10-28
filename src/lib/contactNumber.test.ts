import { describe, expect, it } from "vitest";
import { isValidContactNumber, sanitizeContactNumber } from "./contactNumber";

describe("contact number validation", () => {
  it("accepts exactly eleven digits", () => {
    expect(isValidContactNumber("09171234567")).toBe(true);
  });

  it("rejects letters, symbols, short values, and extra digits", () => {
    expect(isValidContactNumber("0917123456")).toBe(false);
    expect(isValidContactNumber("091712345678")).toBe(false);
    expect(isValidContactNumber("0917123456a")).toBe(false);
    expect(isValidContactNumber("0917-123-4567")).toBe(false);
  });

  it("keeps only the first eleven numeric digits while typing", () => {
    expect(sanitizeContactNumber("0917-123-456789")).toBe("09171234567");
  });
});
