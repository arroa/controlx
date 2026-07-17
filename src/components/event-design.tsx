"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  ListPlus,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
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

type EditorMode = "create" | "edit-activity" | "edit-step";

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
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState>(() =>
    emptyEditor(initialWorkstreams[0]?.id ?? "", initialBlocks[0]?.id ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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

  function removeStep(stepId: string) {
    setPairs((current) =>
      current.map((pair) => ({
        ...pair,
        activities: pair.activities.map((activity) => ({
          ...activity,
          steps: activity.steps.filter((step) => step.id !== stepId),
        })),
      })),
    );
  }

  function loadNewActivity(workstreamId: string, blockId: string) {
    setEditor({
      ...emptyEditor(workstreamId, blockId),
      mode: "create",
    });
    setError("");
  }

  function loadNewStep(activity: ActivityTreeNode) {
    setEditor({
      mode: "create",
      workstreamId: activity.workstreamId,
      blockId: activity.blockId,
      activityId: activity.id,
      stepId: "",
      activityName: activity.name,
      activityDescription: activity.description,
      stepName: "",
      stepDescription: "",
    });
    setError("");
  }

  function loadEditActivity(activity: ActivityTreeNode) {
    setEditor({
      mode: "edit-activity",
      workstreamId: activity.workstreamId,
      blockId: activity.blockId,
      activityId: activity.id,
      stepId: "",
      activityName: activity.name,
      activityDescription: activity.description,
      stepName: "",
      stepDescription: "",
    });
    setError("");
  }

  function loadEditStep(step: DesignStepSummary, activity: ActivityTreeNode) {
    setEditor({
      mode: "edit-step",
      workstreamId: step.workstreamId,
      blockId: step.blockId,
      activityId: step.activityId,
      stepId: step.id,
      activityName: activity.name,
      activityDescription: activity.description,
      stepName: step.name,
      stepDescription: step.description,
    });
    setError("");
  }

  async function submitEditor() {
    setSaving(true);
    setError("");

    try {
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
        setEditor(emptyEditor(editor.workstreamId, editor.blockId));
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
        setEditor(emptyEditor(editor.workstreamId, editor.blockId));
        return;
      }

      // create
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

      if (editor.stepName.trim().length >= 2) {
        const stepResponse = await fetch(
          `/api/events/${eventId}/design-steps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              activityId,
              name: editor.stepName,
              description: editor.stepDescription,
            }),
          },
        );
        const stepPayload = (await stepResponse.json()) as {
          step?: DesignStepSummary;
          error?: string;
        };
        if (!stepResponse.ok || !stepPayload.step) {
          throw new Error(stepPayload.error ?? "No fue posible crear el paso.");
        }
        upsertStep(stepPayload.step);
      } else if (editor.activityId) {
        throw new Error("Escribe el nombre del paso.");
      }

      setEditor({
        ...emptyEditor(editor.workstreamId, editor.blockId),
        activityId: "",
        activityName: "",
        activityDescription: "",
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No fue posible guardar.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function moveActivityRow(activity: ActivityTreeNode, direction: "up" | "down") {
    const response = await fetch(
      `/api/events/${eventId}/activities/${activity.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          activities?: ActivitySummary[];
          error?: string;
        })
      : null;
    if (!response?.ok || !payload?.activities) return;
    replaceActivitiesInPair(
      activity.workstreamId,
      activity.blockId,
      payload.activities,
    );
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

  if (!initialWorkstreams.length || !initialBlocks.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">El setup está incompleto</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Necesitas al menos un workstream y un bloque.
        </p>
      </div>
    );
  }

  const editingActivityLocked =
    editor.mode === "edit-step" ||
    (editor.mode === "create" && Boolean(editor.activityId));
  const showActivityFields = editor.mode !== "edit-step";
  const showStepFields = editor.mode !== "edit-activity";

  return (
    <div className="space-y-4">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por workstream, bloque, actividad, paso…"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[110px]">Tipo</TableHead>
              <TableHead>Workstream</TableHead>
              <TableHead>Bloque</TableHead>
              <TableHead>Actividad</TableHead>
              <TableHead>Paso</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[220px] text-right">Acciones</TableHead>
            </TableRow>
            <TableRow className="bg-primary/5 hover:bg-primary/5">
              <TableCell>
                <Badge variant="secondary">
                  {editor.mode === "edit-activity"
                    ? "Editar act."
                    : editor.mode === "edit-step"
                      ? "Editar paso"
                      : editor.activityId
                        ? "Nuevo paso"
                        : "Alta"}
                </Badge>
              </TableCell>
              <TableCell>
                <Select
                  value={editor.workstreamId}
                  onValueChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      workstreamId: value,
                      activityId: "",
                      activityName: "",
                      activityDescription: "",
                      stepId: "",
                      stepName: "",
                      stepDescription: "",
                      mode: "create",
                    }))
                  }
                  disabled={editor.mode !== "create" || Boolean(editor.activityId)}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Workstream" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialWorkstreams.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select
                  value={editor.blockId}
                  onValueChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      blockId: value,
                      activityId: "",
                      activityName: "",
                      activityDescription: "",
                      stepId: "",
                      stepName: "",
                      stepDescription: "",
                      mode: "create",
                    }))
                  }
                  disabled={editor.mode !== "create" || Boolean(editor.activityId)}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Bloque" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialBlocks.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                {showActivityFields ? (
                  <Input
                    className="h-8"
                    value={editor.activityName}
                    disabled={editingActivityLocked}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        activityName: event.target.value,
                      }))
                    }
                    placeholder="Actividad"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {editor.activityName}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {showStepFields ? (
                  <Input
                    className="h-8"
                    value={editor.stepName}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        stepName: event.target.value,
                      }))
                    }
                    placeholder={
                      editor.mode === "edit-activity"
                        ? "—"
                        : "Paso (opcional en alta de actividad)"
                    }
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Input
                  className="h-8"
                  value={
                    editor.mode === "edit-step" ||
                    (editor.mode === "create" && editor.activityId)
                      ? editor.stepDescription
                      : editor.activityDescription || editor.stepDescription
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setEditor((current) => {
                      if (
                        current.mode === "edit-step" ||
                        (current.mode === "create" && current.activityId)
                      ) {
                        return { ...current, stepDescription: value };
                      }
                      if (current.mode === "edit-activity") {
                        return { ...current, activityDescription: value };
                      }
                      // create activity(+step): description goes to activity;
                      // if typing step too, keep activity description field
                      return { ...current, activityDescription: value };
                    });
                  }}
                  placeholder="Descripción"
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {editor.mode !== "create" || editor.activityId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditor(
                          emptyEditor(editor.workstreamId, editor.blockId),
                        )
                      }
                    >
                      Limpiar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => void submitEditor()}
                  >
                    {saving ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <CirclePlus className="size-4" />
                    )}
                    {editor.mode === "create" ? "Agregar" : "Guardar"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <p role="alert" className="text-sm text-red-300">
                    {error}
                  </p>
                </TableCell>
              </TableRow>
            ) : null}

            {filteredPairs.every((pair) => pair.activities.length === 0) ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  {query
                    ? "No hay filas que coincidan con la búsqueda."
                    : "Todavía no hay diseño. Usa la fila editor para agregar la primera actividad y paso."}
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
                    onNewActivity={loadNewActivity}
                    onNewStep={loadNewStep}
                    onEditActivity={loadEditActivity}
                    onEditStep={loadEditStep}
                    onMoveActivity={moveActivityRow}
                    onMoveStep={moveStepRow}
                    onRemovedActivity={removeActivity}
                    onRemovedStep={removeStep}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
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
  onNewActivity,
  onNewStep,
  onEditActivity,
  onEditStep,
  onMoveActivity,
  onMoveStep,
  onRemovedActivity,
  onRemovedStep,
}: {
  eventId: string;
  group: WorkstreamGroup;
  wsKey: string;
  wsOpen: boolean;
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
  onNewActivity: (workstreamId: string, blockId: string) => void;
  onNewStep: (activity: ActivityTreeNode) => void;
  onEditActivity: (activity: ActivityTreeNode) => void;
  onEditStep: (step: DesignStepSummary, activity: ActivityTreeNode) => void;
  onMoveActivity: (
    activity: ActivityTreeNode,
    direction: "up" | "down",
  ) => Promise<void>;
  onMoveStep: (
    step: DesignStepSummary,
    direction: "up" | "down",
  ) => Promise<void>;
  onRemovedActivity: (activityId: string) => void;
  onRemovedStep: (stepId: string) => void;
}) {
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={7}>
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
                onEditActivity={onEditActivity}
                onEditStep={onEditStep}
                onMoveActivity={onMoveActivity}
                onMoveStep={onMoveStep}
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
  onEditActivity,
  onEditStep,
  onMoveActivity,
  onMoveStep,
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
  onEditActivity: (activity: ActivityTreeNode) => void;
  onEditStep: (step: DesignStepSummary, activity: ActivityTreeNode) => void;
  onMoveActivity: (
    activity: ActivityTreeNode,
    direction: "up" | "down",
  ) => Promise<void>;
  onMoveStep: (
    step: DesignStepSummary,
    direction: "up" | "down",
  ) => Promise<void>;
  onRemovedActivity: (activityId: string) => void;
  onRemovedStep: (stepId: string) => void;
}) {
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onNewActivity(workstream.id, block.id)}
            >
              <ListPlus className="size-4" />
              Nueva actividad
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {blockOpen
        ? activities.map((activity, activityIndex) => {
            const actKey = `act:${activity.id}`;
            const actOpen = isOpen(actKey);
            return (
              <ActivityRows
                key={activity.id}
                eventId={eventId}
                activity={activity}
                actKey={actKey}
                actOpen={actOpen}
                canMoveUp={activityIndex > 0}
                canMoveDown={activityIndex < activities.length - 1}
                onToggle={onToggle}
                onNewStep={onNewStep}
                onEditActivity={onEditActivity}
                onEditStep={onEditStep}
                onMoveActivity={onMoveActivity}
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
  canMoveUp,
  canMoveDown,
  onToggle,
  onNewStep,
  onEditActivity,
  onEditStep,
  onMoveActivity,
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
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: (key: string) => void;
  onNewStep: (activity: ActivityTreeNode) => void;
  onEditActivity: (activity: ActivityTreeNode) => void;
  onEditStep: (step: DesignStepSummary, activity: ActivityTreeNode) => void;
  onMoveActivity: (
    activity: ActivityTreeNode,
    direction: "up" | "down",
  ) => Promise<void>;
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
      <TableRow>
        <TableCell>
          <button
            type="button"
            className="flex items-center gap-1"
            onClick={() => onToggle(actKey)}
          >
            {actOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            <Badge variant="outline">Actividad</Badge>
          </button>
        </TableCell>
        <TableCell className="text-muted-foreground">{workstreamName}</TableCell>
        <TableCell className="text-muted-foreground">{blockName}</TableCell>
        <TableCell className="font-medium">{activity.name}</TableCell>
        <TableCell className="text-muted-foreground">—</TableCell>
        <TableCell className="text-muted-foreground">
          {activity.description || "—"}
        </TableCell>
        <TableCell>
          <RowActions
            onNewStep={() => onNewStep(activity)}
            onNewActivity={undefined}
            onEdit={() => onEditActivity(activity)}
            onMoveUp={
              canMoveUp ? () => void onMoveActivity(activity, "up") : undefined
            }
            onMoveDown={
              canMoveDown
                ? () => void onMoveActivity(activity, "down")
                : undefined
            }
            deleteTitle={`¿Eliminar actividad ${activity.name}?`}
            deleteDescription="También se eliminarán todos sus pasos."
            deleteEndpoint={`/api/events/${eventId}/activities/${activity.id}`}
            onDeleted={() => onRemovedActivity(activity.id)}
          />
        </TableCell>
      </TableRow>

      {actOpen
        ? activity.steps.map((step, stepIndex) => (
            <TableRow key={step.id} className="bg-background">
              <TableCell className="pl-8">
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
                  onNewStep={() => onNewStep(activity)}
                  onEdit={() => onEditStep(step, activity)}
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
                  deleteTitle={`¿Eliminar paso ${step.name}?`}
                  deleteDescription="Se quitará del diseño del evento."
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
  onNewStep,
  onNewActivity,
  onEdit,
  onMoveUp,
  onMoveDown,
  deleteTitle,
  deleteDescription,
  deleteEndpoint,
  onDeleted,
}: {
  onNewStep?: () => void;
  onNewActivity?: () => void;
  onEdit: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  deleteTitle: string;
  deleteDescription: string;
  deleteEndpoint: string;
  onDeleted: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      {onNewActivity ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Nueva actividad"
          onClick={onNewActivity}
        >
          <ListPlus className="size-4" />
        </Button>
      ) : null}
      {onNewStep ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Nuevo paso"
          onClick={onNewStep}
        >
          <CirclePlus className="size-4" />
        </Button>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Editar"
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Subir"
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
        disabled={!onMoveDown}
        onClick={onMoveDown}
      >
        <ArrowDown className="size-4" />
      </Button>
      <DeleteRow
        title={deleteTitle}
        description={deleteDescription}
        endpoint={deleteEndpoint}
        onDeleted={onDeleted}
      />
    </div>
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
