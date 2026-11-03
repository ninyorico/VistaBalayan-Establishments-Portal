import { Document, HeadingLevel, Paragraph, Packer, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type AdministrativeReportExport = {
  title: string;
  periodLabel: string;
  status: string;
  generatedAt?: string;
  source: {
    visitorTotal: number;
    guestCheckInTotal: number;
    comparison: {
      dayTourVisits: { current: number; previous: number; absolute: number; percentage: number | null };
      guestCheckIns: { current: number; previous: number; absolute: number; percentage: number | null };
    };
    completeness: {
      expectedDayTour: number;
      submittedDayTour: number;
      missingDayTour: number;
      expectedAccommodation: number;
      submittedAccommodation: number;
      missingAccommodation: number;
      percentage: number | null;
      basis: string;
    };
    performance: Array<{ establishmentName: string; type: string; currentActivity: number }>;
    dataQuality: { notes: string[] };
  };
  narrative: {
    executiveSummary: string;
    dayTourAnalysis: string;
    accommodationAnalysis: string;
  };
  recommendations: string[];
  edits?: { executiveSummary?: string } | null;
};

const numberFormat = (value: number) => new Intl.NumberFormat("en-PH").format(Number(value || 0));
const percentFormat = (value: number | null) => value === null ? "Unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const safeFilename = (value: string) => value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const summary = (report: AdministrativeReportExport) => report.edits?.executiveSummary || report.narrative.executiveSummary;

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportAdministrativeReportPdf = (report: AdministrativeReportExport) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const title = report.title.toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("REPUBLIC OF THE PHILIPPINES", 105, 18, { align: "center" });
  doc.text("PROVINCE OF BATANGAS", 105, 24, { align: "center" });
  doc.text("MUNICIPALITY OF BALAYAN", 105, 30, { align: "center" });
  doc.text("MUNICIPAL TOURISM OFFICE", 105, 36, { align: "center" });
  doc.setFontSize(13);
  doc.text(title, 105, 47, { align: "center", maxWidth: 175 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Reporting period: ${report.periodLabel}`, margin, 58);
  doc.text(`Report status: ${report.status}`, margin, 64);
  doc.text(`Date generated: ${report.generatedAt ? new Date(report.generatedAt).toLocaleDateString("en-PH") : new Date().toLocaleDateString("en-PH")}`, margin, 70);
  doc.text("Prepared through: VistaBalayan Tourism Data Analytics and Decision Support System", margin, 76);

  let y = 88;
  const heading = (text: string) => { doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(text, margin, y); y += 7; doc.setFont("helvetica", "normal"); doc.setFontSize(9); };
  const paragraph = (text: string) => { const lines = doc.splitTextToSize(text, 180); doc.text(lines, margin, y); y += lines.length * 4.5 + 5; };
  heading("I. Executive Summary"); paragraph(summary(report));
  heading("II. Tourism Statistical Overview");
  autoTable(doc, { startY: y, margin: { left: margin, right: margin }, head: [["Metric", "Current period", "Previous period", "Change"]], body: [["Day-tour visits", numberFormat(report.source.visitorTotal), numberFormat(report.source.comparison.dayTourVisits.previous), `${numberFormat(report.source.comparison.dayTourVisits.absolute)} (${percentFormat(report.source.comparison.dayTourVisits.percentage)})`], ["Accommodation guest arrivals", numberFormat(report.source.guestCheckInTotal), numberFormat(report.source.comparison.guestCheckIns.previous), `${numberFormat(report.source.comparison.guestCheckIns.absolute)} (${percentFormat(report.source.comparison.guestCheckIns.percentage)})`]], theme: "grid", styles: { fontSize: 8 }, headStyles: { fillColor: [25, 51, 100] } });
  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? ((doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10) : y + 25;
  heading("III. Comparative Tourism Performance"); paragraph(report.narrative.dayTourAnalysis); paragraph(report.narrative.accommodationAnalysis);
  heading("IV. Establishment Performance Assessment");
  autoTable(doc, { startY: y, margin: { left: margin, right: margin }, head: [["Establishment", "Report type", "Current activity"]], body: report.source.performance.slice(0, 30).map((row) => [row.establishmentName, row.type === "daytour" ? "Day-tour" : "Accommodation", numberFormat(row.currentActivity)]), theme: "grid", styles: { fontSize: 8 }, headStyles: { fillColor: [25, 51, 100] } });
  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? ((doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10) : y + 25;
  heading("V. Reporting Compliance and Data Quality"); paragraph(`Overall estimated reporting completeness: ${Number(report.source.completeness.percentage || 0).toFixed(1)}%. Day-tour submissions: ${report.source.completeness.submittedDayTour} of ${report.source.completeness.expectedDayTour}. Accommodation submissions: ${report.source.completeness.submittedAccommodation} of ${report.source.completeness.expectedAccommodation}. ${report.source.completeness.basis}`); report.source.dataQuality.notes.forEach(paragraph);
  heading("VI. Administrative Recommendations"); report.recommendations.forEach((item, index) => paragraph(`${index + 1}. ${item}`));
  heading("VII. Methodology and Limitations"); paragraph("Statistics are calculated server-side from submitted visitor and accommodation records within the selected Asia/Manila reporting period. Day-tour visits and accommodation guest arrivals are separate measures and must not be interpreted as unique municipal visitors. Missing submissions are not treated as zero activity.");
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(100); doc.text(`VistaBalayan · Administrative Report · Page ${page} of ${pages}`, 105, 290, { align: "center" }); doc.setTextColor(0); }
  doc.save(`${safeFilename(report.title)}.pdf`);
};

const cell = (text: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, size: 18 })] })] });
const heading = (text: string, level = HeadingLevel.HEADING_1) => new Paragraph({ text, heading: level });

export const exportAdministrativeReportDocx = async (report: AdministrativeReportExport) => {
  const rows = [new TableRow({ children: [cell("Metric"), cell("Current period"), cell("Previous period"), cell("Change")] }), ...[["Day-tour visits", numberFormat(report.source.visitorTotal), numberFormat(report.source.comparison.dayTourVisits.previous), `${numberFormat(report.source.comparison.dayTourVisits.absolute)} (${percentFormat(report.source.comparison.dayTourVisits.percentage)})`], ["Accommodation guest arrivals", numberFormat(report.source.guestCheckInTotal), numberFormat(report.source.comparison.guestCheckIns.previous), `${numberFormat(report.source.comparison.guestCheckIns.absolute)} (${percentFormat(report.source.comparison.guestCheckIns.percentage)})`]].map((row) => new TableRow({ children: row.map(cell) }))];
  const performanceRows = [new TableRow({ children: [cell("Establishment"), cell("Report type"), cell("Current activity")] }), ...report.source.performance.slice(0, 50).map((row) => new TableRow({ children: [cell(row.establishmentName), cell(row.type === "daytour" ? "Day-tour" : "Accommodation"), cell(numberFormat(row.currentActivity))] }))];
  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children: [new Paragraph({ alignment: "center", children: [new TextRun({ text: "REPUBLIC OF THE PHILIPPINES\nPROVINCE OF BATANGAS\nMUNICIPALITY OF BALAYAN\nMUNICIPAL TOURISM OFFICE", bold: true, size: 22 })] }), new Paragraph({ alignment: "center", spacing: { before: 240, after: 240 }, children: [new TextRun({ text: report.title.toUpperCase(), bold: true, size: 26 })] }), new Paragraph({ children: [new TextRun({ text: `Reporting period: ${report.periodLabel}\nReport status: ${report.status}\nPrepared through: VistaBalayan Tourism Data Analytics and Decision Support System` })] }), heading("I. Executive Summary"), new Paragraph(summary(report)), heading("II. Tourism Statistical Overview"), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }), heading("III. Comparative Tourism Performance"), new Paragraph(report.narrative.dayTourAnalysis), new Paragraph(report.narrative.accommodationAnalysis), heading("IV. Establishment Performance Assessment"), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: performanceRows }), heading("V. Reporting Compliance and Data Quality"), new Paragraph(`Overall estimated completeness: ${Number(report.source.completeness.percentage || 0).toFixed(1)}%. ${report.source.completeness.basis}`), ...report.source.dataQuality.notes.map((note) => new Paragraph({ text: note, bullet: { level: 0 } })), heading("VI. Administrative Recommendations"), ...report.recommendations.map((item) => new Paragraph({ text: item, bullet: { level: 0 } })), heading("VII. Methodology and Limitations"), new Paragraph("Statistics are calculated server-side from submitted visitor and accommodation records within the selected Asia/Manila reporting period. Day-tour visits and accommodation guest arrivals remain separate measures. Missing submissions are not treated as zero activity.")] }] });
  downloadBlob(await Packer.toBlob(doc), `${safeFilename(report.title)}.docx`);
};
