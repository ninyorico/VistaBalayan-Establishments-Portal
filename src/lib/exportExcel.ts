import * as ExcelJS from "exceljs";
import { canSubmitAccommodationReport } from "./establishmentReportForms";
import { getVisitorResidenceLocation, normalizeResidenceCategory } from "./reporting";

export type TourismReportType = "Visitor Report" | "Accommodation Report";

export interface TourismReportExportRow {
  id: string;
  establishment: string;
  type: TourismReportType;
  reportDate: string;
  visitors: number;
  submitted: string;
  status: string;
  reviewedBy?: string;
  reviewedDate?: string;
  notes?: string;
  details?: any;
}

export const reportHasRoomInventory = (report: TourismReportExportRow) =>
  Number(report.details?.total_rooms ?? 0) > 0;

const getJoinedEstablishment = (report: TourismReportExportRow) => {
  const joined = report.details?.establishments;
  if (Array.isArray(joined)) return joined[0] || null;
  return joined || null;
};

export const getTourismReportFormType = (report: TourismReportExportRow): TourismReportType => {
  const establishment = getJoinedEstablishment(report);
  const reportRooms = Number(report.details?.total_rooms ?? 0);
  const establishmentRooms = Number(establishment?.total_rooms ?? 0);

  return canSubmitAccommodationReport({
    type: establishment?.type,
    total_rooms: reportRooms > 0 ? reportRooms : establishmentRooms,
  })
    ? "Accommodation Report"
    : "Visitor Report";
};

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const shortMonths = months.map((month) => month.slice(0, 3));

const thinBlackBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

const noFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } };
const yellowFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFF00" } };

const sanitizeSheetName = (name: string) => {
  const clean = name.replace(/[\\/*?:\[\]]/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 31) || "Report";
};

const uniqueSheetName = (workbook: ExcelJS.Workbook, baseName: string) => {
  const sanitizedBase = sanitizeSheetName(baseName);
  const existingNames = new Set(workbook.worksheets.map((worksheet) => worksheet.name.toLowerCase()));

  if (!existingNames.has(sanitizedBase.toLowerCase())) {
    return sanitizedBase;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = ` (${index})`;
    const candidate = `${sanitizedBase.slice(0, 31 - suffix.length)}${suffix}`;
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  throw new Error(`Unable to create a unique worksheet name for ${sanitizedBase}`);
};

const groupKey = (report: TourismReportExportRow) => {
  const date = new Date(`${report.reportDate}T00:00:00`);
  const year = Number.isFinite(date.getFullYear()) ? date.getFullYear() : new Date().getFullYear();
  const month = Number.isFinite(date.getMonth()) ? date.getMonth() : 0;

  // Municipal exports should compile all establishments into a single monthly
  // worksheet per report form type, instead of creating one worksheet per
  // establishment. For example, January 2025 day-tour reports are all
  // exported in one January 2025 day-tour sheet.
  return `${getTourismReportFormType(report)}|${year}|${month}`;
};

const sortByReportDate = (a: TourismReportExportRow, b: TourismReportExportRow) =>
  a.reportDate.localeCompare(b.reportDate) || a.establishment.localeCompare(b.establishment);

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const fetchImageBase64 = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) return null;
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const formatMonthYear = (year: number, monthIndex: number) => `${months[monthIndex]} ${year}`;

const applyBorderAndAlignment = (cell: ExcelJS.Cell, options: Partial<ExcelJS.Alignment> = {}) => {
  cell.border = thinBlackBorder;
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, ...options };
};

const addResortSheet = (
  workbook: ExcelJS.Workbook,
  rows: TourismReportExportRow[],
  year: number,
  monthIndex: number,
  establishment: string,
  sealImageId?: number,
  tourismImageId?: number
) => {
  const worksheet = workbook.addWorksheet(uniqueSheetName(workbook, `${shortMonths[monthIndex]} ${year} Resort`), {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  worksheet.columns = [
    { key: "establishment", width: 28 },
    { key: "reservedDate", width: 20 },
    { key: "guestName", width: 32 },
    { key: "residence", width: 28 },
    { key: "contact", width: 20 },
    { key: "adult", width: 12 },
    { key: "child", width: 12 },
    { key: "male", width: 12 },
    { key: "female", width: 12 },
    { key: "total", width: 12 },
    { key: "purpose", width: 13 },
    { key: "duration", width: 15 },
  ];

  worksheet.mergeCells("C2:F2");
  worksheet.mergeCells("C3:F3");
  worksheet.mergeCells("C4:F4");
  worksheet.mergeCells("C6:F6");

  if (sealImageId !== undefined) {
    worksheet.addImage(sealImageId, { tl: { col: 1.5, row: 0.7 }, ext: { width: 120, height: 120 } });
  }
  if (tourismImageId !== undefined) {
    worksheet.addImage(tourismImageId, { tl: { col: 5.8, row: 0.3 }, ext: { width: 350, height: 122 } });
  }

  const headerRows = [
    ["C2", "Republic of the Philippines", 16, "Times New Roman"],
    ["C3", "MUNICIPALITY OF BALAYAN", 16, "Times New Roman"],
    ["C4", "Province of Batangas", 16, "Times New Roman"],
    ["C6", "MONTHLY GUEST RESERVATIONS", 30, "Roboto Condensed"],
  ] as const;

  headerRows.forEach(([address, value, size, fontName]) => {
    const cell = worksheet.getCell(address);
    cell.value = value;
    cell.font = { name: fontName, size, bold: true, color: { argb: "FF000000" } };
    cell.alignment = { horizontal: "center", vertical: "bottom" };
  });

  worksheet.getCell("A8").value = `NAME OF ESTABLISHMENT: ${establishment.toUpperCase()}`;
  worksheet.getCell("H8").value = `MONTH & YEAR: ${formatMonthYear(year, monthIndex)}`;
  ["A8", "H8"].forEach((address) => {
    worksheet.getCell(address).font = { name: "Roboto Condensed", size: 20, bold: true };
  });

  const headers = [
    "ESTABLISHMENT",
    "RESERVED DATE",
    "GUEST NAME",
    "RESIDENCE",
    "LOCATION",
    "CONTACT NUMBER",
    "ADULT (12 years old and above)",
    "CHILD (Below 12 years old)",
    "TOTAL NO. OF MALE",
    "TOTAL NO. OF FEMALE",
    "TOTAL NO. OF GUEST",
    "PURPOSE",
    "DURATION OF STAY",
  ];
  worksheet.getRow(10).height = 37.5;
  headers.forEach((header, index) => {
    const cell = worksheet.getCell(10, index + 1);
    cell.value = header;
    cell.font = { name: "Roboto Condensed", size: 14, bold: true };
    applyBorderAndAlignment(cell);
  });

  const startRow = 11;
  const minimumRows = Math.max(15, rows.length);
  for (let index = 0; index < minimumRows; index += 1) {
    const report = rows[index];
    const rowNumber = startRow + index;
    worksheet.getRow(rowNumber).height = 37.5;
    const values = report
      ? [
          report.establishment,
          report.reportDate,
          report.details?.guest_name || "",
          normalizeResidenceCategory(report.details || {}) || "—",
          getVisitorResidenceLocation(report.details || {}),
          "",
          "",
          "",
          report.details?.total_male ?? "",
          report.details?.total_female ?? "",
          report.details?.total_guests ?? report.details?.total_check_ins ?? report.visitors ?? "",
          "",
          "",
        ]
      : Array(12).fill("");
    values.forEach((value, colIndex) => {
      const cell = worksheet.getCell(rowNumber, colIndex + 1);
      cell.value = value;
      cell.font = { name: "Roboto Condensed", size: 12 };
      applyBorderAndAlignment(cell, { horizontal: colIndex <= 2 ? "left" : "center" });
    });
  }

  const footerStart = startRow + minimumRows;
  worksheet.getCell(`A${footerStart}`).value = "TourisMore Code For Purpose";
  worksheet.getCell(`C${footerStart}`).value = "TourisMore Code for Duration of Stay";
  worksheet.getCell(`E${footerStart}`).value = "*add rows for additional days";
  worksheet.getCell(`A${footerStart + 1}`).value = "Birthday - (B)              Wedding - (W)";
  worksheet.getCell(`B${footerStart + 1}`).value = "Family Outing - (FO)             Barkada Outing - (BO)";
  worksheet.getCell(`C${footerStart + 1}`).value = "(DT) - Day Tour - Minimum of 8 hours in Daytime";
  worksheet.getCell(`D${footerStart + 1}`).value = "(LS) - Long Stay - More than 24 hrs";
  worksheet.getCell(`I${footerStart + 1}`).value = "Accomplished by:";
  worksheet.getCell(`A${footerStart + 2}`).value = "Anniversary - (A)        Reunion - (R)";
  worksheet.getCell(`B${footerStart + 2}`).value = "Company Outing - (CO)        Others - (OTH)";
  worksheet.getCell(`C${footerStart + 2}`).value = "(ON) - Overnight - Nighttime";
  worksheet.getCell(`J${footerStart + 2}`).value = "(SIGNATURE OVER PRINTED NAME)";

  for (let row = footerStart; row <= footerStart + 2; row += 1) {
    for (let col = 1; col <= 12; col += 1) {
      worksheet.getCell(row, col).font = { name: "Roboto Condensed", size: 11, bold: row === footerStart };
      worksheet.getCell(row, col).alignment = { vertical: "middle", wrapText: true };
    }
  }
};

const addHotelSheet = (
  workbook: ExcelJS.Workbook,
  rows: TourismReportExportRow[],
  year: number,
  monthIndex: number,
  establishment: string
) => {
  const worksheet = workbook.addWorksheet(uniqueSheetName(workbook, `${shortMonths[monthIndex]} ${year} Hotel`), {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  worksheet.views = [{ state: "frozen", ySplit: 7 }];
  worksheet.columns = Array.from({ length: 27 }, (_, index) => ({
    width: index === 0 ? 3.13 : index === 1 ? 4.63 : index === 26 ? 28 : 13,
  }));

  worksheet.mergeCells("B1:U1");
  worksheet.mergeCells("Y1:Z1");
  worksheet.mergeCells("B2:V4");
  worksheet.mergeCells("W2:Z2");
  worksheet.mergeCells("W4:Y4");
  worksheet.mergeCells("A6:B6");
  worksheet.mergeCells("G6:W6");
  worksheet.mergeCells("X6:X7");
  worksheet.mergeCells("Y6:Y7");
  worksheet.mergeCells("Z6:Z7");
  worksheet.mergeCells("AA6:AA7");

  worksheet.getCell("B1").value = "Monthly Recording Format for Accommodation Establishment";
  worksheet.getCell("Y1").value = "Form: DAE-1A";
  worksheet.getCell("B2").value =
    "(This form is provided for small & medium Accommodation Establishments that do not have an established/computerized guests and room occupancy recording system.)";
  worksheet.getCell("W2").value = `Month of ${months[monthIndex]}      Year ${year}`;
  worksheet.getCell("W4").value = "(4) Total Number of Rooms : ";
  worksheet.getCell("Z4").value = rows.reduce((max, report) => Math.max(max, Number(report.details?.total_rooms || 0)), 0) || "";
  worksheet.getCell("A6").value = "Date";
  worksheet.getCell("G6").value = "Room Identification (adjust number of columns=number of rooms)";
  worksheet.getCell("X6").value = "(5) \nNumber of Guests Check IN \n(unit: visitors)";
  worksheet.getCell("Y6").value = "(6)\nNumber of Guests\nstaying over-night\n(Guest Nights)";
  worksheet.getCell("Z6").value = "(7)\nNumber of Rooms Occupied by  Guests\n(unit: rooms)";
  worksheet.getCell("AA6").value = "Reporting Establishment(s)";
  worksheet.getCell("A7").value = "Day";
  worksheet.getCell("B7").value = "Day of the week\nSun-Sat";

  const roomHeaders = ["A", "B", "C", "D", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "15", "17", "18", "19"];
  roomHeaders.forEach((room, index) => {
    worksheet.getCell(7, index + 3).value = `Room\nNo.\n${room}`;
  });

  [1, 4].forEach((rowNumber) => (worksheet.getRow(rowNumber).height = 13.5));
  worksheet.getRow(2).height = 18;
  worksheet.getRow(3).height = 6;
  worksheet.getRow(5).height = 6;
  worksheet.getRow(6).height = 16.5;
  worksheet.getRow(7).height = 65.25;

  for (let row = 1; row <= 7; row += 1) {
    for (let col = 1; col <= 27; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.font = { name: row <= 5 ? (row === 2 ? "Arial Narrow" : "Arial") : "Arial Narrow", size: row === 6 || row === 7 ? 9 : row === 2 ? 10 : 11, bold: row === 1 || row === 6 };
      cell.alignment = { horizontal: row === 2 ? "left" : "center", vertical: "middle", wrapText: true };
      if (row >= 6) cell.border = thinBlackBorder;
    }
  }

  const byDay = new Map<number, TourismReportExportRow[]>();
  rows.forEach((report) => {
    const day = new Date(`${report.reportDate}T00:00:00`).getDate();
    byDay.set(day, [...(byDay.get(day) || []), report]);
  });

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const rowNumber = day + 7;
    const reportsForDay = byDay.get(day) || [];
    const date = new Date(year, monthIndex, day);
    worksheet.getRow(rowNumber).height = 18.75;
    worksheet.getCell(rowNumber, 1).value = day;
    worksheet.getCell(rowNumber, 2).value = date.toLocaleDateString("en-US", { weekday: "short" });

    const checkIns = reportsForDay.reduce((sum, report) => sum + Number(report.details?.guest_check_ins ?? report.details?.total_check_ins ?? report.visitors ?? 0), 0);
    const guestNights = reportsForDay.reduce((sum, report) => sum + Number(report.details?.total_guest_nights || 0), 0);
    const occupiedRooms = reportsForDay.reduce((sum, report) => sum + Number(report.details?.total_occupied_rooms || 0), 0);
    worksheet.getCell(rowNumber, 24).value = checkIns || "";
    worksheet.getCell(rowNumber, 25).value = guestNights || "";
    worksheet.getCell(rowNumber, 26).value = occupiedRooms || "";
    worksheet.getCell(rowNumber, 27).value = Array.from(new Set(reportsForDay.map((report) => report.establishment).filter(Boolean))).join(", ");

    for (let col = 1; col <= 27; col += 1) {
      const cell = worksheet.getCell(rowNumber, col);
      cell.font = { name: col >= 3 && col <= 23 ? "MS PGothic" : "Arial Narrow", size: col >= 3 && col <= 23 ? 11 : 10, bold: col >= 3 && col <= 23 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBlackBorder;
      cell.fill = col >= 3 && col <= 23 && reportsForDay.length ? yellowFill : noFill;
    }
  }

  const totalRow = daysInMonth + 8;
  worksheet.getCell(totalRow, 24).value = { formula: `SUM(X8:X${totalRow - 1})` };
  worksheet.getCell(totalRow, 25).value = { formula: `SUM(Y8:Y${totalRow - 1})` };
  worksheet.getCell(totalRow, 26).value = { formula: `SUM(Z8:Z${totalRow - 1})` };
  for (let col = 24; col <= 26; col += 1) {
    const cell = worksheet.getCell(totalRow, col);
    cell.font = { name: "Arial Narrow", size: 10, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBlackBorder;
  }

  worksheet.getCell(totalRow + 1, 1).value = "Average Guest-Night = Total Number of Guests nights / Total Number of Guests Check IN";
  worksheet.getCell(totalRow + 2, 1).value = "Average Room Occupancy Rate = Total No. of Rooms Occupied by the Guests during the month / Total No. of Rooms Available during the month";
  worksheet.getCell(totalRow + 3, 1).value = "Average Number of Guest per room = Total Number of Guests Nights / Total Number of Rooms Occupied by the Guests";
  worksheet.getCell(totalRow + 4, 1).value = `Accommodation Establishment: ${establishment}`;
  for (let row = totalRow + 1; row <= totalRow + 4; row += 1) {
    worksheet.getCell(row, 1).font = { name: "Arial Narrow", size: 10 };
  }
};

export async function downloadTourismReportsWorkbook(filename: string, reports: TourismReportExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VistaBalayan";
  workbook.created = new Date();
  workbook.modified = new Date();

  const [sealImage, tourismImage] = await Promise.all([
    fetchImageBase64("/export-template/image1.png"),
    fetchImageBase64("/export-template/image2.png"),
  ]);
  const sealImageId = sealImage ? workbook.addImage({ base64: sealImage, extension: "png" }) : undefined;
  const tourismImageId = tourismImage ? workbook.addImage({ base64: tourismImage, extension: "png" }) : undefined;

  const grouped = new Map<string, TourismReportExportRow[]>();
  reports.sort(sortByReportDate).forEach((report) => {
    const key = groupKey(report);
    grouped.set(key, [...(grouped.get(key) || []), report]);
  });

  Array.from(grouped.values()).forEach((groupRows) => {
    const first = groupRows[0];
    const date = new Date(`${first.reportDate}T00:00:00`);
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const establishmentLabel = "All Establishments";
    if (getTourismReportFormType(first) === "Visitor Report") {
      addResortSheet(workbook, groupRows, year, monthIndex, establishmentLabel, sealImageId, tourismImageId);
    } else {
      addHotelSheet(workbook, groupRows, year, monthIndex, establishmentLabel);
    }
  });

  if (workbook.worksheets.length === 0) {
    addResortSheet(workbook, [], new Date().getFullYear(), new Date().getMonth(), "", sealImageId, tourismImageId);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export function datestampedWorkbookFilename(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
