import {
  FEEDBACK_STATUS_LABELS,
  type FeedbackItem,
} from "@/lib/feedback-types";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stringCell(value: string) {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function rowXml(values: string[]) {
  return `<Row>${values.map(stringCell).join("")}</Row>`;
}

export function buildFeedbackExcelXml(items: FeedbackItem[]) {
  const header = rowXml([
    "Id",
    "Comentario",
    "Estado",
    "Nota de estado",
    "Autor",
    "Creada",
    "Último estado",
  ]);
  const rows = items.map((item) =>
    rowXml([
      item.id,
      item.message,
      FEEDBACK_STATUS_LABELS[item.status],
      item.statusNote ?? "",
      item.authorEmail,
      formatWhen(item.createdAt),
      formatWhen(item.statusChangedAt),
    ]),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Mejoras">
  <Table>${header}${rows.join("")}</Table>
 </Worksheet>
</Workbook>`;
}

export function downloadFeedbackExcel(items: FeedbackItem[]) {
  const xml = `\uFEFF${buildFeedbackExcelXml(items)}`;
  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mejoras-${stamp}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
