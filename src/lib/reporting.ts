export type ReportingMode = "accommodation" | "visitor" | "both";
export type ReportStatus = "draft" | "submitted" | "validated" | "needs_review" | "on_hold" | "approved" | "rejected" | "archived";
export type ResidenceCategory = "THIS_PROVINCE" | "OTHER_PROVINCE" | "FOREIGN";

export const DAE_TYPE_CLASS: Record<string, string> = {
  apartel: "APA",
  apartelle: "APA",
  condotel: "CON",
  homestay: "HSS",
  hotel: "HTL",
  lodge: "OTH",
  motel: "MOT",
  "pension house": "PEN",
  resort: "RES",
  "serviced residence": "SER",
  "tourist inn": "TIN",
  inn: "TIN",
  others: "OTH",
  other: "OTH",
};

export const PROVINCE = "Batangas";
export const MUNICIPALITY = "Balayan";

export interface EstablishmentReportingRow {
  id: string;
  name: string;
  type?: string | null;
  reporting_mode?: ReportingMode | null;
  ae_id?: string | null;
  attraction_code?: string | null;
  total_rooms?: number | null;
  status?: string | null;
}

export interface AccommodationSourceRecord {
  id: string;
  establishment_id: string;
  report_date: string;
  total_rooms?: number | null;
  total_check_ins?: number | null;
  total_guest_nights?: number | null;
  total_occupied_rooms?: number | null;
  guest_check_ins?: number | null;
  guest_nights?: number | null;
  rooms_occupied?: number | null;
  foreign_guest_check_ins?: number | null;
  foreign_guest_nights?: number | null;
  status?: string | null;
  establishments?: EstablishmentReportingRow | EstablishmentReportingRow[] | null;
}

export interface VisitorSourceRecord {
  id: string;
  establishment_id: string;
  report_date: string;
  guest_group_name?: string | null;
  guest_name?: string | null;
  male_visitors?: number | null;
  female_visitors?: number | null;
  total_visitors?: number | null;
  total_male?: number | null;
  total_female?: number | null;
  total_guests?: number | null;
  residence_category?: ResidenceCategory | null;
  residence_type?: string | null;
  municipality?: string | null;
  province?: string | null;
  country?: string | null;
  status?: string | null;
  establishments?: EstablishmentReportingRow | EstablishmentReportingRow[] | null;
}

export interface AccommodationSummary {
  establishmentId: string;
  establishmentName: string;
  aeId: string;
  typeClass: string;
  totalRooms: number;
  daysInPeriod: number;
  guestCheckIns: number;
  guestNights: number;
  roomsOccupied: number;
  foreignGuestCheckIns: number;
  foreignGuestNights: number;
  availableRoomNights: number;
  occupancyRate: number;
  averageLengthOfStay: number;
  averageGuestsPerOccupiedRoom: number;
  sourceRecords: AccommodationSourceRecord[];
  status: "missing" | "incomplete" | "needs_review" | "validated";
}

export interface VisitorSummary {
  establishmentId: string;
  establishmentName: string;
  attractionCode: string;
  thisProvince: VisitorBucket;
  otherProvince: VisitorBucket;
  foreign: VisitorBucket;
  grandTotal: VisitorBucket;
  sourceRecords: VisitorSourceRecord[];
  status: "missing" | "incomplete" | "needs_review" | "validated";
}

export interface VisitorBucket { male: number; female: number; total: number }

const numeric = (value: unknown) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const joinedEstablishment = (value: AccommodationSourceRecord["establishments"] | VisitorSourceRecord["establishments"]) =>
  Array.isArray(value) ? value[0] : value || undefined;

export const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

export const periodBounds = (year: number, month: number) => ({
  start: `${year}-${String(month).padStart(2, "0")}-01`,
  end: `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
});

export const safeRatio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;

export const getTypeClass = (type?: string | null) => DAE_TYPE_CLASS[String(type || "").trim().toLowerCase()] || "OTH";

export const getReportingMode = (establishment?: Pick<EstablishmentReportingRow, "reporting_mode" | "total_rooms"> | null): ReportingMode => {
  if (establishment?.reporting_mode === "accommodation" || establishment?.reporting_mode === "visitor" || establishment?.reporting_mode === "both") {
    return establishment.reporting_mode;
  }
  return numeric(establishment?.total_rooms) > 0 ? "accommodation" : "visitor";
};

const accommodationValues = (record: AccommodationSourceRecord) => ({
  guestCheckIns: numeric(record.guest_check_ins ?? record.total_check_ins),
  guestNights: numeric(record.guest_nights ?? record.total_guest_nights),
  roomsOccupied: numeric(record.rooms_occupied ?? record.total_occupied_rooms),
  foreignGuestCheckIns: numeric(record.foreign_guest_check_ins),
  foreignGuestNights: numeric(record.foreign_guest_nights),
});

export const validateAccommodationRecord = (record: AccommodationSourceRecord, totalRooms: number) => {
  const errors: string[] = [];
  const values = accommodationValues(record);
  const date = new Date(`${record.report_date}T00:00:00`);
  if (!record.report_date || Number.isNaN(date.getTime())) errors.push("Report date is invalid");
  for (const [label, value] of Object.entries(values)) if (value < 0) errors.push(`${label} cannot be negative`);
  if (values.guestNights < values.guestCheckIns) errors.push("Guest nights cannot be lower than guest check-ins");
  if (values.roomsOccupied > totalRooms) errors.push("Rooms occupied cannot exceed total rooms");
  if (values.foreignGuestCheckIns > values.guestCheckIns) errors.push("Foreign check-ins cannot exceed total check-ins");
  if (values.foreignGuestNights > values.guestNights) errors.push("Foreign guest nights cannot exceed total guest nights");
  return errors;
};

export const summarizeAccommodation = (
  establishment: EstablishmentReportingRow,
  records: AccommodationSourceRecord[],
  year: number,
  month: number,
): AccommodationSummary => {
  const days = daysInMonth(year, month);
  const totalRooms = numeric(establishment.total_rooms ?? records[0]?.total_rooms);
  const validatedRecords = records.filter((record) => ["validated", "approved"].includes(String(record.status || "").toLowerCase()));
  const sourceRecords = records.length ? records : [];
  const totals = validatedRecords.reduce((result, record) => {
    const values = accommodationValues(record);
    result.guestCheckIns += values.guestCheckIns;
    result.guestNights += values.guestNights;
    result.roomsOccupied += values.roomsOccupied;
    result.foreignGuestCheckIns += values.foreignGuestCheckIns;
    result.foreignGuestNights += values.foreignGuestNights;
    return result;
  }, { guestCheckIns: 0, guestNights: 0, roomsOccupied: 0, foreignGuestCheckIns: 0, foreignGuestNights: 0 });
  const availableRoomNights = totalRooms * days;
  const invalid = records.flatMap((record) => validateAccommodationRecord(record, totalRooms));
  const status = !records.length ? "missing" : invalid.length ? "needs_review" : validatedRecords.length !== records.length ? "incomplete" : "validated";
  return {
    establishmentId: establishment.id,
    establishmentName: establishment.name,
    aeId: establishment.ae_id || establishment.id,
    typeClass: getTypeClass(establishment.type),
    totalRooms,
    daysInPeriod: days,
    ...totals,
    availableRoomNights,
    occupancyRate: safeRatio(totals.roomsOccupied, availableRoomNights) * 100,
    averageLengthOfStay: safeRatio(totals.guestNights, totals.guestCheckIns),
    averageGuestsPerOccupiedRoom: safeRatio(totals.guestNights, totals.roomsOccupied),
    sourceRecords,
    status,
  };
};

const residenceCategory = (record: VisitorSourceRecord): ResidenceCategory | null => {
  if (record.residence_category) return record.residence_category;
  const value = String(record.residence_type || "").toLowerCase();
  if (value.includes("foreign") || value.includes("other")) return value.includes("foreign") ? "FOREIGN" : "OTHER_PROVINCE";
  if (value.includes("batangas") || value.includes("within")) return "THIS_PROVINCE";
  return null;
};

export const validateVisitorRecord = (record: VisitorSourceRecord) => {
  const male = numeric(record.male_visitors ?? record.total_male);
  const female = numeric(record.female_visitors ?? record.total_female);
  const suppliedTotal = record.total_visitors ?? record.total_guests;
  const errors: string[] = [];
  if (male < 0 || female < 0) errors.push("Visitor counts cannot be negative");
  if (suppliedTotal != null && numeric(suppliedTotal) !== male + female) errors.push("Total visitors must equal male plus female");
  if (!residenceCategory(record)) errors.push("Residence category is required");
  return errors;
};

export const summarizeVisitors = (establishment: EstablishmentReportingRow, records: VisitorSourceRecord[]): VisitorSummary => {
  const buckets: Record<ResidenceCategory, VisitorBucket> = {
    THIS_PROVINCE: { male: 0, female: 0, total: 0 },
    OTHER_PROVINCE: { male: 0, female: 0, total: 0 },
    FOREIGN: { male: 0, female: 0, total: 0 },
  };
  const finalized = records.filter((record) => ["validated", "approved"].includes(String(record.status || "").toLowerCase()));
  finalized.forEach((record) => {
    const category = residenceCategory(record);
    if (!category) return;
    const male = numeric(record.male_visitors ?? record.total_male);
    const female = numeric(record.female_visitors ?? record.total_female);
    buckets[category].male += male;
    buckets[category].female += female;
    buckets[category].total += male + female;
  });
  const grandTotal = (Object.keys(buckets) as ResidenceCategory[]).reduce((result, category) => {
    result.male += buckets[category].male;
    result.female += buckets[category].female;
    result.total += buckets[category].total;
    return result;
  }, { male: 0, female: 0, total: 0 });
  const invalid = records.flatMap(validateVisitorRecord);
  return {
    establishmentId: establishment.id,
    establishmentName: establishment.name,
    attractionCode: establishment.attraction_code || establishment.id,
    thisProvince: buckets.THIS_PROVINCE,
    otherProvince: buckets.OTHER_PROVINCE,
    foreign: buckets.FOREIGN,
    grandTotal,
    sourceRecords: records,
    status: !records.length ? "missing" : invalid.length ? "needs_review" : finalized.length !== records.length ? "incomplete" : "validated",
  };
};

export interface DAE4Row {
  typeClass: string;
  establishments: number;
  totalRooms: number;
  domesticGuestArrivals: number;
  foreignGuestArrivals: number;
  totalGuestArrivals: number;
  totalGuestNights: number;
  totalRoomsOccupied: number;
  availableRoomNights: number;
  averageOccupancyRate: number;
  averageLengthOfStay: number;
}

export const summarizeDAE4 = (summaries: AccommodationSummary[]): DAE4Row[] => {
  const grouped = new Map<string, AccommodationSummary[]>();
  summaries.filter((summary) => summary.status === "validated").forEach((summary) => grouped.set(summary.typeClass, [...(grouped.get(summary.typeClass) || []), summary]));
  return [...grouped.entries()].map(([typeClass, rows]) => {
    const totalRooms = rows.reduce((sum, row) => sum + row.totalRooms, 0);
    const foreignGuestArrivals = rows.reduce((sum, row) => sum + row.foreignGuestCheckIns, 0);
    const totalGuestArrivals = rows.reduce((sum, row) => sum + row.guestCheckIns, 0);
    const totalGuestNights = rows.reduce((sum, row) => sum + row.guestNights, 0);
    const totalRoomsOccupied = rows.reduce((sum, row) => sum + row.roomsOccupied, 0);
    const availableRoomNights = rows.reduce((sum, row) => sum + row.availableRoomNights, 0);
    return {
      typeClass, establishments: rows.length, totalRooms,
      domesticGuestArrivals: totalGuestArrivals - foreignGuestArrivals,
      foreignGuestArrivals, totalGuestArrivals, totalGuestNights, totalRoomsOccupied,
      availableRoomNights,
      averageOccupancyRate: safeRatio(totalRoomsOccupied, availableRoomNights) * 100,
      averageLengthOfStay: safeRatio(totalGuestNights, totalGuestArrivals),
    };
  }).sort((a, b) => a.typeClass.localeCompare(b.typeClass));
};

export const summarizeAnnualDAE4 = (summaries: AccommodationSummary[]) => {
  const byType = new Map<string, AccommodationSummary[]>();
  summaries.filter((summary) => summary.status === "validated").forEach((summary) => byType.set(summary.typeClass, [...(byType.get(summary.typeClass) || []), summary]));
  return [...byType.entries()].map(([typeClass, rows]) => {
    const total = (field: keyof AccommodationSummary) => rows.reduce((sum, row) => sum + numeric(row[field]), 0);
    const totalGuestArrivals = total("guestCheckIns");
    const totalGuestNights = total("guestNights");
    const occupied = total("roomsOccupied");
    const available = total("availableRoomNights");
    const foreign = total("foreignGuestCheckIns");
    return { typeClass, establishments: new Set(rows.map((row) => row.establishmentId)).size, totalRooms: rows.reduce((max, row) => Math.max(max, row.totalRooms), 0), domesticGuestArrivals: totalGuestArrivals - foreign, foreignGuestArrivals: foreign, totalGuestArrivals, totalGuestNights, totalRoomsOccupied: occupied, availableRoomNights: available, averageOccupancyRate: safeRatio(occupied, available) * 100, averageLengthOfStay: safeRatio(totalGuestNights, totalGuestArrivals) };
  }).sort((a, b) => a.typeClass.localeCompare(b.typeClass));
};

export const toCanonicalVisitorInsert = (input: { establishment_id: string; submitted_by: string; report_date: string; guest_group_name?: string | null; male_visitors: number; female_visitors: number; residence_category: ResidenceCategory; municipality?: string | null; province?: string | null; country?: string | null; status?: ReportStatus }) => ({
  establishment_id: input.establishment_id,
  submitted_by: input.submitted_by,
  report_date: input.report_date,
  guest_group_name: input.guest_group_name || null,
  male_visitors: input.male_visitors,
  female_visitors: input.female_visitors,
  total_visitors: input.male_visitors + input.female_visitors,
  residence_category: input.residence_category,
  municipality: input.municipality || (input.residence_category === "THIS_PROVINCE" ? MUNICIPALITY : null),
  province: input.province || (input.residence_category !== "FOREIGN" ? PROVINCE : null),
  country: input.country || null,
  status: input.status || "submitted",
});

export const toCanonicalAccommodationInsert = (input: { establishment_id: string; submitted_by: string; report_date: string; total_rooms: number; guest_check_ins: number; guest_nights: number; rooms_occupied: number; foreign_guest_check_ins: number; foreign_guest_nights: number; status?: ReportStatus }) => ({
  establishment_id: input.establishment_id,
  submitted_by: input.submitted_by,
  report_date: input.report_date,
  total_rooms: input.total_rooms,
  guest_check_ins: input.guest_check_ins,
  guest_nights: input.guest_nights,
  rooms_occupied: input.rooms_occupied,
  foreign_guest_check_ins: input.foreign_guest_check_ins,
  foreign_guest_nights: input.foreign_guest_nights,
  status: input.status || "submitted",
});

export const buildVAR3MRow = (month: number, summaries: VisitorSummary[]) => {
  const total = summaries.reduce((result, summary) => {
    result.domesticMale += summary.thisProvince.male + summary.otherProvince.male;
    result.domesticFemale += summary.thisProvince.female + summary.otherProvince.female;
    result.foreignMale += summary.foreign.male;
    result.foreignFemale += summary.foreign.female;
    return result;
  }, { month, domesticMale: 0, domesticFemale: 0, foreignMale: 0, foreignFemale: 0 });
  return { ...total, grandTotal: total.domesticMale + total.domesticFemale + total.foreignMale + total.foreignFemale };
};
