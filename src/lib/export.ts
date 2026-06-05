import { strToU8, zipSync } from "fflate";
import type { AcquisitionTransaction, Profile } from "../types";
import { formatDateTime } from "./date";

export type ExportFormat = "csv" | "xlsx";

export type FriendlyTransactionRow = {
  "date and time": string;
  user: string;
  project_code: string;
  project_name: string;
  project: string;
  database_code: string;
  item_code: string;
  item_type: string;
  item: string;
  unit_of_measure: string;
  amount: number;
  comments: string;
  transaction_status: string;
  voided_or_corrected_reason: string;
  corrected_by: string;
  corrected_at: string;
  original_transaction_id: string;
};

function correctedByName(tx: AcquisitionTransaction, profiles: Map<string, Profile>): string {
  if (tx.correctedByName) return tx.correctedByName;
  if (!tx.correctedBy) return "";
  return profiles.get(tx.correctedBy)?.displayName || tx.correctedBy;
}

export function toFriendlyRows(
  transactions: AcquisitionTransaction[],
  profiles: Map<string, Profile>
): FriendlyTransactionRow[] {
  return transactions.map((tx) => ({
    "date and time": formatDateTime(tx.submittedAt) || tx.transactionDate,
    user: tx.userDisplayName || tx.userEmail,
    project_code: tx.projectCode,
    project_name: tx.projectName,
    project: `${tx.projectCode} ${tx.projectName}`.trim(),
    database_code: tx.databaseCode,
    item_code: tx.itemCode,
    item_type: tx.itemType,
    item: tx.itemName,
    unit_of_measure: tx.unitOfMeasure,
    amount: tx.amount,
    comments: tx.comments || "",
    transaction_status: tx.status,
    voided_or_corrected_reason: tx.voidOrCorrectionReason || "",
    corrected_by: correctedByName(tx, profiles),
    corrected_at: formatDateTime(tx.correctedAt) || "",
    original_transaction_id: tx.originalTransactionId || ""
  }));
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadCsv(rows: FriendlyTransactionRow[], fileName: string): void {
  const headers = Object.keys(rows[0] ?? {
    "date and time": "",
    user: "",
    project_code: "",
    project_name: "",
    project: "",
    database_code: "",
    item_code: "",
    item_type: "",
    item: "",
    unit_of_measure: "",
    amount: "",
    comments: "",
    transaction_status: "",
    voided_or_corrected_reason: "",
    corrected_by: "",
    corrected_at: "",
    original_transaction_id: ""
  });
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof FriendlyTransactionRow])).join(","))
  ].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName);
}

export function downloadXlsx(rows: FriendlyTransactionRow[], fileName: string): void {
  const headers = Object.keys(rows[0] ?? {
    "date and time": "",
    user: "",
    project_code: "",
    project_name: "",
    project: "",
    database_code: "",
    item_code: "",
    item_type: "",
    item: "",
    unit_of_measure: "",
    amount: "",
    comments: "",
    transaction_status: "",
    voided_or_corrected_reason: "",
    corrected_by: "",
    corrected_at: "",
    original_transaction_id: ""
  });
  const sheetRows = [
    headers,
    ...rows.map((row) => headers.map((header) => row[header as keyof FriendlyTransactionRow]))
  ];
  const archive = zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelsXml()),
    "xl/workbook.xml": strToU8(workbookXml()),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelsXml()),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(sheetRows))
  });
  downloadBlob(
    new Blob([archive], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }),
    fileName
  );
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Acquisitions" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function workbookRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
}

function worksheetXml(rows: unknown[][]): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => cellXml(value, `${columnName(colIndex + 1)}${rowIndex + 1}`))
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function cellXml(value: unknown, ref: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function columnName(index: number): string {
  let value = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
