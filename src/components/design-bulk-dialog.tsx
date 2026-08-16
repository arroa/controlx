"use client";

import {
  ClipboardCheck,
  Download,
  Eraser,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EventReadiness } from "@/lib/event-readiness-types";

type BulkStatus = {
  stepCount: number;
  activityCount: number;
  gateCount: number;
  executionCount: number;
  canImport: boolean;
  archived: boolean;
};

type BulkIssue = { row: number; message: string; level?: string };

export function DesignBulkDialog({
  eventId,
  eventName,
  open,
  onOpenChange,
  onReadinessChange,
}: {
  eventId: string;
  eventName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReadinessChange: (readiness: EventReadiness) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validateInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<BulkStatus | null>(null);
  const [busy, setBusy] = useState<
    "status" | "template" | "photo" | "import" | "validate" | "clear" | null
  >(null);
  const [error, setError] = useState("");
  const [okMessage, setOkMessage] = useState("");
  const [issues, setIssues] = useState<BulkIssue[]>([]);
  const [warnings, setWarnings] = useState<BulkIssue[]>([]);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");

  useEffect(() => {
    if (!open) {
      setClearing(false);
      setClearConfirm("");
      setError("");
      setOkMessage("");
      setIssues([]);
      setWarnings([]);
      return;
    }
    setBusy("status");
    void fetch(`/api/events/${eventId}/design-bulk`)
      .then(async (response) => {
        const payload = (await response.json()) as BulkStatus & {
          error?: string;
        };
        if (!response.ok) {
          setError(payload.error ?? "No pude leer el estado.");
          setStatus(null);
          return;
        }
        setStatus(payload);
      })
      .catch(() => setError("No pude leer el estado."))
      .finally(() => setBusy(null));
  }, [eventId, open]);

  async function download(kind: "template" | "photo") {
    setBusy(kind);
    setError("");
    const path =
      kind === "template"
        ? `/api/events/${eventId}/design-bulk/template`
        : `/api/events/${eventId}/design-bulk/export`;
    const response = await fetch(
      `${path}?name=${encodeURIComponent(eventName)}`,
    ).catch(() => null);
    if (!response?.ok) {
      const payload = response
        ? ((await response.json()) as { error?: string })
        : null;
      setError(payload?.error ?? "No fue posible descargar.");
      setBusy(null);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download =
      kind === "template"
        ? `plantilla-plan-${stamp}.xlsx`
        : `foto-plan-${stamp}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBusy(null);
    setOkMessage(kind === "template" ? "Plantilla descargada." : "Foto descargada.");
  }

  function saveXlsx(bytes: Blob, filename: string) {
    const url = URL.createObjectURL(bytes);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function validateExcel(file: File) {
    setBusy("validate");
    setError("");
    setOkMessage("");
    setIssues([]);
    setWarnings([]);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(
      `/api/events/${eventId}/design-bulk/validate`,
      { method: "POST", body },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          error?: string;
          ok?: boolean;
          rowCount?: number;
          errorCount?: number;
          warningCount?: number;
          errors?: BulkIssue[];
          warnings?: BulkIssue[];
          filename?: string;
          fileBase64?: string;
        })
      : null;
    if (validateInputRef.current) validateInputRef.current.value = "";
    setBusy(null);
    if (!response?.ok || !payload) {
      setError(payload?.error ?? "No fue posible validar.");
      return;
    }
    setIssues(payload.errors ?? []);
    setWarnings(payload.warnings ?? []);
    const rows = payload.rowCount ?? 0;
    const errs = payload.errorCount ?? 0;
    const warns = payload.warningCount ?? 0;
    const summary = payload.ok
      ? `${rows} filas · listo para cargar (si el diseño está vacío). No se tocó la base.`
      : `${rows} filas · ${errs} error(es) · ${warns} aviso(s). No se tocó la base.`;
    if (payload.ok) setOkMessage(summary);
    else setError(summary);
    if (payload.fileBase64 && payload.filename) {
      const bytes = Uint8Array.from(atob(payload.fileBase64), (char) =>
        char.charCodeAt(0),
      );
      saveXlsx(new Blob([bytes]), payload.filename);
    }
  }

  async function uploadExcel(file: File) {
    setBusy("import");
    setError("");
    setOkMessage("");
    setIssues([]);
    setWarnings([]);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`/api/events/${eventId}/design-bulk/import`, {
      method: "POST",
      body,
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          error?: string;
          stepCount?: number;
          activityCount?: number;
          errors?: BulkIssue[];
          warnings?: BulkIssue[];
          readiness?: EventReadiness;
        })
      : null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setBusy(null);
    if (!response?.ok) {
      setError(payload?.error ?? "No fue posible cargar.");
      setIssues(payload?.errors ?? []);
      setWarnings(payload?.warnings ?? []);
      return;
    }
    setWarnings(payload?.warnings ?? []);
    setOkMessage(
      `Se ambientaron ${payload?.stepCount ?? 0} pasos en ${payload?.activityCount ?? 0} actividades.`,
    );
    if (payload?.readiness) onReadinessChange(payload.readiness);
    const next = await fetch(`/api/events/${eventId}/design-bulk`).then(
      (item) => item.json() as Promise<BulkStatus>,
    );
    setStatus(next);
  }

  async function clearAll() {
    if (clearConfirm !== "LIMPIAR") return;
    setBusy("clear");
    setError("");
    const response = await fetch(`/api/events/${eventId}/design-bulk/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "LIMPIAR" }),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          error?: string;
          deletedSteps?: number;
          deletedGates?: number;
          deletedExecutions?: number;
          readiness?: EventReadiness;
        })
      : null;
    setBusy(null);
    if (!response?.ok) {
      setError(payload?.error ?? "No fue posible limpiar.");
      return;
    }
    setClearing(false);
    setClearConfirm("");
    setOkMessage(
      `Borrados ${payload?.deletedSteps ?? 0} pasos, ${payload?.deletedGates ?? 0} gates y ${payload?.deletedExecutions ?? 0} ejecuciones.`,
    );
    if (payload?.readiness) onReadinessChange(payload.readiness);
    const next = await fetch(`/api/events/${eventId}/design-bulk`).then(
      (item) => item.json() as Promise<BulkStatus>,
    );
    setStatus(next);
  }

  const locked = Boolean(busy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Carga masiva</DialogTitle>
          <DialogDescription>
            El Excel ambienta un diseño vacío. Después la app es la fuente de
            verdad: deps, pasos y gates se afinan acá.
          </DialogDescription>
        </DialogHeader>

        {clearing ? (
          <div className="space-y-3">
            <p className="text-sm text-rose-200">
              Esto borra diseño, roles de paso, plan, gates y ejecuciones
              (también REAL). Setup (WS, bloques, actores) se queda. Escribí{" "}
              <strong>LIMPIAR</strong>.
            </p>
            <Input
              value={clearConfirm}
              onChange={(event) => setClearConfirm(event.target.value)}
              placeholder="LIMPIAR"
              aria-label="Escribí LIMPIAR para confirmar"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setClearing(false);
                  setClearConfirm("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={locked || clearConfirm !== "LIMPIAR"}
                onClick={() => void clearAll()}
              >
                {busy === "clear" ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : null}
                Borrar todo
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <ActionRow
              icon={FileSpreadsheet}
              title="Descargar plantilla"
              detail="Vacía, con catálogo de WS, bloques y emails."
              disabled={locked}
              loading={busy === "template"}
              onClick={() => void download("template")}
            />
            <ActionRow
              icon={Download}
              title="Descargar foto actual"
              detail="Lo que hay hoy en la app. No se vuelve a subir."
              disabled={locked}
              loading={busy === "photo"}
              onClick={() => void download("photo")}
            />
            <ActionRow
              icon={ClipboardCheck}
              title="Validar bulk"
              detail="Subí el Excel: resumen acá y hoja Validaciones. No escribe en la base."
              disabled={locked}
              loading={busy === "validate"}
              onClick={() => validateInputRef.current?.click()}
            />
            <ActionRow
              icon={Eraser}
              title="Limpiar"
              detail="Parte de cero: diseño, gates y ejecuciones."
              disabled={locked || status?.archived}
              tone="danger"
              onClick={() => {
                setClearing(true);
                setClearConfirm("");
              }}
            />
            <ActionRow
              icon={Upload}
              title="Subir bulk"
              detail={
                status?.canImport
                  ? "Valida el archivo y ambienta el diseño."
                  : "Solo con diseño vacío. Limpiá primero."
              }
              disabled={locked || !status?.canImport}
              loading={busy === "import"}
              onClick={() => fileInputRef.current?.click()}
            />
            <input
              ref={validateInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void validateExcel(file);
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadExcel(file);
              }}
            />
          </div>
        )}

        {busy === "status" ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            Leyendo estado…
          </p>
        ) : status ? (
          <p className="text-xs text-muted-foreground">
            {status.stepCount} pasos · {status.activityCount} actividades ·{" "}
            {status.gateCount} gates · {status.executionCount} ejecuciones
          </p>
        ) : null}

        {okMessage ? (
          <p className="text-sm text-emerald-300">{okMessage}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        {issues.length ? (
          <IssueList title="Errores" items={issues} tone="error" />
        ) : null}
        {warnings.length ? (
          <IssueList title="Avisos" items={warnings} tone="warn" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({
  icon: Icon,
  title,
  detail,
  disabled,
  loading,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  disabled?: boolean;
  loading?: boolean;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-50 ${
        tone === "danger"
          ? "border-rose-500/30 hover:bg-rose-500/10"
          : "border-border hover:bg-muted/40"
      }`}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {loading ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}

function IssueList({
  title,
  items,
  tone,
}: {
  title: string;
  items: BulkIssue[];
  tone: "error" | "warn";
}) {
  const shown = items.slice(0, 8);
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        tone === "error"
          ? "border-rose-500/30 text-rose-200"
          : "border-amber-500/30 text-amber-200"
      }`}
    >
      <p className="font-medium">
        {title} ({items.length})
      </p>
      <ul className="mt-1 space-y-0.5">
        {shown.map((item, index) => (
          <li key={`${item.row}-${index}`}>
            {item.row ? `Fila ${item.row}: ` : null}
            {item.message}
          </li>
        ))}
      </ul>
      {items.length > shown.length ? (
        <p className="mt-1 opacity-80">
          …y {items.length - shown.length} más.
        </p>
      ) : null}
    </div>
  );
}
