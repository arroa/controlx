"use client";

import {
  Boxes,
  CalendarClock,
  CirclePlus,
  Layers3,
  LoaderCircle,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AreaCombobox } from "@/components/area-combobox";
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
import { DateTimePicker } from "@/components/datetime-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BlockSummary, WorkstreamSummary } from "@/lib/admin-data";
import {
  EVENT_ACTOR_ROLE_OPTIONS,
  type EventActorRole,
  type EventActorSummary,
} from "@/lib/event-actors";

type CatalogKind = "workstream" | "block";
type CatalogItem = WorkstreamSummary | BlockSummary;

export function EventSetup({
  eventId,
  eventTimezone,
  initialDayDStartAt,
  initialWorkstreams,
  initialBlocks,
  initialActors,
  canManageEventAdminRole,
}: {
  eventId: string;
  eventTimezone: string;
  initialDayDStartAt: string | null;
  initialWorkstreams: WorkstreamSummary[];
  initialBlocks: BlockSummary[];
  initialActors: EventActorSummary[];
  canManageEventAdminRole: boolean;
}) {
  const [workstreams, setWorkstreams] = useState(initialWorkstreams);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [actors, setActors] = useState(initialActors);

  return (
    <div className="space-y-6">
      <DayDCard
        eventId={eventId}
        eventTimezone={eventTimezone}
        initialDayDStartAt={initialDayDStartAt}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <CatalogCard
          eventId={eventId}
          kind="workstream"
          title="Workstreams"
          description="Líneas de trabajo que se ejecutarán en paralelo."
          icon={Layers3}
          items={workstreams}
          onSaved={(item) =>
            setWorkstreams((current) =>
              upsertItem(current, item as WorkstreamSummary),
            )
          }
          onRemoved={(id) =>
            setWorkstreams((current) =>
              current.filter((item) => item.id !== id),
            )
          }
        />
        <CatalogCard
          eventId={eventId}
          kind="block"
          title="Bloques"
          description="Objetos operativos del evento, normalmente aplicaciones."
          icon={Boxes}
          items={blocks}
          onSaved={(item) =>
            setBlocks((current) => upsertItem(current, item as BlockSummary))
          }
          onRemoved={(id) =>
            setBlocks((current) => current.filter((item) => item.id !== id))
          }
        />
      </div>
      <ActorsMapCard
        eventId={eventId}
        actors={actors}
        canManageEventAdminRole={canManageEventAdminRole}
        onSaved={(actor) =>
          setActors((current) =>
            current.some((item) => item.id === actor.id)
              ? current.map((item) => (item.id === actor.id ? actor : item))
              : [...current, actor],
          )
        }
        onRemoved={(id) =>
          setActors((current) => current.filter((item) => item.id !== id))
        }
      />
    </div>
  );
}

function ActorsMapCard({
  eventId,
  actors,
  canManageEventAdminRole,
  onSaved,
  onRemoved,
}: {
  eventId: string;
  actors: EventActorSummary[];
  canManageEventAdminRole: boolean;
  onSaved: (actor: EventActorSummary) => void;
  onRemoved: (id: string) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftArea, setDraftArea] = useState("");
  const [draftRoles, setDraftRoles] = useState<EventActorRole[]>(["EXECUTOR"]);
  const [extraAreas, setExtraAreas] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: "saving" | "ok" | "error";
    message: string;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(
    kind: "saving" | "ok" | "error",
    message: string,
    autoHideMs?: number,
  ) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ kind, message });
    const hideAfter =
      autoHideMs ?? (kind === "saving" ? undefined : kind === "ok" ? 2200 : 4000);
    if (hideAfter) {
      toastTimer.current = setTimeout(() => setToast(null), hideAfter);
    }
  }

  function setError(message: string) {
    if (!message) {
      setToast((current) => (current?.kind === "error" ? null : current));
      return;
    }
    showToast("error", message);
  }

  const areas = useMemo(() => {
    const fromActors = actors.map((actor) => actor.area).filter(Boolean);
    return [...new Set([...fromActors, ...extraAreas])];
  }, [actors, extraAreas]);

  function rememberArea(area: string) {
    setExtraAreas((current) =>
      current.some((item) => item.toLowerCase() === area.toLowerCase())
        ? current
        : [...current, area],
    );
  }

  function toggleDraftRole(role: EventActorRole) {
    if (role === "EVENT_ADMIN" && !canManageEventAdminRole) return;
    setDraftRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  }

  async function createActor(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    if (!draftRoles.length) {
      setError("Elige al menos un rol.");
      setCreating(false);
      return;
    }
    if (!draftArea.trim()) {
      setError("Indica el área.");
      setCreating(false);
      return;
    }
    const response = await fetch(`/api/events/${eventId}/actors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName,
        email: draftEmail,
        area: draftArea,
        roles: draftRoles,
      }),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          actor?: EventActorSummary;
          error?: string;
        })
      : null;
    setCreating(false);
    if (!response?.ok || !payload?.actor) {
      setError(payload?.error ?? "No fue posible agregar el actor.");
      return;
    }
    rememberArea(payload.actor.area);
    onSaved(payload.actor);
    setDraftName("");
    setDraftEmail("");
    setDraftArea("");
    setDraftRoles(["EXECUTOR"]);
  }

  async function patchActor(
    actor: EventActorSummary,
    previous: EventActorSummary,
  ) {
    if (!actor.roles.length) {
      setError("Cada actor debe tener al menos un rol.");
      onSaved(previous);
      return;
    }
    setSavingId(actor.id);
    showToast("saving", `Guardando roles de ${actor.name}…`);
    const response = await fetch(
      `/api/events/${eventId}/actors/${actor.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: actor.name,
          email: actor.email,
          area: actor.area.trim() || "General",
          roles: actor.roles,
        }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          actor?: EventActorSummary;
          error?: string;
        })
      : null;
    setSavingId(null);
    if (!response?.ok || !payload?.actor) {
      onSaved(previous);
      showToast(
        "error",
        payload?.error ?? "No fue posible actualizar el actor.",
      );
      return;
    }
    rememberArea(payload.actor.area);
    onSaved(payload.actor);
    showToast("ok", `Roles de ${payload.actor.name} guardados.`);
  }

  function toggleActorRole(actor: EventActorSummary, role: EventActorRole) {
    if (role === "EVENT_ADMIN" && !canManageEventAdminRole) return;
    const next = actor.roles.includes(role)
      ? actor.roles.filter((item) => item !== role)
      : [...actor.roles, role];
    const optimistic = { ...actor, roles: next };
    onSaved(optimistic);
    void patchActor(optimistic, actor);
  }

  return (
    <Card className="relative overflow-visible">
      {toast ? (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`pointer-events-none absolute right-4 top-4 z-20 max-w-xs rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur ${
            toast.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : toast.kind === "error"
                ? "border-red-500/40 bg-red-950/90 text-red-200"
                : "border-slate-500/40 bg-slate-950/90 text-slate-200"
          }`}
        >
          <span className="flex items-center gap-2">
            {toast.kind === "saving" ? (
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
            ) : null}
            <span>{toast.message}</span>
          </span>
        </div>
      ) : null}
      <CardHeader>
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <div>
            <CardTitle>Mapa de actores</CardTitle>
            <CardDescription className="mt-1">
              Nombre, correo y área. Los roles se marcan en línea. El alta
              sincroniza el usuario en Clerk; la baja solo lo desactiva en
              ControlX.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[9rem]">Nombre</TableHead>
                <TableHead className="min-w-[12rem]">Email</TableHead>
                <TableHead className="min-w-[8rem]">Área</TableHead>
                {EVENT_ACTOR_ROLE_OPTIONS.map((option) => (
                  <TableHead
                    key={option.value}
                    className="w-[5.5rem] text-center"
                    title={option.description}
                  >
                    {option.label}
                  </TableHead>
                ))}
                <TableHead className="w-[5.5rem] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actors.map((actor) => {
                const busy = savingId === actor.id;
                const deleteBlocked =
                  actor.roles.includes("EVENT_ADMIN") &&
                  !canManageEventAdminRole;
                return (
                  <TableRow
                    key={actor.id}
                    className={busy ? "bg-cyan-500/5" : undefined}
                  >
                    <TableCell className="max-w-[10rem] font-medium">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="block truncate" title={actor.name}>
                          {actor.name}
                        </span>
                        {busy ? (
                          <LoaderCircle
                            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                            aria-label="Guardando"
                          />
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[14rem]">
                      <span className="block truncate" title={actor.email}>
                        {actor.email}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[10rem]">
                      <span className="block truncate" title={actor.area}>
                        {actor.area || "—"}
                      </span>
                    </TableCell>
                    {EVENT_ACTOR_ROLE_OPTIONS.map((option) => {
                      const locked =
                        option.value === "EVENT_ADMIN" &&
                        !canManageEventAdminRole;
                      return (
                        <TableCell key={option.value} className="text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary disabled:opacity-40"
                            checked={actor.roles.includes(option.value)}
                            disabled={busy || locked}
                            title={
                              locked
                                ? "Solo OrgAdmin/SuperAdmin"
                                : option.description
                            }
                            aria-label={`${option.label} para ${actor.name}`}
                            onChange={() =>
                              toggleActorRole(actor, option.value)
                            }
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <EditActorDialog
                          eventId={eventId}
                          actor={actor}
                          areas={areas}
                          onAreaCreated={rememberArea}
                          onSaved={onSaved}
                          onError={setError}
                        />
                        <RemoveActor
                          eventId={eventId}
                          actor={actor}
                          blocked={deleteBlocked}
                          busy={busy}
                          onRemoved={() => onRemoved(actor.id)}
                          onError={setError}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableCell>
                  <form
                    id="actor-create-form"
                    className="contents"
                    onSubmit={createActor}
                  >
                    <Input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder="Nombre"
                      required
                      className="h-8"
                    />
                  </form>
                </TableCell>
                <TableCell>
                  <Input
                    form="actor-create-form"
                    type="email"
                    value={draftEmail}
                    onChange={(event) => setDraftEmail(event.target.value)}
                    placeholder="correo@empresa.com"
                    required
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <AreaCombobox
                    value={draftArea}
                    areas={areas}
                    onValueChange={setDraftArea}
                    onAreaCreated={rememberArea}
                    disabled={creating}
                    placeholder="Área"
                  />
                </TableCell>
                {EVENT_ACTOR_ROLE_OPTIONS.map((option) => {
                  const locked =
                    option.value === "EVENT_ADMIN" && !canManageEventAdminRole;
                  return (
                    <TableCell key={option.value} className="text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary disabled:opacity-40"
                        checked={draftRoles.includes(option.value)}
                        disabled={creating || locked}
                        title={
                          locked
                            ? "Solo OrgAdmin/SuperAdmin"
                            : option.description
                        }
                        aria-label={`${option.label} para nuevo actor`}
                        onChange={() => toggleDraftRole(option.value)}
                      />
                    </TableCell>
                  );
                })}
                <TableCell className="text-right">
                  <Button
                    type="submit"
                    form="actor-create-form"
                    size="sm"
                    variant="outline"
                    disabled={creating}
                    className="h-8"
                  >
                    {creating ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <CirclePlus className="size-3.5" />
                    )}
                    Alta
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function EditActorDialog({
  eventId,
  actor,
  areas,
  onAreaCreated,
  onSaved,
  onError,
}: {
  eventId: string;
  actor: EventActorSummary;
  areas: string[];
  onAreaCreated: (area: string) => void;
  onSaved: (actor: EventActorSummary) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(actor.name);
  const [email, setEmail] = useState(actor.email);
  const [area, setArea] = useState(actor.area);
  const [localError, setLocalError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setLocalError("");
    onError("");
    const response = await fetch(
      `/api/events/${eventId}/actors/${actor.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          area,
          roles: actor.roles,
        }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          actor?: EventActorSummary;
          error?: string;
        })
      : null;
    setLoading(false);
    if (!response?.ok || !payload?.actor) {
      const message = payload?.error ?? "No fue posible guardar.";
      setLocalError(message);
      onError(message);
      return;
    }
    onAreaCreated(payload.actor.area);
    onSaved(payload.actor);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(actor.name);
          setEmail(actor.email);
          setArea(actor.area);
          setLocalError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Editar ${actor.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar actor</DialogTitle>
          <DialogDescription>
            Actualiza nombre, correo y área. Si cambias el correo y no existe
            en Clerk, se crea ahí.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`edit-name-${actor.id}`}>Nombre</Label>
            <Input
              id={`edit-name-${actor.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-email-${actor.id}`}>Email</Label>
            <Input
              id={`edit-email-${actor.id}`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Área</Label>
            <AreaCombobox
              value={area}
              areas={areas}
              onValueChange={setArea}
              onAreaCreated={onAreaCreated}
              disabled={loading}
              className="h-10"
            />
          </div>
          {localError ? (
            <p role="alert" className="text-sm text-red-300">
              {localError}
            </p>
          ) : null}
          <Button className="w-full" disabled={loading || !area.trim()}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {loading ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveActor({
  eventId,
  actor,
  blocked,
  busy,
  onRemoved,
  onError,
}: {
  eventId: string;
  actor: EventActorSummary;
  blocked: boolean;
  busy: boolean;
  onRemoved: () => void;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    onError("");
    const response = await fetch(
      `/api/events/${eventId}/actors/${actor.id}`,
      { method: "DELETE" },
    ).catch(() => null);
    setLoading(false);
    if (!response?.ok) {
      const payload = response
        ? ((await response.json()) as { error?: string })
        : null;
      onError(payload?.error ?? "No fue posible quitar el actor.");
      return;
    }
    onRemoved();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Quitar a ${actor.email}`}
          className="text-destructive"
          disabled={blocked || busy || loading}
          title={
            blocked
              ? "Solo OrgAdmin o SuperAdmin puede quitar un EventAdmin"
              : "Quitar actor"
          }
        >
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar actor?</AlertDialogTitle>
          <AlertDialogDescription>
            {actor.email} saldrá del mapa de actores.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
            disabled={loading}
          >
            {loading ? "Quitando…" : "Quitar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DayDCard({
  eventId,
  eventTimezone,
  initialDayDStartAt,
}: {
  eventId: string;
  eventTimezone: string;
  initialDayDStartAt: string | null;
}) {
  const [dayDStartAt, setDayDStartAt] = useState(initialDayDStartAt);
  const [draft, setDraft] = useState(initialDayDStartAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function save(nextValue: string | null) {
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayDStartAt: nextValue }),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          event?: { dayDStartAt: string | null };
          error?: string;
        })
      : null;
    setSaving(false);

    if (!response?.ok || !payload?.event) {
      const message =
        payload?.error ?? "No fue posible guardar el inicio del Día D.";
      setError(message);
      throw new Error(message);
    }
    setDayDStartAt(payload.event.dayDStartAt);
    setDraft(payload.event.dayDStartAt);
    setSuccess(
      payload.event.dayDStartAt
        ? "Inicio del Día D guardado correctamente."
        : "Inicio del Día D limpiado.",
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle>Inicio del Día D</CardTitle>
            <CardDescription className="mt-1">
              Origen absoluto del timeline (visor de tiempos). Los gates y horas
              de pasos se miden desde aquí. TZ: {eventTimezone}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Fecha y hora de arranque del Día D</Label>
          <DateTimePicker
            value={draft}
            timezone={eventTimezone}
            confirming={saving}
            confirmLabel="Guardar"
            onChange={(value) => {
              setDraft(value);
              setSuccess("");
              setError("");
            }}
            onConfirm={async (value) => {
              await save(value);
            }}
            placeholder="Definir inicio del Día D"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-emerald-400">
            {success}
          </p>
        ) : null}
        {!dayDStartAt ? (
          <p className="text-xs text-muted-foreground">
            Sin este valor, el planificador usa un origen relativo (el ancla más
            temprana) y el eje no refleja la hora civil del Día D.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CatalogCard({
  eventId,
  kind,
  title,
  description,
  icon: Icon,
  items,
  onSaved,
  onRemoved,
}: {
  eventId: string;
  kind: CatalogKind;
  title: string;
  description: string;
  icon: typeof Layers3;
  items: CatalogItem[];
  onSaved: (item: CatalogItem) => void;
  onRemoved: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          <CatalogDialog
            eventId={eventId}
            kind={kind}
            onSaved={onSaved}
          />
        </div>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.description || "Sin descripción"}
                  </p>
                </div>
                <CatalogDialog
                  eventId={eventId}
                  kind={kind}
                  item={item}
                  onSaved={onSaved}
                />
                <RemoveCatalogItem
                  eventId={eventId}
                  kind={kind}
                  item={item}
                  onRemoved={() => onRemoved(item.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Este catálogo todavía está vacío.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogDialog({
  eventId,
  kind,
  item,
  onSaved,
}: {
  eventId: string;
  kind: CatalogKind;
  item?: CatalogItem;
  onSaved: (item: CatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const label = kind === "workstream" ? "workstream" : "bloque";
  const collection = kind === "block" ? "blocks" : "workstreams";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const endpoint = `/api/events/${eventId}/${collection}${
      item ? `/${item.id}` : ""
    }`;
    const response = await fetch(endpoint, {
      method: item ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
      }),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as {
          workstream?: WorkstreamSummary;
          block?: BlockSummary;
          error?: string;
        })
      : null;
    const saved = payload?.workstream ?? payload?.block;
    if (!response?.ok || !saved) {
      setError(payload?.error ?? `No fue posible guardar el ${label}.`);
      setLoading(false);
      return;
    }
    onSaved(saved);
    setOpen(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {item ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Editar ${item.name}`}
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <CirclePlus className="size-4" />
            Agregar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item ? `Editar ${label}` : `Nuevo ${label}`}
          </DialogTitle>
          <DialogDescription>
            {item
              ? "Actualiza el nombre o la descripción."
              : "Se incorporará al catálogo cerrado de este evento."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`${kind}-name-${item?.id ?? "new"}`}>Nombre</Label>
            <Input
              id={`${kind}-name-${item?.id ?? "new"}`}
              name="name"
              defaultValue={item?.name}
              required
              minLength={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${kind}-description-${item?.id ?? "new"}`}>
              Descripción
            </Label>
            <Input
              id={`${kind}-description-${item?.id ?? "new"}`}
              name="description"
              defaultValue={item?.description}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {loading ? "Guardando…" : item ? "Guardar cambios" : `Crear ${label}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveCatalogItem({
  eventId,
  kind,
  item,
  onRemoved,
}: {
  eventId: string;
  kind: CatalogKind;
  item: CatalogItem;
  onRemoved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const label = kind === "workstream" ? "workstream" : "bloque";
  const collection = kind === "block" ? "blocks" : "workstreams";

  async function remove() {
    setLoading(true);
    setError("");
    const response = await fetch(
      `/api/events/${eventId}/${collection}/${item.id}`,
      { method: "DELETE" },
    ).catch(() => null);
    if (!response?.ok) {
      const payload = response
        ? ((await response.json()) as { error?: string })
        : null;
      setError(payload?.error ?? `No fue posible eliminar el ${label}.`);
      setLoading(false);
      return;
    }
    onRemoved();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          aria-label={`Eliminar ${item.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar {item.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quitará del catálogo. Si tiene actividades en el diseño, también
            se eliminarán esas actividades y todos sus pasos. No se puede
            deshacer.
          </AlertDialogDescription>
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

function upsertItem<T extends CatalogItem>(items: T[], saved: T): T[] {
  return items.some((item) => item.id === saved.id)
    ? items.map((item) => (item.id === saved.id ? saved : item))
    : [...items, saved];
}
