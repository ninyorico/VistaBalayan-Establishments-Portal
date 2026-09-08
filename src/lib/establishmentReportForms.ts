export type ReportingMode = "accommodation" | "visitor" | "both";

export interface EstablishmentReportFormSource {
  type?: string | null;
  reporting_mode?: ReportingMode | null;
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
  "apartel",
  "apartelle",
  "condotel",
  "homestay",
  "pension house",
  "serviced residence",
  "tourist inn",
]);

const isAccommodationType = (establishment?: EstablishmentReportFormSource | null) =>
  accommodationTypes.has(normalize(establishment?.type));

export const getEstablishmentReportingMode = (establishment?: EstablishmentReportFormSource | null): ReportingMode => {
  if (establishment?.reporting_mode === "accommodation" || establishment?.reporting_mode === "visitor" || establishment?.reporting_mode === "both") {
    return establishment.reporting_mode;
  }
  return Number(establishment?.total_rooms || 0) > 0 || isAccommodationType(establishment) ? "accommodation" : "visitor";
};

export const isAccommodationEstablishment = (establishment?: EstablishmentReportFormSource | null) =>
  getEstablishmentReportingMode(establishment) !== "visitor";

export const canSubmitAccommodationReport = (establishment?: EstablishmentReportFormSource | null) =>
  Boolean(establishment && isAccommodationEstablishment(establishment));

export const canSubmitVisitorReport = (establishment?: EstablishmentReportFormSource | null) =>
  Boolean(establishment && getEstablishmentReportingMode(establishment) !== "accommodation");

export const getPrimaryReportFormLabel = (establishment?: EstablishmentReportFormSource | null) => {
  const mode = getEstablishmentReportingMode(establishment);
  if (mode === "both") return "Accommodation and visitor reports";
  if (mode === "accommodation") return "Digital DAE-1A accommodation report";
  return "Daily Tourist Arrival Encoding";
};
