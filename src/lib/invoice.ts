import { strToU8, unzipSync, zipSync } from "fflate";
import { todayInSydney } from "./date";

const TEMPLATE_URL = `${import.meta.env?.BASE_URL ?? "/"}invoice_template_20260605.xlsx`;
const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const DATA_START_ROW = 12;
const TEMPLATE_DATA_END_ROW = 28;
const TEMPLATE_TOTAL_ROW = 31;
const TEMPLATE_NOTE_START_ROW = 33;
const TEMPLATE_NOTE_END_ROW = 36;

export type InvoiceLine = {
  projectCode: string;
  itemType: string;
  itemName: string;
  unitOfMeasure: string;
  amount: number;
  cost: number;
};

export async function downloadInvoiceXlsx({
  projectCode,
  projectName,
  invoiceMonth,
  invoiceYear,
  lines
}: {
  projectCode: string;
  projectName: string;
  invoiceMonth: string;
  invoiceYear: number;
  lines: InvoiceLine[];
}): Promise<void> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error("Could not load invoice template.");
  const buffer = await response.arrayBuffer();
  const bytes = buildInvoiceWorkbook(buffer, {
    projectCode,
    projectName,
    invoiceMonth,
    invoiceYear,
    lines
  });
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  const fileName = `${safeFilePart(projectCode)}_${invoiceMonth}_${invoiceYear}_Billing-Summary_${todayInSydney().replace(/-/g, "")}.xlsx`;
  downloadBlob(
    new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }),
    fileName
  );
}

export function buildInvoiceWorkbook(
  templateBuffer: ArrayBuffer,
  {
    projectCode,
    projectName,
    invoiceMonth,
    invoiceYear,
    lines
  }: {
    projectCode: string;
    projectName: string;
    invoiceMonth: string;
    invoiceYear: number;
    lines: InvoiceLine[];
  }
): Uint8Array {
  const files = unzipSync(new Uint8Array(templateBuffer));
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheetXml = readText(files, sheetPath);
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const doc = parser.parseFromString(sheetXml, "application/xml");
  const sheetData = firstElementByLocalName(doc, "sheetData");
  if (!sheetData) throw new Error("Invoice template has no sheet data.");

  const templateRows = new Map(
    elementsByLocalName(sheetData, "row").map((row) => [Number(row.getAttribute("r")), row])
  );
  const dataTemplate = templateRows.get(DATA_START_ROW);
  const blankTemplateA = templateRows.get(TEMPLATE_DATA_END_ROW + 1);
  const blankTemplateB = templateRows.get(TEMPLATE_DATA_END_ROW + 2);
  const totalTemplate = templateRows.get(TEMPLATE_TOTAL_ROW);
  const noteTemplates = range(TEMPLATE_NOTE_START_ROW, TEMPLATE_NOTE_END_ROW).map((rowNumber) => templateRows.get(rowNumber));
  if (!dataTemplate || !blankTemplateA || !blankTemplateB || !totalTemplate || noteTemplates.some((row) => !row)) {
    throw new Error("Invoice template rows are not in the expected layout.");
  }

  setCellValue(doc, rowByNumber(sheetData, 1), "A", `${projectCode} - ${projectName}`, "text");
  setCellValue(doc, rowByNumber(sheetData, 7), "A", `Billing Summary - ${invoiceMonth} ${invoiceYear}`, "text");

  elementsByLocalName(sheetData, "row")
    .filter((row) => Number(row.getAttribute("r")) >= DATA_START_ROW)
    .forEach((row) => sheetData.removeChild(row));

  const invoiceLines = lines.length > 0 ? lines : [{
    projectCode,
    itemType: "",
    itemName: "",
    unitOfMeasure: "",
    amount: 0,
    cost: 0
  }];
  const total = invoiceLines.reduce((sum, line) => sum + roundMoney(line.amount * line.cost), 0);
  const lastDataRow = DATA_START_ROW + invoiceLines.length - 1;
  const firstBlankRow = lastDataRow + 1;
  const secondBlankRow = lastDataRow + 2;
  const totalRowNumber = lastDataRow + 3;
  const noteStartRow = totalRowNumber + 2;
  const lastRow = noteStartRow + 3;

  invoiceLines.forEach((line, index) => {
    const rowNumber = DATA_START_ROW + index;
    const row = cloneRowForNumber(dataTemplate, rowNumber);
    const lineTotal = roundMoney(line.amount * line.cost);
    setCellValue(doc, row, "A", index + 1, "number");
    setCellValue(doc, row, "B", line.projectCode, "text");
    setCellValue(doc, row, "C", line.itemType, "text");
    setCellValue(doc, row, "D", line.itemName, "text");
    setCellValue(doc, row, "E", line.unitOfMeasure, "text");
    setCellValue(doc, row, "F", line.amount, "number");
    setCellValue(doc, row, "G", line.cost, "number");
    setCellFormula(doc, row, "H", `G${rowNumber}*F${rowNumber}`, lineTotal);
    sheetData.appendChild(row);
  });

  sheetData.appendChild(cloneRowForNumber(blankTemplateA, firstBlankRow));
  sheetData.appendChild(cloneRowForNumber(blankTemplateB, secondBlankRow));

  const totalRow = cloneRowForNumber(totalTemplate, totalRowNumber);
  setCellFormula(doc, totalRow, "H", `SUM(H${DATA_START_ROW}:H${lastDataRow})`, roundMoney(total));
  sheetData.appendChild(totalRow);

  noteTemplates.forEach((template, index) => {
    sheetData.appendChild(cloneRowForNumber(template!, noteStartRow + index));
  });

  updateDimension(doc, lastRow);
  updateMergeRefs(doc, totalRowNumber, noteStartRow);
  files[sheetPath] = strToU8(serializer.serializeToString(doc));
  removeCalcChain(files, parser, serializer);
  return zipSync(files);
}

function updateDimension(doc: Document, lastRow: number): void {
  const dimension = firstElementByLocalName(doc, "dimension");
  if (dimension) dimension.setAttribute("ref", `A1:H${lastRow}`);
}

function updateMergeRefs(doc: Document, totalRow: number, noteStartRow: number): void {
  elementsByLocalName(doc, "mergeCell").forEach((cell) => {
    const ref = cell.getAttribute("ref");
    if (ref === "A31:G31") cell.setAttribute("ref", `A${totalRow}:G${totalRow}`);
    if (ref === "A33:H36") cell.setAttribute("ref", `A${noteStartRow}:H${noteStartRow + 3}`);
  });
}

function removeCalcChain(
  files: Record<string, Uint8Array>,
  parser: DOMParser,
  serializer: XMLSerializer
): void {
  delete files["xl/calcChain.xml"];
  removeRelationship(files, "xl/_rels/workbook.xml.rels", parser, serializer, "calcChain.xml");
  removeContentType(files, parser, serializer, "/xl/calcChain.xml");
}

function removeRelationship(
  files: Record<string, Uint8Array>,
  path: string,
  parser: DOMParser,
  serializer: XMLSerializer,
  target: string
): void {
  if (!files[path]) return;
  const doc = parser.parseFromString(readText(files, path), "application/xml");
  elementsByLocalName(doc, "Relationship")
    .filter((node) => node.getAttribute("Target") === target)
    .forEach((node) => node.parentNode?.removeChild(node));
  files[path] = strToU8(serializer.serializeToString(doc));
}

function removeContentType(
  files: Record<string, Uint8Array>,
  parser: DOMParser,
  serializer: XMLSerializer,
  partName: string
): void {
  const path = "[Content_Types].xml";
  if (!files[path]) return;
  const doc = parser.parseFromString(readText(files, path), "application/xml");
  elementsByLocalName(doc, "Override")
    .filter((node) => node.getAttribute("PartName") === partName)
    .forEach((node) => node.parentNode?.removeChild(node));
  files[path] = strToU8(serializer.serializeToString(doc));
}

function rowByNumber(sheetData: Element, rowNumber: number): Element {
  const row = elementsByLocalName(sheetData, "row").find((entry) => Number(entry.getAttribute("r")) === rowNumber);
  if (!row) throw new Error(`Invoice template is missing row ${rowNumber}.`);
  return row;
}

function cloneRowForNumber(template: Element, rowNumber: number): Element {
  const row = template.cloneNode(true) as Element;
  row.setAttribute("r", String(rowNumber));
  elementsByLocalName(row, "c").forEach((cell) => {
    const column = columnFromCellRef(cell.getAttribute("r") || "A1");
    cell.setAttribute("r", `${column}${rowNumber}`);
  });
  return row;
}

function setCellValue(
  doc: Document,
  row: Element,
  column: string,
  value: string | number,
  kind: "text" | "number"
): void {
  const cell = ensureCell(doc, row, column);
  clearCell(cell);
  if (kind === "number") {
    cell.removeAttribute("t");
    const valueNode = doc.createElementNS(SHEET_NS, "v");
    valueNode.textContent = numberText(Number(value));
    cell.appendChild(valueNode);
    return;
  }

  cell.setAttribute("t", "inlineStr");
  const inline = doc.createElementNS(SHEET_NS, "is");
  const text = doc.createElementNS(SHEET_NS, "t");
  text.textContent = String(value);
  inline.appendChild(text);
  cell.appendChild(inline);
}

function setCellFormula(doc: Document, row: Element, column: string, formula: string, cachedValue: number): void {
  const cell = ensureCell(doc, row, column);
  clearCell(cell);
  cell.removeAttribute("t");
  const formulaNode = doc.createElementNS(SHEET_NS, "f");
  formulaNode.textContent = formula;
  const valueNode = doc.createElementNS(SHEET_NS, "v");
  valueNode.textContent = numberText(cachedValue);
  cell.appendChild(formulaNode);
  cell.appendChild(valueNode);
}

function ensureCell(doc: Document, row: Element, column: string): Element {
  const rowNumber = row.getAttribute("r") || "1";
  const ref = `${column}${rowNumber}`;
  const existing = elementsByLocalName(row, "c").find((cell) => cell.getAttribute("r") === ref);
  if (existing) return existing;
  const cell = doc.createElementNS(SHEET_NS, "c");
  cell.setAttribute("r", ref);
  row.appendChild(cell);
  return cell;
}

function clearCell(cell: Element): void {
  while (cell.firstChild) cell.removeChild(cell.firstChild);
}

function readText(files: Record<string, Uint8Array>, path: string): string {
  const file = files[path];
  if (!file) throw new Error(`Template is missing ${path}.`);
  return new TextDecoder().decode(file);
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

function columnFromCellRef(ref: string): string {
  return ref.replace(/[^A-Za-z]/g, "").toUpperCase();
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function numberText(value: number): string {
  return String(Number.isFinite(value) ? value : 0);
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, "_") || "project";
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
