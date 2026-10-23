import { supabase } from "./supabase";
import { downloadOfficialArrivalsWorkbook } from "./officialArrivalsExport";
import type { AccommodationSourceRecord, EstablishmentReportingRow, VisitorSourceRecord } from "./reporting";

type ExportSection = "daytour" | "overnight";

const pageSize = 1000;

const fetchAll = async <T,>(table: "establishments" | "visitor_reports" | "accommodation_reports", select: string) => {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = supabase
      .from(table)
      .select(select)
      .order(table === "establishments" ? "name" : "report_date", { ascending: table === "establishments" });
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...((data || []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};


export async function downloadReportMonitoringWorkbook({
  section,
  year,
  selectedMonths,
  specificMonth,
  establishmentNames,
}: {
  section: ExportSection;
  year?: number;
  selectedMonths?: number[];
  specificMonth?: string;
  establishmentNames?: string[];
}) {
  const establishments = await fetchAll<EstablishmentReportingRow>(
    "establishments",
    "id,name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number"
  );
  const establishmentFilterActive = establishmentNames !== undefined;
  const selectedNames = establishmentNames?.map((name) => name.trim().toLowerCase()).filter(Boolean) || [];
  const matchesEstablishment = (name: unknown) =>
    !establishmentFilterActive || selectedNames.includes(String(name || "").trim().toLowerCase());
  const relatedEstablishmentName = (row: any) => {
    const related = Array.isArray(row?.establishments) ? row.establishments[0] : row?.establishments;
    return related?.name;
  };
  const filteredEstablishments = establishmentFilterActive
    ? establishments.filter((establishment) => matchesEstablishment(establishment.name))
    : establishments;

  if (section === "daytour") {
    const visitors = await fetchAll<VisitorSourceRecord>(
      "visitor_reports",
      "*, establishments!visitor_reports_establishment_id_fkey (name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number)"
    );
    const latestYear = visitors.reduce((latest, row) => Math.max(latest, Number(row.report_date.slice(0, 4))), new Date().getFullYear());
    const exportYear = year ?? (specificMonth ? Number(specificMonth.slice(0, 4)) : latestYear);
    const exportMonths = selectedMonths ?? (specificMonth ? [Number(specificMonth.slice(5, 7))] : undefined);
    const exportLabel = exportMonths?.length === 1
      ? `${exportYear}-${String(exportMonths[0]).padStart(2, "0")}`
      : exportMonths?.length === 3 ? `${exportYear}-Q${Math.floor((exportMonths[0] - 1) / 3) + 1}` : String(exportYear);
    await downloadOfficialArrivalsWorkbook({
      filename: `Balayan_Resort_Daytour_Arrivals_${exportLabel}.xlsx`,
      year: exportYear,
      selectedMonths: exportMonths,
      exportSection: "daytour",
      establishments: filteredEstablishments,
      visitors: establishmentFilterActive
        ? visitors.filter((row) => matchesEstablishment(relatedEstablishmentName(row)))
        : visitors,
      accommodation: [],
    });
    return;
  }

  const accommodation = await fetchAll<AccommodationSourceRecord>(
    "accommodation_reports",
    "*, establishments!accommodation_reports_establishment_id_fkey (name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number)"
  );
  const latestYear = accommodation.reduce((latest, row) => Math.max(latest, Number(row.report_date.slice(0, 4))), new Date().getFullYear());
  const exportYear = year ?? (specificMonth ? Number(specificMonth.slice(0, 4)) : latestYear);
  const exportMonths = selectedMonths ?? (specificMonth ? [Number(specificMonth.slice(5, 7))] : undefined);
  const exportLabel = exportMonths?.length === 1
    ? `${exportYear}-${String(exportMonths[0]).padStart(2, "0")}`
    : exportMonths?.length === 3 ? `${exportYear}-Q${Math.floor((exportMonths[0] - 1) / 3) + 1}` : String(exportYear);
  await downloadOfficialArrivalsWorkbook({
    filename: `Balayan_Overnight_Arrivals_${exportLabel}.xlsx`,
    year: exportYear,
    selectedMonths: exportMonths,
    exportSection: "overnight",
    establishments: filteredEstablishments,
    visitors: [],
    accommodation: establishmentFilterActive
      ? accommodation.filter((row) => matchesEstablishment(relatedEstablishmentName(row)))
      : accommodation,
  });
}
