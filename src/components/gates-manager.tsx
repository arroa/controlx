"use client";

import {
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DateTimePicker,
  toZonedInput,
} from "@/components/datetime-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  BlockSummary,
  GateSummary,
  WorkstreamSummary,
} from "@/lib/admin-data";
import { APPROVAL_ROLE_OPTIONS, type ApprovalRole } from "@/domain/controlx";
import { cn } from "@/lib/utils";

type GateTargetDraft = {
  workstreamId: string;
  blockId: string | null;
};

type EditorState = {
  id: string | null;
  name: string;
  description: string;
  opensTargets: GateTargetDraft[];
  plannedOpenAt: string | null;
  approvalRoles: ApprovalRole[];
  closesAfterTargets: GateTargetDraft[];
};

function emptyEditor(): EditorState {
  return {
    id: null,
    name: "",
    description: "",
    opensTargets: [],
    plannedOpenAt: null,
    approvalRoles: [],
    closesAfterTargets: [],
  };
}

function summarizeTargets(
  targets: GateTargetDraft[],
  workstreams: WorkstreamSummary[],
  blocks: BlockSummary[],
  emptyLabel: string,
) {
  if (!targets.length) return emptyLabel;

  const wsName = new Map(workstreams.map((item) => [item.id, item.name]));
  const blockName = new Map(blocks.map((item) => [item.id, item.name]));

  return targets
    .map((target) => {
      const workstream = wsName.get(target.workstreamId) ?? "WS";
      if (!target.blockId) return `${workstream} (todo)`;
      return `${workstream} · ${blockName.get(target.blockId) ?? "Bloque"}`;
    })
    .join(", ");
}

function summarizeActivation(
  gate: GateSummary,
  workstreams: WorkstreamSummary[],
  blocks: BlockSummary[],
  eventTimezone: string,
) {
  const parts: string[] = [];
  if (gate.plannedOpenAt) {
    parts.push(
      `hora ${toZonedInput(gate.plannedOpenAt, eventTimezone).replace("T", " ")}`,
    );
  }
  if (gate.approvalRoles?.length) {
    parts.push(
      APPROVAL_ROLE_OPTIONS.filter((option) =>
        gate.approvalRoles.includes(option.value),
      )
        .map((option) => option.label)
        .join("+"),
    );
  }
  if (gate.closesAfterTargets?.length) {
    parts.push(
      `cierre: ${summarizeTargets(gate.closesAfterTargets, workstreams, blocks, "")}`,
    );
  }
  return parts.length ? parts.join(" · ") : "sin condición (manual / productor)";
}

function toggleWhole(
  targets: GateTargetDraft[],
  workstreamId: string,
): GateTargetDraft[] {
  const whole = targets.some(
    (target) => target.workstreamId === workstreamId && target.blockId == null,
  );
  if (whole) {
    return targets.filter((target) => target.workstreamId !== workstreamId);
  }
  return [
    ...targets.filter((target) => target.workstreamId !== workstreamId),
    { workstreamId, blockId: null },
  ];
}

function toggleBlockTarget(
  targets: GateTargetDraft[],
  workstreamId: string,
  blockId: string,
  allBlockIds: string[],
): GateTargetDraft[] {
  if (
    targets.some(
      (target) => target.workstreamId === workstreamId && target.blockId == null,
    )
  ) {
    return [
      ...targets.filter((target) => target.workstreamId !== workstreamId),
      ...allBlockIds
        .filter((id) => id !== blockId)
        .map((id) => ({ workstreamId, blockId: id })),
    ];
  }

  const exists = targets.some(
    (target) =>
      target.workstreamId === workstreamId && target.blockId === blockId,
  );
  if (exists) {
    return targets.filter(
      (target) =>
        !(target.workstreamId === workstreamId && target.blockId === blockId),
    );
  }
  return [...targets, { workstreamId, blockId }];
}

function TargetChecklist({
  workstreams,
  blocks,
  targets,
  onChange,
}: {
  workstreams: WorkstreamSummary[];
  blocks: BlockSummary[];
  targets: GateTargetDraft[];
  onChange: (targets: GateTargetDraft[]) => void;
}) {
  const blockIds = blocks.map((block) => block.id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleExpanded(workstreamId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(workstreamId)) next.delete(workstreamId);
      else next.add(workstreamId);
      return next;
    });
  }

  if (!workstreams.length) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Aún no hay workstreams en el diseño.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border">
      {workstreams.map((workstream) => {
        const whole = targets.some(
          (target) =>
            target.workstreamId === workstream.id && target.blockId == null,
        );
        const selectedBlocks = targets.filter(
          (target) =>
            target.workstreamId === workstream.id && target.blockId != null,
        ).length;
        const expanded = expandedIds.has(workstream.id);
        const summary = whole
          ? "Todo el WS"
          : selectedBlocks
            ? `${selectedBlocks} bloque${selectedBlocks === 1 ? "" : "s"}`
            : "Ninguno";

        return (
          <div key={workstream.id} className="border-b last:border-b-0">
            <div
              className={cn(
                "flex items-center gap-2 px-2 py-2 hover:bg-muted/50",
                (whole || selectedBlocks > 0) && "bg-muted/30",
              )}
            >
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? `Colapsar ${workstream.name}`
                    : `Expandir ${workstream.name}`
                }
                onClick={() => toggleExpanded(workstream.id)}
              >
                {expanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-0.5">
                <input
                  type="checkbox"
                  checked={whole}
                  onChange={() =>
                    onChange(toggleWhole(targets, workstream.id))
                  }
                />
                <span className="truncate text-sm font-medium">
                  {workstream.name}
                </span>
              </label>
              <Badge variant="outline" className="shrink-0">
                {summary}
              </Badge>
            </div>

            {expanded ? (
              <div className="space-y-0.5 border-t bg-muted/10 px-3 py-2 pl-11">
                <p className="px-2 pb-1 text-[11px] text-muted-foreground">
                  Bloques (o marca “todo el WS” arriba)
                </p>
                {blocks.map((block) => {
                  const checked =
                    whole ||
                    targets.some(
                      (target) =>
                        target.workstreamId === workstream.id &&
                        target.blockId === block.id,
                    );
                  return (
                    <label
                      key={`${workstream.id}-${block.id}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40",
                        checked && !whole && "bg-muted/30",
                        whole && "opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={whole}
                        onChange={() =>
                          onChange(
                            toggleBlockTarget(
                              targets,
                              workstream.id,
                              block.id,
                              blockIds,
                            ),
                          )
                        }
                      />
                      <span className="text-sm">{block.name}</span>
                    </label>
                  );
                })}
                {!blocks.length ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Sin bloques en el catálogo.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function GatesManager({
  open,
  onOpenChange,
  eventId,
  eventTimezone,
  gates,
  workstreams,
  blocks,
  onGatesChange,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTimezone: string;
  gates: GateSummary[];
  workstreams: WorkstreamSummary[];
  blocks: BlockSummary[];
  onGatesChange: (gates: GateSummary[]) => void;
  onError: (message: string) => void;
}) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const sortedBlocks = useMemo(
    () =>
      [...blocks].sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"),
      ),
    [blocks],
  );

  function startCreate() {
    setFormError("");
    setEditor(emptyEditor());
  }

  function startEdit(gate: GateSummary) {
    setFormError("");
    setEditor({
      id: gate.id,
      name: gate.name,
      description: gate.description,
      opensTargets: (gate.opensTargets ?? []).map((target) => ({ ...target })),
      plannedOpenAt: gate.plannedOpenAt ?? null,
      approvalRoles: [...(gate.approvalRoles ?? [])],
      closesAfterTargets: (gate.closesAfterTargets ?? []).map((target) => ({
        ...target,
      })),
    });
  }

  function toggleApproval(role: ApprovalRole) {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        approvalRoles: current.approvalRoles.includes(role)
          ? current.approvalRoles.filter((item) => item !== role)
          : [...current.approvalRoles, role],
      };
    });
  }

  async function saveEditor() {
    if (!editor) return;
    const name = editor.name.trim();
    if (name.length < 2) {
      setFormError("Escribe un nombre (mín. 2 caracteres), ej. Arranque.");
      onError("El nombre del gate debe tener al menos 2 caracteres.");
      return;
    }

    setSaving(true);
    setFormError("");
    onError("");
    const body = {
      name,
      description: editor.description.trim(),
      opensTargets: editor.opensTargets,
      plannedOpenAt: editor.plannedOpenAt,
      approvalRoles: editor.approvalRoles,
      closesAfterTargets: editor.closesAfterTargets,
    };

    const response = await fetch(
      editor.id
        ? `/api/events/${eventId}/gates/${editor.id}`
        : `/api/events/${eventId}/gates`,
      {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ).catch(() => null);

    const payload = response
      ? ((await response.json()) as { gate?: GateSummary; error?: string })
      : null;
    setSaving(false);

    if (!response?.ok || !payload?.gate) {
      const message = payload?.error ?? "No fue posible guardar el gate.";
      setFormError(message);
      onError(message);
      return;
    }

    onGatesChange(
      editor.id
        ? gates.map((gate) => (gate.id === editor.id ? payload.gate! : gate))
        : [...gates, payload.gate],
    );
    setEditor(null);
  }

  async function removeGate(gateId: string) {
    setDeletingId(gateId);
    onError("");
    const response = await fetch(`/api/events/${eventId}/gates/${gateId}`, {
      method: "DELETE",
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as { error?: string })
      : null;
    setDeletingId(null);

    if (!response?.ok) {
      onError(payload?.error ?? "No fue posible eliminar el gate.");
      return;
    }
    onGatesChange(gates.filter((gate) => gate.id !== gateId));
    if (editor?.id === gateId) setEditor(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,800px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>Gates</DialogTitle>
          <DialogDescription>
            Dependencia no granular: un hito con condiciones de activación que
            abre workstreams o bloques.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {editor ? (
            <form
              id="gate-editor-form"
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void saveEditor();
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {editor.id ? "Editar gate" : "Crear gate"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditor(null)}
                >
                  Volver al listado
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="gate-name">
                  Nombre
                </label>
                <Input
                  id="gate-name"
                  name="name"
                  autoFocus
                  value={editor.name}
                  onChange={(event) => {
                    setFormError("");
                    setEditor({ ...editor, name: event.target.value });
                  }}
                  placeholder="Ej. Arranque, GoNoGo mañana, GoNoGo tarde…"
                />
                {formError ? (
                  <p role="alert" className="text-sm text-red-300">
                    {formError}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
                <section className="flex min-h-0 flex-col space-y-2 rounded-xl border bg-muted/10 p-3">
                  <div>
                    <p className="text-sm font-medium">Workstreams requeridos</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cierre OK de estos WS/bloques para activar el gate.
                    </p>
                  </div>
                  <TargetChecklist
                    workstreams={workstreams}
                    blocks={sortedBlocks}
                    targets={editor.closesAfterTargets}
                    onChange={(closesAfterTargets) =>
                      setEditor({ ...editor, closesAfterTargets })
                    }
                  />
                </section>

                <section className="flex flex-col gap-3">
                  <div className="space-y-2 rounded-xl border bg-muted/10 p-3">
                    <p className="text-sm font-medium">Horario</p>
                    <p className="text-xs text-muted-foreground">
                      No antes de (opcional).
                    </p>
                    <DateTimePicker
                      value={editor.plannedOpenAt}
                      timezone={eventTimezone}
                      onChange={(plannedOpenAt) =>
                        setEditor({ ...editor, plannedOpenAt })
                      }
                      placeholder="Sin hora mínima"
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border bg-muted/10 p-3">
                    <p className="text-sm font-medium">Aprobaciones</p>
                    <p className="text-xs text-muted-foreground">
                      Roles que deben dar OK (opcional, AND).
                    </p>
                    <div className="space-y-1">
                      {APPROVAL_ROLE_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50",
                            editor.approvalRoles.includes(option.value) &&
                              "bg-muted/30",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={editor.approvalRoles.includes(
                              option.value,
                            )}
                            onChange={() => toggleApproval(option.value)}
                          />
                          <span className="text-sm">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="flex min-h-0 flex-col space-y-2 rounded-xl border bg-muted/10 p-3">
                  <div>
                    <p className="text-sm font-medium">Workstreams que abre</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      WS/bloques que se liberan al activarse el gate.
                    </p>
                  </div>
                  <TargetChecklist
                    workstreams={workstreams}
                    blocks={sortedBlocks}
                    targets={editor.opensTargets}
                    onChange={(opensTargets) =>
                      setEditor({ ...editor, opensTargets })
                    }
                  />
                </section>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {gates.length
                    ? `${gates.length} gate${gates.length === 1 ? "" : "s"}`
                    : "Todavía no hay gates"}
                </p>
                <Button type="button" onClick={startCreate}>
                  <Plus className="size-4" />
                  Crear gate
                </Button>
              </div>

              {!gates.length ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="font-medium">Crea el primer gate</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Define cuándo se activa (hora, aprobación, cierre) y qué
                    workstreams/bloques abre.
                  </p>
                  <Button
                    type="button"
                    className="mt-4"
                    onClick={startCreate}
                  >
                    <Plus className="size-4" />
                    Crear gate
                  </Button>
                </div>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {gates.map((gate) => (
                    <li
                      key={gate.id}
                      className="flex items-start gap-3 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{gate.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Activa:{" "}
                          {summarizeActivation(
                            gate,
                            workstreams,
                            blocks,
                            eventTimezone,
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Abre:{" "}
                          {summarizeTargets(
                            gate.opensTargets,
                            workstreams,
                            blocks,
                            "Sin anclas aún",
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => startEdit(gate)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={deletingId === gate.id}
                          onClick={() => void removeGate(gate.id)}
                        >
                          {deletingId === gate.id ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {editor ? (
          <DialogFooter className="shrink-0 border-t p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditor(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="gate-editor-form"
              disabled={saving}
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {editor.id ? "Guardar cambios" : "Crear gate"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
