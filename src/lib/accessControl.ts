export type StaffAccessSnapshot = {
  role?: string | null;
  status?: string | null;
  establishmentStatus?: string | null;
  establishmentId?: string | null;
};

export const isActiveEstablishmentStaff = (snapshot: StaffAccessSnapshot) =>
  snapshot.role === "establishment_staff" &&
  snapshot.status === "active" &&
  snapshot.establishmentStatus === "active" &&
  snapshot.establishmentId !== null;
