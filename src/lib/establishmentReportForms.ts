export interface EstablishmentReportFormSource {
  type?: string | null;
  total_rooms?: number | null;
}

const normalize = (value?: string | null) => (value || "").trim().toLowerCase();

const accommodationTypes = new Set([
  "accommodation",
  "accommodation establishment",
  "hotel",
  "lodge",
  "inn",
  "motel",
  "apartelle",
  "hostel",
]);

const isAccommodationType = (establishment?: EstablishmentReportFormSource | null) =>
  accommodationTypes.has(normalize(establishment?.type));

export const isAccommodationEstablishment = (establishment?: EstablishmentReportFormSource | null) =>
  Boolean(establishment && isAccommodationType(establishment));

export const canSubmitAccommodationReport = (establishment?: EstablishmentReportFormSource | null) => {
  if (!establishment) return false;

  // Hotel/accommodation categories always use hotel analytics and the hotel form.
  // If their room count has not been configured yet, the form lets staff set it up
  // instead of incorrectly falling back to resort visitor demographics.
  return isAccommodationEstablishment(establishment);
};

export const canSubmitVisitorReport = (establishment?: EstablishmentReportFormSource | null) => {
  if (!establishment) return false;

  // Resorts and other non-accommodation categories use visitor counts,
  // demographics, and monthly arrivals. Hotel/accommodation accounts should
  // not show demographics analytics.
  return !canSubmitAccommodationReport(establishment);
};

export const getPrimaryReportFormLabel = (establishment?: EstablishmentReportFormSource | null) => {
  if (canSubmitAccommodationReport(establishment)) return "Hotel accommodation report";
  if (canSubmitVisitorReport(establishment)) return "Resort visitor report";
  return "Tourism report";
};
