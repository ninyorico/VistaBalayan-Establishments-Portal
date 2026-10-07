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
  specificMonth,
  establishmentNames,
}: {
  section: ExportSection;
  specificMonth?: string;
  establishmentNames?: string[];
}) {
  const establishments = await fetchAll<EstablishmentReportingRow>(
    "establishments",
    "id,name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number"
  );
  const selectedNames = establishmentNames?.map((name) => name.trim().toLowerCase()).filter(Boolean);
  const matchesEstablishment = (name: unknown) =>
    !selectedNames?.length || selectedNames.includes(String(name || "").trim().toLowerCase());
  const relatedEstablishmentName = (row: any) => {
    const related = Array.isArray(row?.establishments) ? row.establishments[0] : row?.establishments;
    return related?.name;
  };
  const filteredEstablishments = selectedNames?.length
    ? establishments.filter((establishment) => matchesEstablishment(establishment.name))
    : establishments;

  if (section === "daytour") {
    const visitors = await fetchAll<VisitorSourceRecord>(
      "visitor_reports",
      "*, establishments!visitor_reports_establishment_id_fkey (name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number)"
    );
    const year = specificMonth ? Number(specificMonth.slice(0, 4)) : visitors.reduce((latest, row) => Math.max(latest, Number(row.report_date.slice(0, 4))), new Date().getFullYear());
    const selectedMonth = specificMonth ? Number(specificMonth.slice(5, 7)) : undefined;
    await downloadOfficialArrivalsWorkbook({
      filename: specificMonth ? `Balayan_Resort_Daytour_Arrivals_${specificMonth}.xlsx` : `Balayan_Resort_Daytour_Arrivals_${year}.xlsx`,
      year,
      selectedMonths: selectedMonth ? [selectedMonth] : undefined,
      exportSection: "daytour",
      establishments: filteredEstablishments,
      visitors: selectedNames?.length
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
  const year = specificMonth ? Number(specificMonth.slice(0, 4)) : accommodation.reduce((latest, row) => Math.max(latest, Number(row.report_date.slice(0, 4))), new Date().getFullYear());
  const selectedMonth = specificMonth ? Number(specificMonth.slice(5, 7)) : undefined;
  await downloadOfficialArrivalsWorkbook({
    filename: specificMonth ? `Balayan_Overnight_Arrivals_${specificMonth}.xlsx` : `Balayan_Overnight_Arrivals_${year}.xlsx`,
    year,
    selectedMonths: selectedMonth ? [selectedMonth] : undefined,
    exportSection: "overnight",
    establishments: filteredEstablishments,
    visitors: [],
    accommodation: selectedNames?.length
      ? accommodation.filter((row) => matchesEstablishment(relatedEstablishmentName(row)))
      : accommodation,
  });
}
