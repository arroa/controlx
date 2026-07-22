"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ActivitySummary,
  ActivityTreeNode,
  BlockSummary,
  DesignPair,
  DesignStepSummary,
  WorkstreamSummary,
} from "@/lib/admin-data";

type EditorMode =
  | "create"
  | "edit-activity"
  | "edit-step"
  | "edit-workstream"
  | "edit-block";

type EditorState = {
  mode: EditorMode;
  workstreamId: string;
  blockId: string;
  activityId: string;
  stepId: string;
  activityName: string;
  activityDescription: string;
  stepName: string;
  stepDescription: string;
  stepLongDescription: string;
};

function emptyEditor(
  workstreamId = "",
  blockId = "",
): EditorState {
  return {
    mode: "create",
    workstreamId,
    blockId,
    activityId: "",
    stepId: "",
    activityName: "",
    activityDescription: "",
    stepName: "",
    stepDescription: "",
    stepLongDescription: "",
  };
}

export function EventDesign({
  eventId,
  initialWorkstreams,
  initialBlocks,
  initialPairs,
}: {
  eventId: string;
  initialWorkstreams: WorkstreamSummary[];
  initialBlocks: BlockSummary[];
  initialPairs: DesignPair[];
}) {
  const [pairs, setPairs] = useState(initialPairs);
  const [workstreams, setWorkstreams] = useState(initialWorkstreams);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [query, setQuery] = useState("");
  const [bar, setBar] = useState<EditorState>(() =>
    emptyEditor(initialWorkstreams[0]?.id ?? "", initialBlocks[0]?.id ?? ""),
  );
  const [modal, setModal] = useState<EditorState | null>(null);
  const [savingBar, setSavingBar] = useState(false);
  const [savingModal, setSavingModal] = useState(false);
  const [barError, setBarError] = useState("");
  const [modalError, setModalError] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filteredPairs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pairs;

    return pairs
      .map((pair) => {
        const pairText = `${pair.workstream.name} ${pair.workstream.description} ${pair.block.name} ${pair.block.description}`.toLowerCase();
        const activities = pair.activities
          .map((activity) => {
            const activityText =
              `${activity.name} ${activity.description}`.toLowerCase();
            const steps = activity.steps.filter((step) =>
              `${step.name} ${step.description}`.toLowerCase().includes(needle),
            );
            const activityMatches = activityText.includes(needle);
            if (activityMatches || steps.length) {
              return {
                ...activity,
                steps: activityMatches ? activity.steps : steps,
              };
            }
            return null;
          })
          .filter(Boolean) as ActivityTreeNode[];

        if (pairText.includes(needle) || activities.length) {
          return {
            ...pair,
            activities: pairText.includes(needle)
              ? pair.activities
              : activities,
          };
        }
        return null;
      })
      .filter(Boolean) as DesignPair[];
  }, [pairs, query]);

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isOpen(key: string) {
    return !collapsed.has(key);
  }

  function upsertActivity(activity: ActivitySummary) {
    setPairs((current) =>
      current.map((pair) => {
        if (
          pair.workstream.id !== activity.workstreamId ||
          pair.block.id !== activity.blockId
        ) {
          return pair;
        }
        const exists = pair.activities.some((item) => item.id === activity.id);
        return {
          ...pair,
          activities: exists
            ? pair.activities.map((item) =>
                item.id === activity.id ? { ...item, ...activity } : item,
              )
            : [...pair.activities, { ...activity, steps: [] }],
        };
      }),
    );
  }

  function replaceActivitiesInPair(
    workstreamId: string,
    blockId: string,
    activities: ActivitySummary[],
  ) {
    const orderById = new Map(activities.map((item) => [item.id, item.order]));
    setPairs((current) =>
      current.map((pair) => {
        if (pair.workstream.id !== workstreamId || pair.block.id !== blockId) {
          return pair;
        }
        return {
          ...pair,
          activities: [...pair.activities]
            .map((activity) => ({
              ...activity,
              order: orderById.get(activity.id) ?? activity.order,
            }))
            .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
        };
      }),
    );
  }

  function upsertStep(step: DesignStepSummary) {
    setPairs((current) =>
      current.map((pair) => ({
        ...pair,
        activities: pair.activities.map((activity) => {
          if (activity.id !== step.activityId) return activity;
          const exists = activity.steps.some((item) => item.id === step.id);
          return {
            ...activity,
            steps: exists
              ? activity.steps.map((item) =>
                  item.id === step.id ? { ...item, ...step } : item,
                )
              : [...activity.steps, step],
          };
        }),
      })),
    );
  }

  function replaceStepsInActivity(
    activityId: string,
    steps: DesignStepSummary[],
  ) {
    const orderById = new Map(steps.map((item) => [item.id, item.order]));
    setPairs((current) =>
      current.map((pair) => ({
        ...pair,
        activities: pair.activities.map((activity) => {
          if (activity.id !== activityId) return activity;
          return {
            ...activity,
            steps: [...activity.steps]
              .map((step) => ({
                ...step,
                order: orderById.get(step.id) ?? step.order,
              }))
              .sort(
                (a, b) =>
                  a.order - b.order || a.createdAt.localeCompare(b.createdAt),
              ),
          };
        }),
      })),
    );
  }

  function removeActivity(activityId: string) {
    setPairs((current) =>
      current.map((pair) => ({
        ...pair,
        activities: pair.activities.filter((item) => item.id !== activityId),
      })),
    );
  }

  function removeWorkstream(workstreamId: string) {
    setWorkstreams((current) => {
      const next = current.filter((item) => item.id !== workstreamId);
      setBar((bar) =>
        bar.workstreamId === workstreamId
          ? emptyEditor(next[0]?.id ?? "", bar.blockId)
          : bar,
      );
      return next;
    });
    setPairs((current) =>
      current.filter((pair) => pair.workstream.id !== workstreamId),
    );
  }

  function removeBlock(blockId: string) {
    setBlocks((current) => {
      const next = current.filter((item) => item.id !== blockId);
      setBar((bar) =>
        bar.blockId === blockId
          ? emptyEditor(bar.workstreamId, next[0]?.id ?? "")
          : bar,
      );
      return next;
    });
    setPairs((current) =>
      current.filter((pair) => pair.block.id !== blockId),
    );
  }

  function upsertWorkstream(workstream: WorkstreamSummary) {
    setWorkstreams((current) =>
      current.map((item) => (item.id === workstream.id ? workstream : item)),
    );
    setPairs((current) =>
      current.map((pair) =>
        pair.workstream.id === workstream.id
          ? { ...pair, workstream }
          : pair,
      ),
    );
  }

  function upsertBlock(block: BlockSummary) {
    setBlocks((current) =>
      current.map((item) => (item.id === block.id ? block : item)),
    );
    setPairs((current) =>
      current.map((pair) =>
        pair.block.id === block.id ? { ...pair, block } : pair,
      ),
    );
  }

  function removeStep(stepId: string) {
    setPairs((current) =>
      current.map((pair) => ({
        ...pair,
        // Unidad W-B-A-P: sin pasos, la actividad deja de existir en el diseño.
        activities: pair.activities
          .map((activity) => ({
            ...activity,
            steps: activity.steps.filter((step) => step.id !== stepId),
          }))
          .filter((activity) => activity.steps.length > 0),
      })),
    );
  }

  function openModal(state: EditorState) {
    setModal(state);
    setModalError("");
  }

  function closeModal() {
    setModal(null);
    setModalError("");
  }

  function loadNewActivity(workstreamId: string, blockId: string) {
    openModal({
      ...emptyEditor(workstreamId, blockId),
      mode: "create",
    });
  }

  function loadNewBlock(workstreamId: string) {
    openModal({
      ...emptyEditor(workstreamId, ""),
      mode: "create",
    });
  }

  function loadNewStep(activity: ActivityTreeNode) {
    openModal({
      mode: "create",
      workstreamId: activity.workstreamId,
      blockId: activity.blockId,
      activityId: activity.id,
      stepId: "",
      activityName: activity.name,
      activityDescription: activity.description,
      stepName: "",
      stepDescription: "",
      stepLongDescription: "",
    });
  }

  function loadEditActivity(activity: ActivityTreeNode) {
    openModal({
      mode: "edit-activity",
      workstreamId: activity.workstreamId,
      blockId: activity.blockId,
      activityId: activity.id,
      stepId: "",
      activityName: activity.name,
      activityDescription: activity.description,
      stepName: "",
      stepDescription: "",
      stepLongDescription: "",
    });
  }

  function loadEditWorkstream(workstream: WorkstreamSummary) {
    openModal({
      mode: "edit-workstream",
      workstreamId: workstream.id,
      blockId: "",
      activityId: "",
      stepId: "",
      activityName: workstream.name,
      activityDescription: workstream.description,
      stepName: "",
      stepDescription: "",
      stepLongDescription: "",
    });
  }

  function loadEditBlock(block: BlockSummary) {
    openModal({
      mode: "edit-block",
      workstreamId: "",
      blockId: block.id,
      activityId: "",
      stepId: "",
      activityName: block.name,
      activityDescription: block.description,
      stepName: "",
      stepDescription: "",
      stepLongDescription: "",
    });
  }

  function loadEditStep(step: DesignStepSummary, activity: ActivityTreeNode) {
    openModal({
      mode: "edit-step",
      workstreamId: step.workstreamId,
      blockId: step.blockId,
      activityId: step.activityId,
      stepId: step.id,
      activityName: activity.name,
      activityDescription: activity.description,
      stepName: step.name,
      stepDescription: step.description,
      stepLongDescription: step.longDescription ?? "",
    });
  }

  async function submitEditor(
    editor: EditorState,
    source: "bar" | "modal",
  ) {
    if (source === "bar") {
      setSavingBar(true);
      setBarError("");
    } else {
      setSavingModal(true);
      setModalError("");
    }

    const fail = (message: string) => {
      if (source === "bar") setBarError(message);
      else setModalError(message);
    };

    try {
      if (editor.mode === "edit-workstream") {
        const response = await fetch(
          `/api/events/${eventId}/workstreams/${editor.workstreamId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: editor.activityName,
              description: editor.activityDescription,
            }),
          },
        );
        const payload = (await response.json()) as {
          workstream?: WorkstreamSummary;
          error?: string;
        };
        if (!response.ok || !payload.workstream) {
          throw new Error(payload.error ?? "No fue posible guardar.");
        }
        upsertWorkstream(payload.workstream);
        closeModal();
        return;
      }

      if (editor.mode === "edit-block") {
        const response = await fetch(
          `/api/events/${eventId}/blocks/${editor.blockId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: editor.activityName,
              description: editor.activityDescription,
            }),
          },
        );
        const payload = (await response.json()) as {
          block?: BlockSummary;
          error?: string;
        };
        if (!response.ok || !payload.block) {
          throw new Error(payload.error ?? "No fue posible guardar.");
        }
        upsertBlock(payload.block);
        closeModal();
        return;
      }

      if (editor.mode === "edit-activity") {
        const response = await fetch(
          `/api/events/${eventId}/activities/${editor.activityId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: editor.activityName,
              description: editor.activityDescription,
            }),
          },
        );
        const payload = (await response.json()) as {
          activity?: ActivitySummary;
          error?: string;
        };
        if (!response.ok || !payload.activity) {
          throw new Error(payload.error ?? "No fue posible guardar.");
        }
        upsertActivity(payload.activity);
        closeModal();
        return;
      }

      if (editor.mode === "edit-step") {
        const response = await fetch(
          `/api/events/${eventId}/design-steps/${editor.stepId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: editor.stepName,
              description: editor.stepDescription,
              longDescription: editor.stepLongDescription,
            }),
          },
        );
        const payload = (await response.json()) as {
          step?: DesignStepSummary;
          error?: string;
        };
        if (!response.ok || !payload.step) {
          throw new Error(payload.error ?? "No fue posible guardar.");
        }
        upsertStep(payload.step);
        closeModal();
        return;
      }

      // create — actividad siempre con al menos un paso
      if (!editor.workstreamId) {
        throw new Error("Selecciona un workstream.");
      }
      if (!editor.blockId) {
        throw new Error("Selecciona un bloque.");
      }
      if (editor.stepName.trim().length < 2) {
        throw new Error("El paso es obligatorio.");
      }

      let activityId = editor.activityId;
      if (!activityId) {
        if (editor.activityName.trim().length < 2) {
          throw new Error("Escribe el nombre de la actividad.");
        }
        const activityResponse = await fetch(
          `/api/events/${eventId}/activities`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workstreamId: editor.workstreamId,
              blockId: editor.blockId,
              name: editor.activityName,
              description: editor.activityDescription,
            }),
          },
        );
        const activityPayload = (await activityResponse.json()) as {
          activity?: ActivitySummary;
          error?: string;
        };
        if (!activityResponse.ok || !activityPayload.activity) {
          throw new Error(
            activityPayload.error ?? "No fue posible crear la actividad.",
          );
        }
        upsertActivity(activityPayload.activity);
        activityId = activityPayload.activity.id;
      }

      const stepResponse = await fetch(`/api/events/${eventId}/design-steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId,
          name: editor.stepName,
          description: editor.stepDescription,
          longDescription: editor.stepLongDescription,
        }),
      });
      const stepPayload = (await stepResponse.json()) as {
        step?: DesignStepSummary;
        error?: string;
      };
      if (!stepResponse.ok || !stepPayload.step) {
        throw new Error(stepPayload.error ?? "No fue posible crear el paso.");
      }
      upsertStep(stepPayload.step);

      if (source === "bar") {
        setBar({
          ...emptyEditor(editor.workstreamId, editor.blockId),
        });
      } else {
        closeModal();
      }
    } catch (submitError) {
      fail(
        submitError instanceof Error
          ? submitError.message
          : "No fue posible guardar.",
      );
    } finally {
      if (source === "bar") setSavingBar(false);
      else setSavingModal(false);
    }
  }

  async function moveStepRow(step: DesignStepSummary, direction: "up" | "down") {
    const response = await fetch(
      `/api/events/${eventId}/design-steps/${step.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          steps?: DesignStepSummary[];
          error?: string;
        })
      : null;
    if (!response?.ok || !payload?.steps) return;
    replaceStepsInActivity(step.activityId, payload.steps);
  }

  if (!workstreams.length || !blocks.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">El setup está incompleto</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Necesitas al menos un workstream y un bloque.
        </p>
      </div>
    );
  }

  const colgroup = (
    <colgroup>
      <col className="w-[110px]" />
      <col className="w-[14%]" />
      <col className="w-[14%]" />
      <col className="w-[16%]" />
      <col className="w-[16%]" />
      <col />
      <col className="w-[180px]" />
    </colgroup>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative max-w-xl shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por workstream, bloque, actividad, paso…"
          className="pl-9"
        />
      </div>

      <div className="shrink-0 overflow-hidden rounded-xl border bg-card">
        <table className="w-full table-fixed caption-bottom text-sm">
          {colgroup}
          <TableHeader>
            <TableRow className="border-b bg-muted hover:bg-muted">
              <TableHead className="bg-muted">Tipo</TableHead>
              <TableHead className="bg-muted">Workstream</TableHead>
              <TableHead className="bg-muted">Bloque</TableHead>
              <TableHead className="bg-muted">Actividad</TableHead>
              <TableHead className="bg-muted">Paso</TableHead>
              <TableHead className="bg-muted">Descripción</TableHead>
              <TableHead className="bg-muted text-right">Acciones</TableHead>
            </TableRow>
            <TableRow className="bg-card hover:bg-card">
              <TableCell className="bg-card">
                <Badge variant="secondary">Alta</Badge>
              </TableCell>
              <TableCell className="bg-card">
                <Select
                  value={bar.workstreamId || undefined}
                  onValueChange={(value) =>
                    setBar((current) => ({
                      ...current,
                      workstreamId: value,
                      mode: "create",
                    }))
                  }
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Workstream" />
                  </SelectTrigger>
                  <SelectContent>
                    {workstreams.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="bg-card">
                <Select
                  value={bar.blockId || undefined}
                  onValueChange={(value) =>
                    setBar((current) => ({
                      ...current,
                      blockId: value,
                      mode: "create",
                    }))
                  }
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Bloque" />
                  </SelectTrigger>
                  <SelectContent>
                    {blocks.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="bg-card">
                <Input
                  className="h-8"
                  value={bar.activityName}
                  onChange={(event) =>
                    setBar((current) => ({
                      ...current,
                      activityName: event.target.value,
                    }))
                  }
                  placeholder="Actividad"
                />
              </TableCell>
              <TableCell className="bg-card">
                <Input
                  className="h-8"
                  value={bar.stepName}
                  onChange={(event) =>
                    setBar((current) => ({
                      ...current,
                      stepName: event.target.value,
                    }))
                  }
                  placeholder="Paso (obligatorio)"
                />
              </TableCell>
              <TableCell className="bg-card">
                <Input
                  className="h-8"
                  value={bar.activityDescription}
                  onChange={(event) =>
                    setBar((current) => ({
                      ...current,
                      activityDescription: event.target.value,
                    }))
                  }
                  placeholder="Descripción"
                />
              </TableCell>
              <TableCell className="bg-card text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setBar(emptyEditor(bar.workstreamId, bar.blockId))
                    }
                  >
                    Limpiar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingBar}
                    onClick={() => void submitEditor(bar, "bar")}
                  >
                    {savingBar ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <CirclePlus className="size-4" />
                    )}
                    Agregar
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableHeader>
        </table>
        {barError ? (
          <p role="alert" className="border-t px-3 py-2 text-sm text-red-300">
            {barError}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
        <table className="w-full table-fixed caption-bottom text-sm">
          {colgroup}
          <TableBody>
            {filteredPairs.every((pair) => pair.activities.length === 0) ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  {query
                    ? "No hay filas que coincidan con la búsqueda."
                    : "Todavía no hay diseño. Usa la fila Alta para agregar la primera actividad y paso."}
                </TableCell>
              </TableRow>
            ) : (
              groupPairsByWorkstream(filteredPairs).map((group) => {
                const wsKey = `ws:${group.workstream.id}`;
                const wsOpen = isOpen(wsKey);
                return (
                  <WorkstreamGroupRows
                    key={group.workstream.id}
                    eventId={eventId}
                    group={group}
                    wsKey={wsKey}
                    wsOpen={wsOpen}
                    isOpen={isOpen}
                    onToggle={toggle}
                    onNewBlock={loadNewBlock}
                    onNewActivity={loadNewActivity}
                    onNewStep={loadNewStep}
                    onEditWorkstream={loadEditWorkstream}
                    onEditBlock={loadEditBlock}
                    onEditActivity={loadEditActivity}
                    onEditStep={loadEditStep}
                    onMoveStep={moveStepRow}
                    onRemovedWorkstream={removeWorkstream}
                    onRemovedBlock={removeBlock}
                    onRemovedActivity={removeActivity}
                    onRemovedStep={removeStep}
                  />
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      <DesignEditorDialog
        open={Boolean(modal)}
        editor={modal}
        workstreams={workstreams}
        blocks={blocks}
        saving={savingModal}
        error={modalError}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        onChange={setModal}
        onSubmit={() => {
          if (modal) void submitEditor(modal, "modal");
        }}
      />
    </div>
  );
}

type WorkstreamGroup = {
  workstream: WorkstreamSummary;
  blocks: Array<{
    block: BlockSummary;
    activities: ActivityTreeNode[];
  }>;
};

function groupPairsByWorkstream(pairs: DesignPair[]): WorkstreamGroup[] {
  const groups: WorkstreamGroup[] = [];
  const indexById = new Map<string, number>();

  for (const pair of pairs) {
    if (!pair.activities.length) continue;
    const existingIndex = indexById.get(pair.workstream.id);
    if (existingIndex === undefined) {
      indexById.set(pair.workstream.id, groups.length);
      groups.push({
        workstream: pair.workstream,
        blocks: [{ block: pair.block, activities: pair.activities }],
      });
      continue;
    }
    groups[existingIndex]!.blocks.push({
      block: pair.block,
      activities: pair.activities,
    });
  }

  return groups;
}

function WorkstreamGroupRows({
  eventId,
  group,
  wsKey,
  wsOpen,
  isOpen,
  onToggle,
  onNewBlock,
  onNewActivity,
  onNewStep,
  onEditWorkstream,
  onEditBlock,
  onEditActivity,
  onEditStep,
  onMoveStep,
  onRemovedWorkstream,
  onRemovedBlock,
  onRemovedActivity,
  onRemovedStep,
}: {
  eventId: string;
  group: WorkstreamGroup;
  wsKey: string;
  wsOpen: boolean;
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
  onNewBlock: (workstreamId: string) => void;
  onNewActivity: (workstreamId: string, blockId: string) => void;
  onNewStep: (activity: ActivityTreeNode) => void;
  onEditWorkstream: (workstream: WorkstreamSummary) => void;
  onEditBlock: (block: BlockSummary) => void;
  onEditActivity: (activity: ActivityTreeNode) => void;
  onEditStep: (step: DesignStepSummary, activity: ActivityTreeNode) => void;
  onMoveStep: (
    step: DesignStepSummary,
    direction: "up" | "down",
  ) => Promise<void>;
  onRemovedWorkstream: (workstreamId: string) => void;
  onRemovedBlock: (blockId: string) => void;
  onRemovedActivity: (activityId: string) => void;
  onRemovedStep: (stepId: string) => void;
}) {
  const activityCount = group.blocks.reduce(
    (total, item) => total + item.activities.length,
    0,
  );
  const stepCount = group.blocks.reduce(
    (total, item) =>
      total +
      item.activities.reduce((sum, activity) => sum + activity.steps.length, 0),
    0,
  );

  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={7}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-semibold"
              onClick={() => onToggle(wsKey)}
            >
              {wsOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              Workstream · {group.workstream.name}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Editar workstream"
                title="Editar"
                onClick={() => onEditWorkstream(group.workstream)}
              >
                <Pencil className="size-4" />
              </Button>
              <DeleteRow
                title={`¿Eliminar workstream “${group.workstream.name}”?`}
                description={`Acción irreversible. Se eliminará del catálogo y se borrarán ${activityCount} actividad${activityCount === 1 ? "" : "es"} y ${stepCount} paso${stepCount === 1 ? "" : "s"} de este diseño.`}
                endpoint={`/api/events/${eventId}/workstreams/${group.workstream.id}`}
                onDeleted={() => onRemovedWorkstream(group.workstream.id)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Nuevo bloque"
                title="Nuevo"
                onClick={() => onNewBlock(group.workstream.id)}
              >
                <CirclePlus className="size-4" />
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>

      {wsOpen
        ? group.blocks.map(({ block, activities }) => {
            const blockKey = `block:${group.workstream.id}:${block.id}`;
            const blockOpen = isOpen(blockKey);
            return (
              <BlockGroupRows
                key={blockKey}
                eventId={eventId}
                workstream={group.workstream}
                block={block}
                activities={activities}
                blockKey={blockKey}
                blockOpen={blockOpen}
                isOpen={isOpen}
                onToggle={onToggle}
                onNewActivity={onNewActivity}
                onNewStep={onNewStep}
                onEditBlock={onEditBlock}
                onEditActivity={onEditActivity}
                onEditStep={onEditStep}
                onMoveStep={onMoveStep}
                onRemovedBlock={onRemovedBlock}
                onRemovedActivity={onRemovedActivity}
                onRemovedStep={onRemovedStep}
              />
            );
          })
        : null}
    </>
  );
}

function BlockGroupRows({
  eventId,
  workstream,
  block,
  activities,
  blockKey,
  blockOpen,
  isOpen,
  onToggle,
  onNewActivity,
  onNewStep,
  onEditBlock,
  onEditActivity,
  onEditStep,
  onMoveStep,
  onRemovedBlock,
  onRemovedActivity,
  onRemovedStep,
}: {
  eventId: string;
  workstream: WorkstreamSummary;
  block: BlockSummary;
  activities: ActivityTreeNode[];
  blockKey: string;
  blockOpen: boolean;
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
  onNewActivity: (workstreamId: string, blockId: string) => void;
  onNewStep: (activity: ActivityTreeNode) => void;
  onEditBlock: (block: BlockSummary) => void;
  onEditActivity: (activity: ActivityTreeNode) => void;
  onEditStep: (step: DesignStepSummary, activity: ActivityTreeNode) => void;
  onMoveStep: (
    step: DesignStepSummary,
    direction: "up" | "down",
  ) => Promise<void>;
  onRemovedBlock: (blockId: string) => void;
  onRemovedActivity: (activityId: string) => void;
  onRemovedStep: (stepId: string) => void;
}) {
  const stepCount = activities.reduce(
    (sum, activity) => sum + activity.steps.length,
    0,
  );

  return (
    <>
      <TableRow className="bg-muted/15 hover:bg-muted/15">
        <TableCell colSpan={7} className="pl-8">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium"
              onClick={() => onToggle(blockKey)}
            >
              {blockOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              Bloque · {block.name}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Editar bloque"
                title="Editar"
                onClick={() => onEditBlock(block)}
              >
                <Pencil className="size-4" />
              </Button>
              <DeleteRow
                title={`¿Eliminar bloque “${block.name}”?`}
                description={`Acción irreversible. Se eliminará del catálogo del evento y se borrarán todas las actividades y pasos que lo usan en cualquier workstream (aquí: ${activities.length} actividad${activities.length === 1 ? "" : "es"}, ${stepCount} paso${stepCount === 1 ? "" : "s"} bajo “${workstream.name}”).`}
                endpoint={`/api/events/${eventId}/blocks/${block.id}`}
                onDeleted={() => onRemovedBlock(block.id)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Nueva actividad"
                title="Nuevo"
                onClick={() => onNewActivity(workstream.id, block.id)}
              >
                <CirclePlus className="size-4" />
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>

      {blockOpen
        ? activities.map((activity) => {
            const actKey = `act:${activity.id}`;
            const actOpen = isOpen(actKey);
            return (
              <ActivityRows
                key={activity.id}
                eventId={eventId}
                activity={activity}
                actKey={actKey}
                actOpen={actOpen}
                onToggle={onToggle}
                onNewStep={onNewStep}
                onEditActivity={onEditActivity}
                onEditStep={onEditStep}
                onMoveStep={onMoveStep}
                onRemovedActivity={onRemovedActivity}
                onRemovedStep={onRemovedStep}
                workstreamName={workstream.name}
                blockName={block.name}
              />
            );
          })
        : null}
    </>
  );
}

function ActivityRows({
  eventId,
  activity,
  actKey,
  actOpen,
  onToggle,
  onNewStep,
  onEditActivity,
  onEditStep,
  onMoveStep,
  onRemovedActivity,
  onRemovedStep,
  workstreamName,
  blockName,
}: {
  eventId: string;
  activity: ActivityTreeNode;
  actKey: string;
  actOpen: boolean;
  onToggle: (key: string) => void;
  onNewStep: (activity: ActivityTreeNode) => void;
  onEditActivity: (activity: ActivityTreeNode) => void;
  onEditStep: (step: DesignStepSummary, activity: ActivityTreeNode) => void;
  onMoveStep: (
    step: DesignStepSummary,
    direction: "up" | "down",
  ) => Promise<void>;
  onRemovedActivity: (activityId: string) => void;
  onRemovedStep: (stepId: string) => void;
  workstreamName: string;
  blockName: string;
}) {
  return (
    <>
      <TableRow className="bg-muted/10 hover:bg-muted/10">
        <TableCell colSpan={7} className="pl-14">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-sm font-medium"
              onClick={() => onToggle(actKey)}
            >
              {actOpen ? (
                <ChevronDown className="size-4 shrink-0" />
              ) : (
                <ChevronRight className="size-4 shrink-0" />
              )}
              <span className="truncate">Actividad · {activity.name}</span>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Editar actividad"
                title="Editar"
                onClick={() => onEditActivity(activity)}
              >
                <Pencil className="size-4" />
              </Button>
              <DeleteRow
                title={`¿Eliminar actividad “${activity.name}”?`}
                description={`Acción irreversible. Se eliminará la actividad y sus ${activity.steps.length} paso${activity.steps.length === 1 ? "" : "s"}. Workstream y bloque del catálogo se mantienen.`}
                endpoint={`/api/events/${eventId}/activities/${activity.id}`}
                onDeleted={() => onRemovedActivity(activity.id)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Nuevo paso"
                title="Nuevo paso"
                onClick={() => onNewStep(activity)}
              >
                <CirclePlus className="size-4" />
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>

      {actOpen
        ? activity.steps.map((step, stepIndex) => (
            <TableRow key={step.id} className="bg-background">
              <TableCell className="pl-12">
                <Badge variant="secondary">Paso</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {workstreamName}
              </TableCell>
              <TableCell className="text-muted-foreground">{blockName}</TableCell>
              <TableCell className="text-muted-foreground">
                {activity.name}
              </TableCell>
              <TableCell className="font-medium">{step.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {step.description || "—"}
              </TableCell>
              <TableCell>
                <RowActions
                  onEdit={() => onEditStep(step, activity)}
                  onNew={() => onNewStep(activity)}
                  onMoveUp={
                    stepIndex > 0
                      ? () => void onMoveStep(step, "up")
                      : undefined
                  }
                  onMoveDown={
                    stepIndex < activity.steps.length - 1
                      ? () => void onMoveStep(step, "down")
                      : undefined
                  }
                  deleteTitle={`¿Eliminar paso “${step.name}”?`}
                  deleteDescription={
                    activity.steps.length <= 1
                      ? `Acción irreversible. Es el único paso de “${activity.name}”: se eliminará toda la unidad (actividad + paso). Workstream y bloque del catálogo se mantienen.`
                      : `Acción irreversible. Se eliminará este paso. La actividad “${activity.name}” conservará el resto.`
                  }
                  deleteEndpoint={`/api/events/${eventId}/design-steps/${step.id}`}
                  onDeleted={() => onRemovedStep(step.id)}
                />
              </TableCell>
            </TableRow>
          ))
        : null}
    </>
  );
}

function RowActions({
  onEdit,
  onNew,
  onMoveUp,
  onMoveDown,
  deleteTitle,
  deleteDescription,
  deleteEndpoint,
  onDeleted,
}: {
  onEdit: () => void;
  onNew?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  deleteTitle: string;
  deleteDescription: string;
  deleteEndpoint: string;
  onDeleted: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Subir"
        title="Arriba"
        disabled={!onMoveUp}
        onClick={onMoveUp}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Bajar"
        title="Abajo"
        disabled={!onMoveDown}
        onClick={onMoveDown}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Editar"
        title="Editar"
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>
      <DeleteRow
        title={deleteTitle}
        description={deleteDescription}
        endpoint={deleteEndpoint}
        onDeleted={onDeleted}
      />
      {onNew ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Nuevo"
          title="Nuevo"
          onClick={onNew}
        >
          <CirclePlus className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function DesignEditorDialog({
  open,
  editor,
  workstreams,
  blocks,
  saving,
  error,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  editor: EditorState | null;
  workstreams: WorkstreamSummary[];
  blocks: BlockSummary[];
  saving: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onChange: (editor: EditorState | null) => void;
  onSubmit: () => void;
}) {
  if (!editor) return null;

  const isNewStep = editor.mode === "create" && Boolean(editor.activityId);
  const isNewUnit = editor.mode === "create" && !editor.activityId;
  const title =
    editor.mode === "edit-workstream"
      ? "Editar workstream"
      : editor.mode === "edit-block"
        ? "Editar bloque"
        : editor.mode === "edit-activity"
          ? "Editar actividad"
          : editor.mode === "edit-step"
            ? "Editar paso"
            : isNewStep
              ? "Nuevo paso"
              : "Nueva actividad";

  function patch(partial: Partial<EditorState>) {
    onChange({ ...editor, ...partial } as EditorState);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {editor.mode === "edit-workstream"
              ? "Actualiza el nombre o la descripción del workstream en el catálogo."
              : editor.mode === "edit-block"
                ? "Actualiza el nombre o la descripción del bloque en el catálogo."
                : editor.mode === "edit-activity"
                  ? "Actualiza el nombre o la descripción de la actividad."
                  : editor.mode === "edit-step"
                    ? "Actualiza el nombre o la descripción del paso."
                    : isNewStep
                      ? `Agrega un paso a “${editor.activityName}”.`
                      : "Crea la unidad de diseño (actividad + paso obligatorio)."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {editor.mode === "edit-workstream" ||
          editor.mode === "edit-block" ||
          editor.mode === "edit-activity" ? (
            <>
              <div className="grid gap-1.5">
                <Label>Nombre</Label>
                <Input
                  value={editor.activityName}
                  onChange={(event) =>
                    patch({ activityName: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Descripción</Label>
                <Input
                  value={editor.activityDescription}
                  onChange={(event) =>
                    patch({ activityDescription: event.target.value })
                  }
                />
              </div>
            </>
          ) : null}

          {isNewUnit ? (
            <>
              <div className="grid gap-1.5">
                <Label>Workstream</Label>
                <Select
                  value={editor.workstreamId || undefined}
                  onValueChange={(value) => patch({ workstreamId: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Workstream" />
                  </SelectTrigger>
                  <SelectContent>
                    {workstreams.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Bloque</Label>
                <Select
                  value={editor.blockId || undefined}
                  onValueChange={(value) => patch({ blockId: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Bloque" />
                  </SelectTrigger>
                  <SelectContent>
                    {blocks.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Actividad</Label>
                <Input
                  value={editor.activityName}
                  onChange={(event) =>
                    patch({ activityName: event.target.value })
                  }
                  placeholder="Nombre de la actividad"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Paso</Label>
                <Input
                  value={editor.stepName}
                  onChange={(event) => patch({ stepName: event.target.value })}
                  placeholder="Nombre del paso (obligatorio)"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Descripción</Label>
                <Input
                  value={editor.activityDescription}
                  onChange={(event) =>
                    patch({ activityDescription: event.target.value })
                  }
                  placeholder="Opcional"
                />
              </div>
            </>
          ) : null}

          {isNewStep ? (
            <>
              <p className="text-sm text-muted-foreground">
                Actividad: <span className="text-foreground">{editor.activityName}</span>
              </p>
              <div className="grid gap-1.5">
                <Label>Paso</Label>
                <Input
                  value={editor.stepName}
                  onChange={(event) => patch({ stepName: event.target.value })}
                  placeholder="Nombre del paso"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Descripción corta</Label>
                <Input
                  value={editor.stepDescription}
                  onChange={(event) =>
                    patch({ stepDescription: event.target.value })
                  }
                  placeholder="Resumen breve"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Descripción larga</Label>
                <Textarea
                  value={editor.stepLongDescription}
                  onChange={(event) =>
                    patch({ stepLongDescription: event.target.value })
                  }
                  placeholder="Instrucciones para el ejecutor"
                  rows={4}
                />
              </div>
            </>
          ) : null}

          {editor.mode === "edit-step" ? (
            <>
              <div className="grid gap-1.5">
                <Label>Nombre</Label>
                <Input
                  value={editor.stepName}
                  onChange={(event) => patch({ stepName: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Descripción corta</Label>
                <Input
                  value={editor.stepDescription}
                  onChange={(event) =>
                    patch({ stepDescription: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Descripción larga</Label>
                <Textarea
                  value={editor.stepLongDescription}
                  onChange={(event) =>
                    patch({ stepLongDescription: event.target.value })
                  }
                  rows={4}
                />
              </div>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={onSubmit}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : editor.mode === "create" ? (
              <CirclePlus className="size-4" />
            ) : (
              <Pencil className="size-4" />
            )}
            {editor.mode === "create" ? "Agregar" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRow({
  title,
  description,
  endpoint,
  onDeleted,
}: {
  title: string;
  description: string;
  endpoint: string;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setLoading(true);
    setError("");
    const response = await fetch(endpoint, { method: "DELETE" }).catch(
      () => null,
    );
    if (!response?.ok) {
      const payload = response
        ? ((await response.json()) as { error?: string })
        : null;
      setError(payload?.error ?? "No fue posible eliminar.");
      setLoading(false);
      return;
    }
    onDeleted();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-destructive"
          aria-label="Eliminar"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            {loading ? "Eliminando…" : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
