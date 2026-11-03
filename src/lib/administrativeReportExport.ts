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

export const exportAdministrativeReportPdf = (report: AdministrativeReportExport) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 16;
  const lineHeight = 4.5;
  let y = 18;

  const addPage = () => {
    doc.addPage();
    y = 18;
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
  };

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - bottomMargin) addPage();
  };

  const heading = (text: string) => {
    ensureSpace(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(25, 51, 100);
    doc.text(text, margin, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0);
  };

  const paragraph = (text: string) => {
    const lines = doc.splitTextToSize(String(text || ""), contentWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 5;
  };

  const table = (head: string[][], body: string[][]) => {
    ensureSpace(28);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: 16, bottom: bottomMargin },
      head,
      body,
      theme: "grid",
      pageBreak: "auto",
      rowPageBreak: "auto",
      styles: { fontSize: 8, cellPadding: 2.2, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [25, 51, 100], textColor: [255, 255, 255], fontStyle: "bold" },
      didDrawPage: () => {
        doc.setTextColor(0);
      },
    });
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY || y + 25) + 10;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(25, 51, 100);
  ["REPUBLIC OF THE PHILIPPINES", "PROVINCE OF BATANGAS", "MUNICIPALITY OF BALAYAN", "MUNICIPAL TOURISM OFFICE"].forEach((line) => {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 6;
  });

  const titleLines = doc.splitTextToSize(report.title.toUpperCase(), contentWidth) as string[];
  doc.setFontSize(13);
  doc.text(titleLines, pageWidth / 2, y + 3, { align: "center" });
  y += titleLines.length * 6 + 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0);
  paragraph(`Reporting period: ${report.periodLabel}`);
  paragraph(`Report status: ${report.status}`);
  paragraph(`Date generated: ${report.generatedAt ? new Date(report.generatedAt).toLocaleDateString("en-PH") : new Date().toLocaleDateString("en-PH")}`);
  paragraph("Prepared through: VistaBalayan Tourism Data Analytics and Decision Support System");

  heading("I. Executive Summary");
  paragraph(summary(report));

  heading("II. Tourism Statistical Overview");
  table(
    [["Metric", "Current period", "Previous period", "Change"]],
    [
      ["Day-tour visits", numberFormat(report.source.visitorTotal), numberFormat(report.source.comparison.dayTourVisits.previous), `${numberFormat(report.source.comparison.dayTourVisits.absolute)} (${percentFormat(report.source.comparison.dayTourVisits.percentage)})`],
      ["Accommodation guest arrivals", numberFormat(report.source.guestCheckInTotal), numberFormat(report.source.comparison.guestCheckIns.previous), `${numberFormat(report.source.comparison.guestCheckIns.absolute)} (${percentFormat(report.source.comparison.guestCheckIns.percentage)})`],
    ],
  );

  heading("III. Comparative Tourism Performance");
  paragraph(report.narrative.dayTourAnalysis);
  paragraph(report.narrative.accommodationAnalysis);

  heading("IV. Establishment Performance Assessment");
  table(
    [["Establishment", "Report type", "Current activity"]],
    report.source.performance.map((row) => [row.establishmentName, row.type === "daytour" ? "Day-tour" : "Accommodation", numberFormat(row.currentActivity)]),
  );

  heading("V. Reporting Compliance and Data Quality");
  paragraph(`Overall estimated reporting completeness: ${report.source.completeness.percentage === null ? "Unavailable" : `${Number(report.source.completeness.percentage).toFixed(1)}%`}. Day-tour submissions: ${report.source.completeness.submittedDayTour} of ${report.source.completeness.expectedDayTour}. Accommodation submissions: ${report.source.completeness.submittedAccommodation} of ${report.source.completeness.expectedAccommodation}. ${report.source.completeness.basis}`);
  report.source.dataQuality.notes.forEach(paragraph);

  heading("VI. Administrative Recommendations");
  report.recommendations.forEach((item, index) => paragraph(`${index + 1}. ${item}`));

  heading("VII. Methodology and Limitations");
  paragraph("Statistics are calculated server-side from submitted visitor and accommodation records within the selected Asia/Manila reporting period. Day-tour visits and accommodation guest arrivals are separate measures and must not be interpreted as unique municipal visitors. Missing submissions are not treated as zero activity.");

  doc.save(`${safeFilename(report.title)}.pdf`);
};
