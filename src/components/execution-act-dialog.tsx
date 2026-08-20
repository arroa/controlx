"use client";

import { Paperclip, X } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";

import {
  zonedInputToIso,
  zonedPartsFromIso,
} from "@/components/datetime-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVIDENCE_MAX_BYTES } from "@/lib/evidence-limits";
import { formatDayTimeLabel } from "@/lib/execution-schedule";
import {
  actionNeedsOccurredAt,
  actionNeedsStartTime,
  defaultActOccurredAt,
  type RuntimeStepAction,
} from "@/lib/execution-types";
import { cn } from "@/lib/utils";

const MINUTE_STEP = 1;
/** Compacto para mobile: 3 filas visibles × 34px. */
const ITEM_H = 34;
const VISIBLE = 3;
const PAD = Math.floor(VISIBLE / 2);
const WHEEL_H = VISIBLE * ITEM_H;

export type ExecutionActAction =
  | "start"
  | "restart"
  | "complete_success"
  | "complete_fail"
  | "force_success"
  | "reject";

const ACTION_TITLE: Record<ExecutionActAction, string> = {
  start: "Iniciar",
  restart: "Rearrancar",
  complete_success: "Marcar como Exitoso",
  complete_fail: "Marcar como Fallido",
  force_success: "Forzar OK",
  reject: "Rechazar",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function roundToStep(minute: number) {
  const stepped = Math.round(minute / MINUTE_STEP) * MINUTE_STEP;
  return Math.min(60 - MINUTE_STEP, Math.max(0, stepped));
}

function dayKeyFromParts(parts: {
  year: number;
  month: number;
  day: number;
}) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function partsFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return { year, month, day };
}

function addCalendarDays(dayKey: string, delta: number) {
  const { year, month, day } = partsFromDayKey(dayKey);
  const date = new Date(year, month - 1, day + delta);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDayChip(dayKey: string) {
  const { year, month, day } = partsFromDayKey(dayKey);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function offsetLabel(iso: string, anchorStartAt: string | null) {
  if (!anchorStartAt) return null;
  const mins = Math.round(
    (new Date(iso).getTime() - new Date(anchorStartAt).getTime()) / 60_000,
  );
  const sign = mins < 0 ? "−" : "+";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `T0 ${sign}${m} min`;
  if (m === 0) return `T0 ${sign}${h} h`;
  return `T0 ${sign}${h} h ${m} min`;
}

type WheelItem = { value: string; label: string };

function WheelColumn({
  items,
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  items: WheelItem[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);
  const index = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );

  const syncScroll = useEffectEvent((nextIndex: number, smooth: boolean) => {
    const node = scrollerRef.current;
    if (!node) return;
    lockRef.current = true;
    node.scrollTo({
      top: nextIndex * ITEM_H,
      behavior: smooth ? "smooth" : "instant",
    });
    window.setTimeout(() => {
      lockRef.current = false;
    }, smooth ? 280 : 40);
  });

  useEffect(() => {
    syncScroll(index, false);
  }, [index, items.length, syncScroll]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (disabled || lockRef.current) return;
    const top = event.currentTarget.scrollTop;
    const nextIndex = Math.min(
      items.length - 1,
      Math.max(0, Math.round(top / ITEM_H)),
    );
    const next = items[nextIndex];
    if (next && next.value !== value) onChange(next.value);
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-md border border-primary/35 bg-primary/10"
        style={{ height: ITEM_H }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-7 bg-gradient-to-b from-background to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-7 bg-gradient-to-t from-background to-transparent"
      />
      <div
        ref={scrollerRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={`${ariaLabel}-${value}`}
        tabIndex={disabled ? -1 : 0}
        onScroll={handleScroll}
        className={cn(
          "snap-y snap-mandatory overflow-y-auto overscroll-contain px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          disabled && "pointer-events-none opacity-50",
        )}
        style={{
          height: WHEEL_H,
          paddingTop: PAD * ITEM_H,
          paddingBottom: PAD * ITEM_H,
        }}
      >
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              id={`${ariaLabel}-${item.value}`}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onChange(item.value)}
              className={cn(
                "flex w-full snap-center items-center justify-center whitespace-nowrap text-center font-mono text-sm transition-colors",
                selected
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground/70",
              )}
              style={{ height: ITEM_H }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ExecutionActDialogProps = {
  open: boolean;
  action: ExecutionActAction | null;
  stepName: string;
  stepMeta?: string;
  /** Contingencia admin: actúa sin reemplazar al ejecutor asignado. */
  onBehalfOf?: string | null;
  timezone: string;
  anchorStartAt: string | null;
  plannedStartAt: string | null;
  /** Piso: término ≥ inicio del paso; inicio ≥ T0. */
  minOccurredAt?: string | null;
  minOccurredLabel?: string;
  occurredAt: string | null;
  onOccurredAtChange: (iso: string | null) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  blobConfigured: boolean;
  /** Si el paso exige adjunto para marcarlo como Exitoso. */
  evidenceRequired?: boolean;
  /** Adjuntos ya presentes en el paso (cuentan para el cierre). */
  existingEvidenceCount?: number;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ExecutionActDialog({
  open,
  action,
  stepName,
  stepMeta,
  onBehalfOf = null,
  timezone,
  anchorStartAt,
  plannedStartAt,
  minOccurredAt = null,
  minOccurredLabel,
  occurredAt,
  onOccurredAtChange,
  comment,
  onCommentChange,
  files,
  onFilesChange,
  blobConfigured,
  evidenceRequired = false,
  existingEvidenceCount = 0,
  busy,
  error,
  onCancel,
  onConfirm,
}: ExecutionActDialogProps) {
  const isStart = action ? actionNeedsStartTime(action as RuntimeStepAction) : false;
  const isForce = action === "force_success";
  const isReject = action === "reject";
  const needsComment = isForce || isReject;
  const needsTime = action
    ? actionNeedsOccurredAt(action as RuntimeStepAction)
    : false;
  const isSuccessClose = action === "complete_success";
  const needsEvidence = evidenceRequired && isSuccessClose;
  const hasEvidence = files.length > 0 || existingEvidenceCount > 0;
  const [localError, setLocalError] = useState("");
  const [timeClampHint, setTimeClampHint] = useState("");

  const effectiveIso = occurredAt ?? new Date().toISOString();
  const parts = useMemo(
    () => zonedPartsFromIso(effectiveIso, timezone),
    [effectiveIso, timezone],
  );

  const dayValue = dayKeyFromParts(parts);
  const hourValue = String(parts.hour);
  const minuteValue = String(roundToStep(parts.minute));

  const [dayCenter, setDayCenter] = useState(dayValue);

  useEffect(() => {
    if (open) {
      setDayCenter(dayKeyFromParts(zonedPartsFromIso(effectiveIso, timezone)));
      setLocalError("");
      setTimeClampHint("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al abrir

  const dayItems = useMemo(() => {
    return Array.from({ length: 21 }, (_, index) => {
      const key = addCalendarDays(dayCenter, index - 10);
      return { value: key, label: formatDayChip(key) };
    });
  }, [dayCenter]);

  const hourItems = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        value: String(hour),
        label: pad(hour),
      })),
    [],
  );

  const minuteItems = useMemo(
    () =>
      Array.from({ length: 60 / MINUTE_STEP }, (_, index) => {
        const minute = index * MINUTE_STEP;
        return { value: String(minute), label: pad(minute) };
      }),
    [],
  );

  const minMs = minOccurredAt ? new Date(minOccurredAt).getTime() : null;
  const belowMin =
    minMs != null &&
    occurredAt != null &&
    new Date(occurredAt).getTime() < minMs;

  function commitParts(next: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }) {
    const key = dayKeyFromParts(next);
    if (!dayItems.some((item) => item.value === key)) {
      setDayCenter(key);
    }
    const local = `${next.year}-${pad(next.month)}-${pad(next.day)}T${pad(next.hour)}:${pad(next.minute)}`;
    let iso = zonedInputToIso(local, timezone);
    if (minMs != null && new Date(iso).getTime() < minMs) {
      iso = new Date(minMs).toISOString();
      setTimeClampHint(
        minOccurredLabel ??
          (isStart
            ? "No puede ser anterior al T0 de la ejecución."
            : "No puede ser anterior al inicio del paso."),
      );
      const clamped = zonedPartsFromIso(iso, timezone);
      const clampedKey = dayKeyFromParts(clamped);
      if (!dayItems.some((item) => item.value === clampedKey)) {
        setDayCenter(clampedKey);
      }
    } else {
      setTimeClampHint("");
    }
    onOccurredAtChange(iso);
  }

  function setFromIso(iso: string) {
    const next = zonedPartsFromIso(iso, timezone);
    commitParts({ ...next, minute: roundToStep(next.minute) });
  }

  function shiftMinutes(delta: number) {
    const base = new Date(effectiveIso).getTime() + delta * 60_000;
    setFromIso(new Date(base).toISOString());
  }

  function addFiles(next: File[]) {
    const accepted: File[] = [];
    for (const file of next) {
      if (file.size > EVIDENCE_MAX_BYTES) {
        setLocalError(`“${file.name}” supera 10 MB.`);
        continue;
      }
      if (file.size <= 0) {
        setLocalError(`“${file.name}” está vacío.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) {
      if (accepted.length === next.length) setLocalError("");
      onFilesChange([...files, ...accepted]);
    }
  }

  const t0Hint = offsetLabel(effectiveIso, anchorStartAt);
  const canConfirm =
    Boolean(action) &&
    (!needsTime || (Boolean(occurredAt) && !belowMin)) &&
    (!needsComment || Boolean(comment.trim())) &&
    (!needsEvidence || hasEvidence);

  const displayError = localError || error;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1 border-b px-5 py-4 text-left">
          <DialogTitle>
            {action ? ACTION_TITLE[action] : "Acto"}
          </DialogTitle>
          <DialogDescription className="text-left">
            <span className="font-medium text-foreground/90">{stepName}</span>
            {stepMeta ? (
              <span className="text-muted-foreground"> · {stepMeta}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          {onBehalfOf ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Contingencia: actuás en nombre de {onBehalfOf}. El asignado no
              se reemplaza.
            </div>
          ) : null}
          {needsTime ? (
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-2">
              <Label className="text-base">
                {isStart
                  ? "Hora de inicio"
                  : isReject
                    ? "Hora del rechazo"
                    : "Hora de término"}
              </Label>
              {t0Hint ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t0Hint}
                </span>
              ) : null}
            </div>

            <div className="rounded-lg border bg-muted/20 px-1.5 py-0.5">
              <div className="flex gap-0.5">
                <WheelColumn
                  ariaLabel="día"
                  className="min-w-0 flex-[3]"
                  items={dayItems}
                  value={dayValue}
                  disabled={busy}
                  onChange={(nextDay) => {
                    const day = partsFromDayKey(nextDay);
                    commitParts({
                      ...day,
                      hour: parts.hour,
                      minute: roundToStep(parts.minute),
                    });
                  }}
                />
                <WheelColumn
                  ariaLabel="hora"
                  className="w-12 shrink-0"
                  items={hourItems}
                  value={hourValue}
                  disabled={busy}
                  onChange={(nextHour) => {
                    commitParts({
                      year: parts.year,
                      month: parts.month,
                      day: parts.day,
                      hour: Number(nextHour),
                      minute: roundToStep(parts.minute),
                    });
                  }}
                />
                <WheelColumn
                  ariaLabel="minuto"
                  className="w-12 shrink-0"
                  items={minuteItems}
                  value={minuteValue}
                  disabled={busy}
                  onChange={(nextMinute) => {
                    commitParts({
                      year: parts.year,
                      month: parts.month,
                      day: parts.day,
                      hour: parts.hour,
                      minute: Number(nextMinute),
                    });
                  }}
                />
              </div>
              <p className="pb-1.5 text-center font-mono text-[11px] text-muted-foreground">
                {formatDayTimeLabel(effectiveIso, timezone)} · {timezone}
              </p>
            </div>
            {timeClampHint ? (
              <p role="status" className="text-[11px] text-amber-200">
                {timeClampHint}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  {
                    key: "now",
                    label: "Ahora",
                    run: () =>
                      setFromIso(defaultActOccurredAt(minOccurredAt)),
                  },
                  {
                    key: "m5",
                    label: "−5",
                    run: () => shiftMinutes(-5),
                  },
                  {
                    key: "m15",
                    label: "−15",
                    run: () => shiftMinutes(-15),
                  },
                  {
                    key: "p5",
                    label: "+5",
                    run: () => shiftMinutes(5),
                  },
                  {
                    key: "planned",
                    label: "Planificado",
                    run: () => {
                      if (plannedStartAt) setFromIso(plannedStartAt);
                    },
                    disabled: !plannedStartAt,
                  },
                ] as const
              ).map((chip) => (
                <Button
                  key={chip.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || ("disabled" in chip && chip.disabled)}
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={chip.run}
                >
                  {chip.label}
                </Button>
              ))}
            </div>
            {anchorStartAt ? (
              <p className="text-[11px] text-muted-foreground">
                T0 de la ejecución:{" "}
                {formatDayTimeLabel(anchorStartAt, timezone)}. En simulacro
                ajustá al tiempo del ensayo.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Por defecto: ahora. En simulacro ajustá al tiempo del ensayo.
              </p>
            )}
          </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="execution-act-comment">
              {needsComment ? "Motivo (obligatorio)" : "Comentario"}
            </Label>
            <Textarea
              id="execution-act-comment"
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder={
                isReject
                  ? "Motivo del rechazo…"
                  : isForce
                    ? "Motivo del forzado…"
                    : isStart
                      ? "Nota opcional al arrancar…"
                      : "Nota opcional…"
              }
              rows={isReject ? 3 : 2}
              disabled={busy}
              autoFocus={isReject}
            />
          </div>

          {needsTime && !isReject ? (
          <div className="space-y-2">
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm hover:bg-muted/40",
                needsEvidence &&
                  !hasEvidence &&
                  "border-amber-500/40 bg-amber-500/10",
                (!blobConfigured || busy) && "cursor-not-allowed opacity-60",
              )}
            >
              <Paperclip className="size-4 shrink-0" />
              <span>
                {blobConfigured
                  ? needsEvidence
                    ? "Adjuntar evidencia (obligatoria para el éxito) · máx. 10 MB c/u"
                    : isStart && evidenceRequired
                      ? "Adjuntar archivo(s) · opcional al iniciar · máx. 10 MB c/u"
                      : "Adjuntar archivo(s) · máx. 10 MB c/u"
                  : "Adjuntos no disponibles (Blob sin configurar)"}
              </span>
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={!blobConfigured || busy}
                onChange={(event) => {
                  const next = [...(event.target.files ?? [])];
                  event.target.value = "";
                  if (!next.length) return;
                  addFiles(next);
                }}
              />
            </label>
            {files.length ? (
              <ul className="space-y-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label="Quitar archivo"
                      disabled={busy}
                      onClick={() =>
                        onFilesChange(files.filter((_, i) => i !== index))
                      }
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {needsEvidence && !hasEvidence ? (
              <p className="text-xs text-amber-200">
                {blobConfigured
                  ? "Este paso exige al menos un adjunto para marcarlo como Exitoso."
                  : "Este paso exige evidencia al marcar éxito, pero los adjuntos no están disponibles."}
              </p>
            ) : isStart && evidenceRequired ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-200">
                <Paperclip className="mt-0.5 size-3.5 shrink-0" />
                Al iniciar no se pide adjunto. Sí será obligatorio al marcar
                éxito.
              </p>
            ) : needsEvidence && existingEvidenceCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                Ya hay {existingEvidenceCount} adjunto
                {existingEvidenceCount === 1 ? "" : "s"} en el paso.
              </p>
            ) : null}
          </div>
          ) : null}

          {displayError ? (
            <p role="alert" className="text-sm text-red-300">
              {displayError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 gap-3 border-t bg-transparent px-5 py-5 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy || !canConfirm}
            variant={action === "complete_fail" ? "destructive" : "default"}
            className="min-w-36"
            onClick={onConfirm}
          >
            {busy
              ? "Guardando…"
              : `Confirmar ${action ? ACTION_TITLE[action].replace("Marcar como ", "") : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reexport de títulos para toasts/labels externos. */
export const EXECUTION_ACT_LABELS: Record<ExecutionActAction, string> = {
  start: "Iniciar",
  restart: "Rearrancar",
  complete_success: "Exitoso",
  complete_fail: "Fallido",
  force_success: "Forzado OK",
  reject: "Rechazado",
};
