import ExcelJS from "exceljs";

export const DESIGN_EXCEL_HEADERS = [
  "ID",
  "workstream",
  "bloque",
  "actividad",
  "Paso",
  "Duración",
  "dependencia 1",
  "dependencia 2",
  "dependencia 3",
  "dependencia 4",
  "Ejecutor",
  "Aprobador",
  "stepId",
] as const;

export type DesignExcelHeader = (typeof DESIGN_EXCEL_HEADERS)[number];

export type DesignExcelRow = {
  rowNumber: number;
  excelId: string;
  workstream: string;
  block: string;
  activity: string;
  step: string;
  durationRaw: string;
  depIds: string[];
  executorEmail: string;
  approverEmail: string;
};

export type DesignExcelParseError = {
  row: number;
  message: string;
};

export type DesignExcelCatalog = {
  workstreams: string[];
  blocks: string[];
  executorEmails: string[];
  approverEmails: string[];
};

export type DesignExcelPhotoRow = DesignExcelRow & {
  stepId: string;
};

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

function headerAliases(): Record<string, DesignExcelHeader> {
  return {
    id: "ID",
    workstream: "workstream",
    ws: "workstream",
    bloque: "bloque",
    block: "bloque",
    actividad: "actividad",
    activity: "actividad",
    paso: "Paso",
    step: "Paso",
    duracion: "Duración",
    duration: "Duración",
    minutos: "Duración",
    dependencia1: "dependencia 1",
    dep1: "dependencia 1",
    dependencia2: "dependencia 2",
    dep2: "dependencia 2",
    dependencia3: "dependencia 3",
    dep3: "dependencia 3",
    dependencia4: "dependencia 4",
    dep4: "dependencia 4",
    ejecutor: "Ejecutor",
    executor: "Ejecutor",
    aprobador: "Aprobador",
    approver: "Aprobador",
    stepid: "stepId",
  };
}

function fileSlug(eventName: string) {
  return eventName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export function designTemplateFileName(eventName: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `plantilla-plan-${fileSlug(eventName) || "evento"}-${stamp}.xlsx`;
}

export function designPhotoFileName(eventName: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `foto-plan-${fileSlug(eventName) || "evento"}-${stamp}.xlsx`;
}

export function designValidationFileName(eventName: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `validacion-plan-${fileSlug(eventName) || "evento"}-${stamp}.xlsx`;
}

function styleTitle(sheet: ExcelJS.Worksheet, text: string) {
  sheet.mergeCells("A1:M1");
  sheet.getCell("A1").value = text;
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  sheet.getCell("A1").alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(1).height = 28;
}

function styleInstructions(sheet: ExcelJS.Worksheet, text: string) {
  sheet.mergeCells("A2:M2");
  sheet.getCell("A2").value = text;
  sheet.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF334155" } };
  sheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 36;
}

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const headerRow = sheet.getRow(3);
  headerRow.values = [...DESIGN_EXCEL_HEADERS];
  headerRow.height = 18;
  for (let col = 1; col <= DESIGN_EXCEL_HEADERS.length; col += 1) {
    const cell = headerRow.getCell(col);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF155E75" },
    };
    cell.alignment = { vertical: "middle" };
  }
}

function applyColumnWidths(sheet: ExcelJS.Worksheet) {
  sheet.columns = [
    { width: 8 },
    { width: 22 },
    { width: 18 },
    { width: 24 },
    { width: 28 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 32 },
    { width: 32 },
    { width: 28 },
  ];
}

function catalogRange(colLetter: string, count: number) {
  const last = Math.max(2, 1 + count);
  return `Catalogo!$${colLetter}$2:$${colLetter}$${last}`;
}

function applyListValidation(
  sheet: ExcelJS.Worksheet,
  col: number,
  fromRow: number,
  toRow: number,
  formula: string,
) {
  for (let row = fromRow; row <= toRow; row += 1) {
    sheet.getCell(row, col).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: "Catálogo",
      error: "Elegí un valor de la hoja Catalogo.",
    };
  }
}

function writeCatalogSheet(
  workbook: ExcelJS.Workbook,
  catalog: DesignExcelCatalog,
) {
  const sheet = workbook.addWorksheet("Catalogo", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.getRow(1).values = [
    "workstream",
    "bloque",
    "Ejecutor (email)",
    "Aprobador (email)",
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (let col = 1; col <= 4; col += 1) {
    header.getCell(col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF155E75" },
    };
  }

  const max = Math.max(
    catalog.workstreams.length,
    catalog.blocks.length,
    catalog.executorEmails.length,
    catalog.approverEmails.length,
    1,
  );
  for (let i = 0; i < max; i += 1) {
    sheet.getRow(i + 2).values = [
      catalog.workstreams[i] ?? "",
      catalog.blocks[i] ?? "",
      catalog.executorEmails[i] ?? "",
      catalog.approverEmails[i] ?? "",
    ];
  }
  sheet.columns = [{ width: 28 }, { width: 22 }, { width: 36 }, { width: 36 }];
  return {
    ws: catalogRange("A", catalog.workstreams.length),
    blocks: catalogRange("B", catalog.blocks.length),
    executors: catalogRange("C", catalog.executorEmails.length),
    approvers: catalogRange("D", catalog.approverEmails.length),
  };
}

const PLAN_FIRST_DATA_ROW = 4;
const PLAN_LAST_CATALOG_ROW = 200;
const PLAN_MARKER_ROW = 201;
const PLAN_COLUMN_COUNT = DESIGN_EXCEL_HEADERS.length;

async function buildDesignWorkbook(input: {
  eventName: string;
  title: string;
  instructions: string;
  catalog: DesignExcelCatalog;
  rows: Array<Array<string | number>>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ControlX";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Plan", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  const ranges = writeCatalogSheet(workbook, input.catalog);
  styleTitle(sheet, input.title);
  styleInstructions(sheet, input.instructions);
  styleHeaderRow(sheet);
  applyColumnWidths(sheet);

  for (const values of input.rows) {
    sheet.addRow(values);
  }

  const filledThrough = PLAN_FIRST_DATA_ROW + input.rows.length - 1;
  for (
    let row = Math.max(filledThrough + 1, PLAN_FIRST_DATA_ROW);
    row <= PLAN_LAST_CATALOG_ROW;
    row += 1
  ) {
    sheet.getRow(row).values = [];
  }

  const marker = sheet.getRow(PLAN_MARKER_ROW);
  for (let col = 1; col <= PLAN_COLUMN_COUNT; col += 1) {
    const cell = marker.getCell(col);
    cell.value = "**";
    cell.alignment = { horizontal: "center" };
    cell.font = { bold: true, color: { argb: "FF64748B" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
  }

  if (input.catalog.workstreams.length) {
    applyListValidation(
      sheet,
      2,
      PLAN_FIRST_DATA_ROW,
      PLAN_LAST_CATALOG_ROW,
      ranges.ws,
    );
  }
  if (input.catalog.blocks.length) {
    applyListValidation(
      sheet,
      3,
      PLAN_FIRST_DATA_ROW,
      PLAN_LAST_CATALOG_ROW,
      ranges.blocks,
    );
  }
  if (input.catalog.executorEmails.length) {
    applyListValidation(
      sheet,
      11,
      PLAN_FIRST_DATA_ROW,
      PLAN_LAST_CATALOG_ROW,
      ranges.executors,
    );
  }
  if (input.catalog.approverEmails.length) {
    applyListValidation(
      sheet,
      12,
      PLAN_FIRST_DATA_ROW,
      PLAN_LAST_CATALOG_ROW,
      ranges.approvers,
    );
  }

  if (input.rows.length) {
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: {
        row: 3 + input.rows.length,
        column: PLAN_COLUMN_COUNT,
      },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildDesignTemplateWorkbook(
  eventName: string,
  catalog: DesignExcelCatalog,
): Promise<Buffer> {
  return buildDesignWorkbook({
    eventName,
    title: `Plantilla de plan — ${eventName}`,
    instructions:
      "Duración en minutos enteros. Ejecutor y Aprobador por email del Setup. ID es tu número para las dependencias. stepId dejalo vacío. Esta carga solo ambienta un diseño vacío; después la app es la verdad.",
    catalog,
    rows: [],
  });
}

export async function buildDesignPhotoWorkbook(
  eventName: string,
  catalog: DesignExcelCatalog,
  rows: DesignExcelPhotoRow[],
): Promise<Buffer> {
  return buildDesignWorkbook({
    eventName,
    title: `Foto del plan — ${eventName}`,
    instructions:
      "Foto de la app. No se vuelve a subir: para rehacer el diseño, Limpiar y usar la plantilla. stepId es el id interno; ID es solo para leer dependencias.",
    catalog,
    rows: rows.map((row) => [
      row.excelId,
      row.workstream,
      row.block,
      row.activity,
      row.step,
      row.durationRaw,
      row.depIds[0] ?? "",
      row.depIds[1] ?? "",
      row.depIds[2] ?? "",
      row.depIds[3] ?? "",
      row.executorEmail,
      row.approverEmail,
      row.stepId,
    ]),
  });
}

export async function parseDesignWorkbook(buffer: Buffer): Promise<{
  rows: DesignExcelRow[];
  errors: DesignExcelParseError[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet =
    workbook.getWorksheet("Plan") ??
    workbook.worksheets.find((item) => {
      const name = item.name.toLowerCase();
      return name !== "catalogo" && name !== "validaciones";
    }) ??
    workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ row: 1, message: "El archivo no tiene hojas." }],
    };
  }

  const aliases = headerAliases();
  let headerRowNumber = 0;
  const columnByKey = new Map<DesignExcelHeader, number>();

  sheet.eachRow((row, rowNumber) => {
    if (headerRowNumber) return;
    row.eachCell((cell, colNumber) => {
      const key = aliases[normalizeHeader(cellText(cell.value))];
      if (key && !columnByKey.has(key)) columnByKey.set(key, colNumber);
    });
    if (
      columnByKey.has("ID") &&
      columnByKey.has("workstream") &&
      columnByKey.has("Paso")
    ) {
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
          message: "No encontré las columnas ID, workstream y Paso.",
        },
      ],
    };
  }

  const rows: DesignExcelRow[] = [];
  const errors: DesignExcelParseError[] = [];
  const seenIds = new Map<string, number>();
  let pastMarker = false;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber || pastMarker) return;
    const firstCell = cellText(row.getCell(1).value);
    if (firstCell === "**") {
      pastMarker = true;
      return;
    }
    const read = (header: DesignExcelHeader) => {
      const col = columnByKey.get(header);
      if (!col) return "";
      return cellText(row.getCell(col).value);
    };

    const excelId = read("ID");
    const workstream = read("workstream");
    const block = read("bloque");
    const activity = read("actividad");
    const step = read("Paso");
    const durationRaw = read("Duración");
    const executorEmail = read("Ejecutor").toLowerCase();
    const approverEmail = read("Aprobador").toLowerCase();
    const depIds = [
      read("dependencia 1"),
      read("dependencia 2"),
      read("dependencia 3"),
      read("dependencia 4"),
    ].filter(Boolean);

    const empty =
      !excelId &&
      !workstream &&
      !block &&
      !activity &&
      !step &&
      !durationRaw &&
      !executorEmail &&
      !approverEmail &&
      !depIds.length;
    if (empty) return;

    if (!excelId) {
      errors.push({ row: rowNumber, message: "Falta el ID." });
      return;
    }
    const previous = seenIds.get(excelId);
    if (previous) {
      errors.push({
        row: rowNumber,
        message: `ID ${excelId} duplicado (ya está en la fila ${previous}).`,
      });
      return;
    }
    seenIds.set(excelId, rowNumber);

    rows.push({
      rowNumber,
      excelId,
      workstream,
      block,
      activity,
      step,
      durationRaw,
      depIds,
      executorEmail,
      approverEmail,
    });
  });

  return { rows, errors };
}

export type DesignValidationStamp = {
  eventName: string;
  rowCount: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
};

export async function stampValidationsSheet(
  buffer: Buffer,
  stamp: DesignValidationStamp,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const existing = workbook.getWorksheet("Validaciones");
  if (existing) workbook.removeWorksheet(existing.id);

  const sheet = workbook.addWorksheet("Validaciones", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  const errorCount = stamp.errors.length;
  const warningCount = stamp.warnings.length;
  const verdict =
    stamp.rowCount === 0
      ? "SIN FILAS"
      : errorCount
        ? "CON ERRORES"
        : warningCount
          ? "CON AVISOS"
          : "LISTO";

  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = `Validación de carga masiva — ${stamp.eventName}`;
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  sheet.getRow(1).height = 22;

  sheet.mergeCells("A2:C2");
  sheet.getCell("A2").value =
    `${verdict}. ${stamp.rowCount} filas leídas · ${errorCount} error(es) · ${warningCount} aviso(s). No se actualizó la base de datos.`;
  sheet.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF334155" } };
  sheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 28;

  const header = sheet.getRow(4);
  header.values = ["Nivel", "Fila", "Mensaje"];
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (let col = 1; col <= 3; col += 1) {
    header.getCell(col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF155E75" },
    };
  }

  const lines: Array<{ level: string; row: string; message: string; error: boolean }> =
    [
      ...stamp.errors.map((item) => ({
        level: "ERROR",
        row: item.row ? String(item.row) : "—",
        message: item.message,
        error: true,
      })),
      ...stamp.warnings.map((item) => ({
        level: "AVISO",
        row: item.row ? String(item.row) : "—",
        message: item.message,
        error: false,
      })),
    ];
  if (!lines.length) {
    lines.push({
      level: "OK",
      row: "—",
      message:
        stamp.rowCount === 0
          ? "No hay filas para validar."
          : "Sin errores ni avisos. El archivo se podría cargar si el diseño está vacío.",
      error: false,
    });
  }

  lines.forEach((line, index) => {
    const row = sheet.getRow(5 + index);
    row.values = [line.level, line.row, line.message];
    if (line.level === "ERROR") {
      row.getCell(1).font = { bold: true, color: { argb: "FFB91C1C" } };
    } else if (line.level === "AVISO") {
      row.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
    } else {
      row.getCell(1).font = { bold: true, color: { argb: "FF047857" } };
    }
  });

  sheet.columns = [{ width: 12 }, { width: 10 }, { width: 88 }];
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4 + Math.max(1, lines.length), column: 3 },
  };

  const tabIndex = workbook.worksheets.findIndex(
    (item) => item.name === "Validaciones",
  );
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 12000,
      height: 8000,
      firstSheet: 0,
      activeTab: Math.max(0, tabIndex),
      visibility: "visible",
    },
  ];

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
