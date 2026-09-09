import { useEffect, useMemo, useState } from "react";
import * as ExcelJS from "exceljs";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import {
  buildVAR3MRow,
  daysInMonth,
  summarizeAccommodation,
  summarizeAnnualAccommodation,
  summarizeDAE4,
  summarizeAnnualDAE4,
  summarizeVisitors,
  type AccommodationSourceRecord,

  type EstablishmentReportingRow,
  type VisitorSourceRecord,
  type VisitorSummary,
} from "../../../lib/reporting";

const months = Array.from({ length: 12 }, (_, index) => new Date(2000, index, 1).toLocaleString("en-US", { month: "long" }));
const currentYear = new Date().getFullYear();
const statusLabel = (status: string) => status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const isFinalized = (status?: string | null) => ["validated", "approved"].includes(String(status || "").toLowerCase());

const downloadBuffer = (filename: string, buffer: ArrayBuffer | Uint8Array) => {
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizeExportName = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const exportNameAliases: Record<string, string> = {
  MYPLACERESORTPAVILLION: "MYPLACERESORTPAVILLION",
  MYPLACERESORTPAVILION: "MYPLACERESORTPAVILLION",
  VILLABEADOYRESORTPAVILION: "VILLABEADOYRESORTPAVILLION",
  VILLABEADOYRESORTPAVILLION: "VILLABEADOYRESORTPAVILLION",
  SOGGIORNOLORENZANA: "SOGGIORNS",
};
const exportNameKey = (value: string) => exportNameAliases[normalizeExportName(value)] || normalizeExportName(value);

const finalizedRecords = <T extends { status?: string | null }>(records: T[]) => records.filter((record) => isFinalized(record.status));
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;

const downloadOfficialArrivalsWorkbook = async ({
  filename,
  year,
  selectedMonth,
  establishments,
  accommodation,
  visitors,
}: {
  filename: string;
  year: number;
  selectedMonth?: number;
  establishments: EstablishmentReportingRow[];
  accommodation: AccommodationSourceRecord[];
  visitors: VisitorSourceRecord[];
}) => {
  const template = await fetch("/templates/Balayan_Official_Arrivals_Template.xlsx");
  if (!template.ok) throw new Error(`Official arrivals template could not be loaded (${template.status})`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await template.arrayBuffer());
  const sheets = workbook.worksheets.filter((sheet) => sheet.name !== "GRAND TOTAL");
  const monthsToWrite = sheets;
  const establishmentByKey = new Map(establishments.map((establishment) => [exportNameKey(establishment.name), establishment]));

  const visitorFor = (establishment: EstablishmentReportingRow, monthNumber: number) => summarizeVisitors(establishment, finalizedRecords(visitors.filter((record) => record.establishment_id === establishment.id && record.report_date?.startsWith(`${year}-${String(monthNumber).padStart(2, "0")}`))));
  const accommodationFor = (establishment: EstablishmentReportingRow, monthNumber: number) => summarizeAccommodation(establishment, finalizedRecords(accommodation.filter((record) => record.establishment_id === establishment.id && record.report_date?.startsWith(`${year}-${String(monthNumber).padStart(2, "0")}`))), year, monthNumber);

  for (const sheet of monthsToWrite) {
    const monthNumber = months.findIndex((value) => sheet.name.startsWith(value.toUpperCase())) + 1;
    if (!monthNumber) continue;
    const includeData = !selectedMonth || selectedMonth === monthNumber;
    sheet.getCell("H4").value = new Date(Date.UTC(year, monthNumber - 1, 1));
    sheet.getCell("I4").value = new Date(Date.UTC(year, monthNumber - 1, 1));
    sheet.getCell("D41").value = new Date(Date.UTC(year, monthNumber - 1, 1));
    for (let column = 4; column <= 16; column += 1) sheet.getCell(41, column).value = new Date(Date.UTC(year, monthNumber - 1, 1));

    for (let rowNumber = 15; rowNumber <= 37; rowNumber += 1) {
      const name = String(sheet.getCell(rowNumber, 3).value || "").trim();
      if (!name || name === "TOURIST ATTRACTIONS") continue;
      const establishment = establishmentByKey.get(exportNameKey(name));
      const summary = includeData && establishment ? visitorFor(establishment, monthNumber) : null;
      const hasData = Boolean(summary && summary.status !== "missing");
      const values = hasData && summary ? [summary.thisProvince.male, summary.thisProvince.female, summary.thisProvince.total, summary.otherProvince.male, summary.otherProvince.female, summary.otherProvince.total, summary.foreign.male, summary.foreign.female, summary.foreign.total, summary.grandTotal.male, summary.grandTotal.female, summary.grandTotal.total] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      sheet.getCell(rowNumber, 4).value = hasData ? (establishment?.attraction_code || "") : "NO RECORD SUBMITTED";
      [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].forEach((column, index) => { sheet.getCell(rowNumber, column).value = values[index]; });
      sheet.getCell(rowNumber, 7).value = { formula: `SUM(E${rowNumber}:F${rowNumber})` };
      sheet.getCell(rowNumber, 10).value = { formula: `SUM(H${rowNumber}:I${rowNumber})` };
      sheet.getCell(rowNumber, 13).value = { formula: `SUM(K${rowNumber}:L${rowNumber})` };
      sheet.getCell(rowNumber, 14).value = { formula: `SUM(E${rowNumber},H${rowNumber},K${rowNumber})` };
      sheet.getCell(rowNumber, 15).value = { formula: `SUM(F${rowNumber},I${rowNumber},L${rowNumber})` };
      sheet.getCell(rowNumber, 16).value = { formula: `SUM(N${rowNumber}:O${rowNumber})` };
    }
    for (let rowNumber = 45; rowNumber <= 54; rowNumber += 1) {
      const name = String(sheet.getCell(rowNumber, 3).value || "").trim();
      if (!name || name.startsWith("Total")) continue;
      const establishment = establishmentByKey.get(exportNameKey(name));
      const summary = includeData && establishment ? accommodationFor(establishment, monthNumber) : null;
      const hasData = Boolean(summary && summary.status !== "missing");
      sheet.getCell(rowNumber, 4).value = hasData ? (establishment?.ae_id || "") : "";
      sheet.getCell(rowNumber, 5).value = hasData && summary ? summary.guestCheckIns : "NO RECORD SUBMITTED";
      sheet.getCell(rowNumber, 6).value = hasData && summary ? summary.guestNights : "NO RECORD SUBMITTED";
      sheet.getCell(rowNumber, 7).value = hasData && summary ? summary.roomsOccupied : "NO RECORD SUBMITTED";
      sheet.getCell(rowNumber, 8).value = hasData && summary ? summary.averageLengthOfStay : "";
      sheet.getCell(rowNumber, 9).value = hasData && summary ? summary.occupancyRate : "";
    }
  }
  const grandTotal = workbook.getWorksheet("GRAND TOTAL");
  if (grandTotal) grandTotal.getCell("A1").value = `BALAYAN TOURISM ARRIVALS — ${year}`;
  workbook.creator = "VistaBalayan";
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(filename, buffer);
};

export default function GeneratedReports() {
  const { user, profile, loading: authLoading } = useAuth();
  const [reportKind, setReportKind] = useState("dae3");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [establishments, setEstablishments] = useState<EstablishmentReportingRow[]>([]);
  const [accommodation, setAccommodation] = useState<AccommodationSourceRecord[]>([]);
  const [visitors, setVisitors] = useState<VisitorSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);


  const loadReports = async () => {
    setLoading(true);
    const { data: { session }, error: authError } = await supabase.auth.refreshSession();
    if (authError || !session?.user) {
      setEstablishments([]);
      setAccommodation([]);
      setVisitors([]);
      setLoading(false);
      return;
    }
    const authenticatedRead = async <T,>(table: string, select: string, order: string) => {
      const params = new URLSearchParams({ select, order });
      const rows: T[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
            Range: `${offset}-${offset + pageSize - 1}`,
          },
        });
        const data = await response.json();
        if (!response.ok) return { data: null, error: { message: data?.message || `Request failed with status ${response.status}` } };
        const page = data as T[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      return { data: rows, error: null };
    };

    const [establishmentResult, accommodationResult, visitorResult] = await Promise.all([
      authenticatedRead<EstablishmentReportingRow>("establishments", "id,name,type,reporting_mode,ae_id,attraction_code,total_rooms,status", "name.asc"),
      authenticatedRead<AccommodationSourceRecord>("accommodation_reports", "id,establishment_id,report_date,total_rooms,total_check_ins,total_guest_nights,total_occupied_rooms,guest_check_ins,guest_nights,rooms_occupied,foreign_guest_check_ins,foreign_guest_nights,status", "report_date.asc"),
      authenticatedRead<VisitorSourceRecord>("visitor_reports", "id,establishment_id,report_date,male_visitors,female_visitors,total_visitors,total_male,total_female,total_guests,residence_category,residence_type,status", "report_date.asc"),
    ]);
    const error = establishmentResult.error || accommodationResult.error || visitorResult.error;

    if (error) toast.error(`Could not load reporting data: ${error.message}`);
    setEstablishments((establishmentResult.data || []) as EstablishmentReportingRow[]);
    setAccommodation((accommodationResult.data || []) as AccommodationSourceRecord[]);
    setVisitors((visitorResult.data || []) as VisitorSourceRecord[]);
    setGeneratedAt(new Date().toISOString());
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (user && profile?.role === "municipal_officer") {
      void loadReports();
    } else {
      setLoading(false);
    }
  }, [authLoading, profile?.role, user?.id]);

  const accommodationSummaries = useMemo(() => establishments
    .filter((establishment) => ["accommodation", "both"].includes(establishment.reporting_mode || ""))
    .map((establishment) => summarizeAccommodation(
      establishment,
      accommodation.filter((record) => record.establishment_id === establishment.id && record.report_date?.startsWith(`${year}-${String(month).padStart(2, "0")}`)),
      year,
      month,
    )), [accommodation, establishments, month, year]);

  const visitorSummaries = useMemo(() => establishments
    .filter((establishment) => ["visitor", "both"].includes(establishment.reporting_mode || ""))
    .map((establishment) => summarizeVisitors(
      establishment,
      visitors.filter((record) => record.establishment_id === establishment.id && record.report_date?.startsWith(`${year}-${String(month).padStart(2, "0")}`)),
    )), [establishments, month, visitors, year]);

  const annualVisitorRows = useMemo(() => months.map((_, index) => {
    const monthly = establishments.filter((establishment) => ["visitor", "both"].includes(establishment.reporting_mode || "")).map((establishment) => summarizeVisitors(establishment, visitors.filter((record) => record.establishment_id === establishment.id && record.report_date?.startsWith(`${year}-${String(index + 1).padStart(2, "0")}`))));
    return buildVAR3MRow(index + 1, monthly);
  }), [establishments, visitors, year]);

  const annualAccommodationSummaries = useMemo(() => establishments
    .filter((establishment) => ["accommodation", "both"].includes(establishment.reporting_mode || ""))
    .map((establishment) => summarizeAnnualAccommodation(establishment, accommodation.filter((record) => record.establishment_id === establishment.id && record.report_date?.startsWith(`${year}-`)), year)), [accommodation, establishments, year]);

  const annualAccommodation = useMemo(() => summarizeAnnualDAE4(annualAccommodationSummaries), [annualAccommodationSummaries]);

  const coverage: any[] = reportKind.startsWith("var") ? visitorSummaries : reportKind === "dae4-annual" ? annualAccommodationSummaries : accommodationSummaries;
  const counts = coverage.reduce<Record<string, number>>((result, item) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {});

  const validateEstablishment = async (establishmentId: string, family: "accommodation" | "visitor") => {
    const table = family === "accommodation" ? "accommodation_reports" : "visitor_reports";
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
    const { error } = await supabase.from(table).update({ status: "validated" }).eq("establishment_id", establishmentId).gte("report_date", start).lte("report_date", end).in("status", ["submitted", "pending", "under_review", "needs_review"]);
    if (error) {
      toast.error(`Validation failed: ${error.message}`);
      return;
    }
    toast.success("Source records validated");
    await loadReports();
  };

  const exportReport = async () => {
    try {
      const annual = reportKind.includes("annual");
      await downloadOfficialArrivalsWorkbook({
        filename: annual ? `Balayan_Official_Arrivals_Annual_${year}.xlsx` : `Balayan_Official_Arrivals_${year}-${String(month).padStart(2, "0")}.xlsx`,
        year,
        selectedMonth: annual ? undefined : month,
        establishments,
        accommodation,
        visitors,
      });
      toast.success("Official arrivals template exported from validated source data");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Official arrivals export failed");
    }
  };

  const reportTitle = { dae3: "Monthly DAE-3", dae4: "Monthly DAE-4", "dae4-annual": "Annual DAE-4", var2m: "Monthly VAR-2M", "var3m-annual": "Annual VAR-3M" }[reportKind];
  if (loading) return <div className="flex h-96 items-center justify-center text-slate-600">Loading reporting data…</div>;

  return <div className="space-y-6">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-wider text-[#0E5A72]">MCTAO Reports</p><h1 className="mt-1 text-3xl font-bold text-slate-950">{reportTitle}</h1><p className="mt-2 text-sm text-slate-600">The Excel export uses the official Balayan arrivals template and combines validated day-tour and overnight source records. Missing submissions remain distinct from zero values.</p></div>
        <div className="flex flex-wrap gap-2"><select value={reportKind} onChange={(event) => setReportKind(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="dae3">Monthly DAE-3</option><option value="dae4">Monthly DAE-4</option><option value="dae4-annual">Annual DAE-4</option><option value="var2m">Monthly VAR-2M</option><option value="var3m-annual">Annual VAR-3M</option></select><select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">{[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((value) => <option key={value}>{value}</option>)}</select>{!reportKind.includes("annual") && <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">{months.map((value, index) => <option key={value} value={index + 1}>{value}</option>)}</select>}<button type="button" onClick={() => void loadReports()} className="rounded-xl border border-slate-300 p-2 text-slate-600" title="Refresh"><RefreshCw className="h-5 w-5" /></button><button type="button" onClick={() => void exportReport()} className="inline-flex items-center gap-2 rounded-xl bg-[#0E5A72] px-4 py-2 text-sm font-semibold text-white"><Download className="h-4 w-4" /> Export Official Excel</button></div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{["validated", "missing", "incomplete", "needs_review", "on_hold"].map((status) => <div key={status} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{statusLabel(status)}</p><p className="mt-2 text-2xl font-bold text-slate-950">{counts[status] || 0}</p></div>)}</div>
    {reportKind === "var3m-annual" ? <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[700px] text-sm"><thead className="bg-slate-50"><tr>{["Month", "Domestic Male", "Domestic Female", "Foreign Male", "Foreign Female", "Grand Total"].map((header) => <th key={header} className="px-4 py-3 text-left font-semibold">{header}</th>)}</tr></thead><tbody>{annualVisitorRows.map((row) => <tr key={row.month} className="border-t border-slate-100"><td className="px-4 py-3">{months[row.month - 1]}</td><td className="px-4 py-3">{row.domesticMale}</td><td className="px-4 py-3">{row.domesticFemale}</td><td className="px-4 py-3">{row.foreignMale}</td><td className="px-4 py-3">{row.foreignFemale}</td><td className="px-4 py-3 font-bold">{row.grandTotal}</td></tr>)}</tbody></table></div> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50"><tr>{(reportKind.startsWith("var") ? ["Attraction", "Code", "This Province", "Other Province", "Foreign", "Grand Total", "Status"] : ["Establishment", "AE-ID", "Type-Class", "Rooms", "Check-ins", "Guest Nights", "Occupied Rooms", "Occupancy", "ALOS", "Status"]).map((header) => <th key={header} className="px-4 py-3 text-left font-semibold">{header}</th>)}</tr></thead><tbody>{coverage.map((row) => <tr key={row.establishmentId} className="border-t border-slate-100"><td className="px-4 py-3 font-medium">{row.establishmentName}</td>{reportKind.startsWith("var") ? <><td className="px-4 py-3">{(row as VisitorSummary).attractionCode}</td><td className="px-4 py-3">{(row as VisitorSummary).thisProvince.total}</td><td className="px-4 py-3">{(row as VisitorSummary).otherProvince.total}</td><td className="px-4 py-3">{(row as VisitorSummary).foreign.total}</td><td className="px-4 py-3 font-bold">{row.grandTotal.total}</td></> : <><td className="px-4 py-3">{row.aeId}</td><td className="px-4 py-3">{row.typeClass}</td><td className="px-4 py-3">{row.totalRooms}</td><td className="px-4 py-3">{row.guestCheckIns}</td><td className="px-4 py-3">{row.guestNights}</td><td className="px-4 py-3">{row.roomsOccupied}</td><td className="px-4 py-3">{row.occupancyRate.toFixed(2)}%</td><td className="px-4 py-3">{row.averageLengthOfStay.toFixed(2)}</td></>}<td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize">{statusLabel(row.status)}</span>{["incomplete", "needs_review"].includes(row.status) && !reportKind.includes("annual") && <button type="button" onClick={() => void validateEstablishment(row.establishmentId, reportKind.startsWith("var") ? "visitor" : "accommodation")} className="ml-2 rounded-lg bg-[#0E5A72] px-2 py-1 text-xs font-semibold text-white">Validate</button>}</td></tr>)}</tbody></table></div>}
    <p className="text-xs text-slate-500">Generated {generatedAt ? new Date(generatedAt).toLocaleString() : "—"}. Export includes finalized records only; inspect source records in Report Monitoring for traceability.</p>
  </div>;
}
