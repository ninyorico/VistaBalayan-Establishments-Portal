import { describe, expect, it } from "vitest";

import { isActiveEstablishmentStaff } from "./accessControl";

describe("isActiveEstablishmentStaff", () => {
  it("allows staff only when both profile and establishment are active", () => {
    expect(isActiveEstablishmentStaff({ role: "establishment_staff", status: "active", establishmentStatus: "active" })).toBe(true);
  });

  it("denies inactive staff profiles", () => {
    expect(isActiveEstablishmentStaff({ role: "establishment_staff", status: "inactive", establishmentStatus: "active" })).toBe(false);
  });

  it("denies staff linked to an inactive establishment", () => {
    expect(isActiveEstablishmentStaff({ role: "establishment_staff", status: "active", establishmentStatus: "inactive" })).toBe(false);
  });

  it("denies unlinked staff and non-staff roles", () => {
    expect(isActiveEstablishmentStaff({ role: "establishment_staff", status: "active", establishmentStatus: "active", establishmentId: null })).toBe(false);
    expect(isActiveEstablishmentStaff({ role: "municipal_officer", status: "active", establishmentStatus: "active" })).toBe(false);
  });
});
