import { unzipSync } from "fflate";
import type {
  ImportIssue,
  ParsedItemRow,
  ParsedProjectUserRow
} from "../types";
import { ALLOWED_UNITS } from "./units";

type RawRow = Record<string, unknown>;
type XmlParser = (xml: string) => Document;

export type ParsedItemsImport = {
  rows: ParsedItemRow[];
  issues: ImportIssue[];
  duplicateItemNames: string[];
  duplicateItemCodes: string[];
};

export type ParsedProjectUsersImport = {
  rows: ParsedProjectUserRow[];
  projects: string[];
  users: string[];
  issues: ImportIssue[];
};

function trimCell(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function parseActive(value: unknown, row: number, issues: ImportIssue[]): boolean {
  const text = trimCell(value).toLowerCase();
  if (["yes", "y", "true", "1", "active"].includes(text)) return true;
  if (["no", "n", "false", "0", "inactive"].includes(text)) return false;
  issues.push({
    severity: "error",
    row,
    field: "active",
    message: `Invalid active value "${trimCell(value)}". Use yes/no or true/false.`
  });
  return false;
}

function parseCost(value: unknown, row: number, issues: ImportIssue[]): number | null {
  const text = trimCell(value);
  if (!text) {
    issues.push({
      severity: "warning",
      row,
      field: "cost",
      message: "Missing cost; invoice exports will use 0 until an admin updates it."
    });
    return null;
  }
  const cost = Number(text.replace(/[$,]/g, ""));
  if (!Number.isFinite(cost) || cost < 0) {
    issues.push({
      severity: "error",
      row,
      field: "cost",
      message: `Invalid cost value "${text}". Use a non-negative number.`
    });
    return null;
  }
  return cost;
}

async function rawRowsFromFile(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer();
  return firstSheetRowsFromXlsx(buffer, (xml) => new DOMParser().parseFromString(xml, "application/xml"));
}

export function firstSheetRowsFromXlsx(buffer: ArrayBuffer, parseXml: XmlParser): RawRow[] {
  const files = unzipSync(new Uint8Array(buffer));
  const readText = (path: string): string => {
    const file = files[path];
    if (!file) throw new Error(`Missing XLSX file entry: ${path}`);
    return new TextDecoder().decode(file);
  };

  const sharedStrings = files["xl/sharedStrings.xml"]
    ? parseSharedStrings(readText("xl/sharedStrings.xml"), parseXml)
    : [];
  const workbook = parseXml(readText("xl/workbook.xml"));
  const workbookRels = parseRelationships(readText("xl/_rels/workbook.xml.rels"), parseXml);
  const firstSheet = elementsByLocalName(workbook, "sheet")[0];
  if (!firstSheet) return [];
  const relId = firstSheet.getAttribute("r:id") || firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const target = relId ? workbookRels.get(relId) : undefined;
  if (!target) throw new Error("Could not resolve first worksheet.");
  const normalizedTarget = target.replace(/^\/+/, "");
  const sheetPath = normalizedTarget.startsWith("xl/") ? normalizedTarget : `xl/${normalizedTarget}`;
  const rows = parseSheetRows(readText(sheetPath), sharedStrings, parseXml);
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => trimCell(header));
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return counts;
}

export async function parseItemsFile(file: File): Promise<ParsedItemsImport> {
  return parseItemsRows(await rawRowsFromFile(file));
}

export function parseItemsRows(rawRows: RawRow[]): ParsedItemsImport {
  const issues: ImportIssue[] = [];
  const rows = rawRows.map((raw, index) => {
    const rowNumber = index + 2;
    const databaseCode = trimCell(raw.database_code);
    const itemCode = trimCell(raw.item_code);
    const itemType = trimCell(raw.item_type);
    const item = trimCell(raw.item);
    const unitOfMeasure = trimCell(raw.unit_of_measure);
    const active = parseActive(raw.active, rowNumber, issues);
    const cost = parseCost(raw.cost, rowNumber, issues);

    if (!databaseCode) {
      issues.push({ severity: "error", row: rowNumber, field: "database_code", message: "Missing database_code." });
    }
    if (!itemCode) {
      issues.push({ severity: "warning", row: rowNumber, field: "item_code", message: "Missing item_code." });
    }
    if (!item) {
      issues.push({ severity: "error", row: rowNumber, field: "item", message: "Missing item name." });
    }
    if (!unitOfMeasure) {
      issues.push({
        severity: "warning",
        row: rowNumber,
        field: "unit_of_measure",
        message: "Missing unit_of_measure; entry form will fall back to each and show a warning."
      });
    } else if (!(ALLOWED_UNITS as readonly string[]).includes(unitOfMeasure)) {
      issues.push({
        severity: "error",
        row: rowNumber,
        field: "unit_of_measure",
        message: `Invalid unit_of_measure "${unitOfMeasure}". Use each, box, or daily.`
      });
    }

    return {
      rowNumber,
      databaseCode,
      itemCode,
      itemType,
      item,
      unitOfMeasure,
      active,
      cost
    };
  });

  const itemNameCounts = countBy(rows.map((row) => row.item.toLowerCase()));
  const itemCodeCounts = countBy(rows.map((row) => row.itemCode.toLowerCase()));
  const duplicateItemNames = [...itemNameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  const duplicateItemCodes = [...itemCodeCounts.entries()].filter(([, count]) => count > 1).map(([code]) => code);

  rows.forEach((row) => {
    if (row.item && itemNameCounts.get(row.item.toLowerCase())! > 1) {
      issues.push({
        severity: "warning",
        row: row.rowNumber,
        field: "item",
        message: `Duplicate item name "${row.item}". The selector will disambiguate with type/code labels.`
      });
    }
    if (row.itemCode && itemCodeCounts.get(row.itemCode.toLowerCase())! > 1) {
      issues.push({
        severity: "warning",
        row: row.rowNumber,
        field: "item_code",
        message: `Duplicate item_code "${row.itemCode}". database_code remains the stable item key.`
      });
    }
  });

  return { rows, issues, duplicateItemNames, duplicateItemCodes };
}

export async function parseProjectUsersFile(file: File): Promise<ParsedProjectUsersImport> {
  const rawRows = await rawRowsFromFile(file);
  const issues: ImportIssue[] = [];
  const rows = rawRows.map((raw, index) => {
    const rowNumber = index + 2;
    const projectCode = trimCell(raw.project);
    const displayName = trimCell(raw.user);
    if (!projectCode) issues.push({ severity: "error", row: rowNumber, field: "project", message: "Missing project." });
    if (!displayName) issues.push({ severity: "error", row: rowNumber, field: "user", message: "Missing user." });
    return { rowNumber, projectCode, displayName };
  });

  const projects = [...new Set(rows.map((row) => row.projectCode).filter(Boolean))].sort();
  const users = [...new Set(rows.map((row) => row.displayName).filter(Boolean))].sort();
  return { rows, projects, users, issues };
}

export function projectIdFromCode(projectCode: string): string {
  return projectCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function itemIdFromDatabaseCode(databaseCode: string): string {
  return databaseCode.trim();
}

function parseRelationships(xml: string, parseXml: XmlParser): Map<string, string> {
  const doc = parseXml(xml);
  return new Map(
    elementsByLocalName(doc, "Relationship").map((node) => [
      node.getAttribute("Id") || "",
      node.getAttribute("Target") || ""
    ])
  );
}

function parseSharedStrings(xml: string, parseXml: XmlParser): string[] {
  const doc = parseXml(xml);
  return elementsByLocalName(doc, "si").map((node) =>
    elementsByLocalName(node, "t")
      .map((textNode) => textNode.textContent || "")
      .join("")
  );
}

function parseSheetRows(xml: string, sharedStrings: string[], parseXml: XmlParser): string[][] {
  const doc = parseXml(xml);
  return elementsByLocalName(doc, "row").map((row) => {
    const values: string[] = [];
    elementsByLocalName(row, "c").forEach((cell) => {
      const index = cellIndex(cell.getAttribute("r") || "A1");
      values[index] = cellText(cell, sharedStrings);
    });
    return values.map((value) => value ?? "");
  });
}

function cellText(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return elementsByLocalName(cell, "t").map((node) => node.textContent || "").join("");
  const value = firstElementByLocalName(cell, "v")?.textContent || "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  return value;
}

function elementsByLocalName(root: ParentNode, localName: string): Element[] {
  return Array.from(root.childNodes).flatMap((node) => {
    if (node.nodeType !== 1) return [];
    const element = node as Element;
    const self = element.localName === localName ? [element] : [];
    return [...self, ...elementsByLocalName(element, localName)];
  });
}

function firstElementByLocalName(root: ParentNode, localName: string): Element | undefined {
  return elementsByLocalName(root, localName)[0];
}

function cellIndex(ref: string): number {
  const letters = ref.replace(/[^A-Za-z]/g, "").toUpperCase();
  return [...letters].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
