import ExcelJS from "exceljs";

import type { EventActorRole, EventActorSummary } from "@/lib/event-actors";

export const ACTOR_EXCEL_HEADERS = [
  "nombre",
  "email",
  "Area",
  "EventAdmin",
  "Ejecutor",
  "Aprobador",
  "Steerco",
] as const;

export type ActorExcelRow = {
  rowNumber: number;
  name: string;
  email: string;
  area: string;
  roles: EventActorRole[];
};

export type ActorExcelParseError = {
  row: number;
  email: string;
  message: string;
};

const ROLE_COLUMNS: Array<{
  header: (typeof ACTOR_EXCEL_HEADERS)[number];
  role: EventActorRole;
}> = [
  { header: "EventAdmin", role: "EVENT_ADMIN" },
  { header: "Ejecutor", role: "EXECUTOR" },
  { header: "Aprobador", role: "APPROVER" },
  { header: "Steerco", role: "STEERCO" },
];

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "boolean") return value ? "SI" : "";
  if (value instanceof Date) return "";
  if (typeof value === "object" && "text" in value) {
    return String(value.text ?? "").trim();
  }
  if (typeof value === "object" && "richText" in value) {
    return (value.richText ?? []).map((part) => part.text).join("").trim();
  }
  if (typeof value === "object" && "result" in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return "";
}

function isRoleMarked(value: string) {
  const needle = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return ["si", "s", "x", "1", "true", "yes"].includes(needle);
}

function headerAliases(): Record<string, (typeof ACTOR_EXCEL_HEADERS)[number]> {
  return {
    nombre: "nombre",
    name: "nombre",
    email: "email",
    correo: "email",
    mail: "email",
    area: "Area",
    eventadmin: "EventAdmin",
    ejecutor: "Ejecutor",
    executor: "Ejecutor",
    aprobador: "Aprobador",
    approver: "Aprobador",
    steerco: "Steerco",
  };
}

export function actorExcelFileName(eventName: string) {
  const slug = eventName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `actores-${slug || "evento"}-${stamp}.xlsx`;
}

export async function buildActorsWorkbook(
  eventName: string,
  actors: EventActorSummary[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ControlX";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Actores", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = `Actores — ${eventName}`;
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 22;

  sheet.mergeCells("A2:G2");
  sheet.getCell("A2").value =
    "En EventAdmin, Ejecutor, Aprobador y Steerco escribí SI o dejá vacío. El email es la clave: si ya existe, se actualiza.";
  sheet.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF334155" } };
  sheet.getRow(2).height = 18;

  const headerRow = sheet.getRow(3);
  headerRow.values = [...ACTOR_EXCEL_HEADERS];
  headerRow.height = 18;
  for (let col = 1; col <= 7; col += 1) {
    const cell = headerRow.getCell(col);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF155E75" },
    };
    cell.alignment = { vertical: "middle" };
  }

  const sorted = [...actors].sort((a, b) => a.name.localeCompare(b.name, "es"));
  for (const actor of sorted) {
    sheet.addRow([
      actor.name,
      actor.email,
      actor.area,
      actor.roles.includes("EVENT_ADMIN") ? "SI" : "",
      actor.roles.includes("EXECUTOR") ? "SI" : "",
      actor.roles.includes("APPROVER") ? "SI" : "",
      actor.roles.includes("STEERCO") ? "SI" : "",
    ]);
  }

  sheet.columns = [
    { width: 28 },
    { width: 36 },
    { width: 22 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
  ];

  if (sorted.length) {
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3 + sorted.length, column: 7 },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseActorsWorkbook(buffer: Buffer): Promise<{
  rows: ActorExcelRow[];
  errors: ActorExcelParseError[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ row: 1, email: "", message: "El archivo no tiene hojas." }],
    };
  }

  const aliases = headerAliases();
  let headerRowNumber = 0;
  const columnByKey = new Map<
    (typeof ACTOR_EXCEL_HEADERS)[number],
    number
  >();

  sheet.eachRow((row, rowNumber) => {
    if (headerRowNumber) return;
    row.eachCell((cell, colNumber) => {
      const key = aliases[normalizeHeader(cellText(cell.value))];
      if (key && !columnByKey.has(key)) columnByKey.set(key, colNumber);
    });
    if (columnByKey.has("nombre") && columnByKey.has("email")) {
      headerRowNumber = rowNumber;
    } else {
      columnByKey.clear();
    }
  });

  if (!headerRowNumber) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          email: "",
          message: "No encontré las columnas nombre y email.",
        },
      ],
    };
  }

  const rows: ActorExcelRow[] = [];
  const errors: ActorExcelParseError[] = [];
  const seenEmails = new Map<string, number>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const read = (header: (typeof ACTOR_EXCEL_HEADERS)[number]) => {
      const col = columnByKey.get(header);
      if (!col) return "";
      return cellText(row.getCell(col).value);
    };

    const name = read("nombre");
    const email = read("email").toLowerCase();
    const area = read("Area");
    const empty = !name && !email && !area;
    if (empty) return;

    if (!name) {
      errors.push({ row: rowNumber, email, message: "Falta el nombre." });
      return;
    }
    if (!email || !email.includes("@")) {
      errors.push({
        row: rowNumber,
        email,
        message: "Email inválido.",
      });
      return;
    }
    if (!area) {
      errors.push({ row: rowNumber, email, message: "Falta el área." });
      return;
    }

    const previous = seenEmails.get(email);
    if (previous) {
      errors.push({
        row: rowNumber,
        email,
        message: `Email duplicado en el archivo (ya está en la fila ${previous}).`,
      });
      return;
    }
    seenEmails.set(email, rowNumber);

    const roles = ROLE_COLUMNS.flatMap(({ header, role }) =>
      isRoleMarked(read(header)) ? [role] : [],
    );
    if (!roles.length) {
      errors.push({
        row: rowNumber,
        email,
        message: "Marcá al menos un rol con SI.",
      });
      return;
    }

    rows.push({ rowNumber, name, email, area, roles });
  });

  return { rows, errors };
}
