"use client";

import {
  Archive,
  ArchiveRestore,
  CalendarRange,
  LoaderCircle,
  LogIn,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TimezoneCombobox } from "@/components/timezone-combobox";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import type {
  AdminSummary,
  EventSummary,
  EventUsage,
  OrganizationSummary,
} from "@/lib/admin-data";

export function OrganizationWorkspace({
  organization,
  initialEvents,
  readOnly = false,
}: {
  organization: OrganizationSummary;
  initialEvents: EventSummary[];
  readOnly?: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const active = useMemo(
    () => events.filter((item) => item.status !== "ARCHIVED"),
    [events],
  );
  const archived = useMemo(
    () => events.filter((item) => item.status === "ARCHIVED"),
    [events],
  );

  function openCreate() {
    setEditingId(null);
    setEditorOpen(true);
  }

  function openEdit(eventId: string) {
    setEditingId(eventId);
    setEditorOpen(true);
  }

  function upsertEvent(event: EventSummary) {
    setEvents((current) => {
      const exists = current.some((item) => item.id === event.id);
      if (!exists) return [event, ...current];
      return current.map((item) => (item.id === event.id ? event : item));
    });
  }

  function removeEvent(eventId: string) {
    setEvents((current) => current.filter((item) => item.id !== eventId));
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-5">
          <h2 className="text-xl font-semibold">Eventos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Diseños de procesos de {organization.name}.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onEdit={() => openEdit(event.id)}
            />
          ))}

          {!readOnly ? (
            <button
              type="button"
              onClick={openCreate}
              className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-transparent text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              <span className="flex size-12 items-center justify-center rounded-full border border-dashed">
                <Plus className="size-5" />
              </span>
              <span className="text-sm font-medium">Nuevo evento</span>
            </button>
          ) : null}
        </div>

        {!active.length && readOnly ? (
          <Card className="mt-4 border-dashed">
            <CardContent className="flex min-h-40 flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <CalendarRange className="mb-3 size-6" />
              No hay eventos activos en esta organización.
            </CardContent>
          </Card>
        ) : null}
      </section>

      {archived.length ? (
        <section>
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Archivo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Eventos archivados: solo consulta y desarchivar.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {archived.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                archived
                onEdit={() => openEdit(event.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <EventEditorDialog
        open={editorOpen}
        organizationId={organization.id}
        eventId={editingId}
        readOnlyOrg={readOnly}
        onOpenChange={setEditorOpen}
        onSaved={(event, options) => {
          upsertEvent(event);
          if (options?.continueEditing) {
            setEditingId(event.id);
          }
        }}
        onDeleted={removeEvent}
      />
    </div>
  );
}

function EventCard({
  event,
  archived = false,
  onEdit,
}: {
  event: EventSummary;
  archived?: boolean;
  onEdit: () => void;
}) {
  return (
    <Card className={archived ? "opacity-80" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline">
            {archived ? "Archivado" : event.status}
          </Badge>
          <Badge variant="secondary">{event.executionCount} ejecuciones</Badge>
        </div>
        <CardTitle className="pt-3">{event.name}</CardTitle>
        <CardDescription>
          {event.description || event.timezone}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {archived ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="h-12 w-[20%] min-w-14 border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 hover:text-amber-50"
              onClick={onEdit}
              aria-label="Ver o desarchivar evento"
            >
              <Pencil className="size-5" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              asChild
              className="h-12 w-[50%] bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"
            >
              <Link href={`/events/${event.id}`} aria-label="Entrar al evento">
                <LogIn className="size-5" />
              </Link>
            </Button>
            <Button
              className="h-12 w-[20%] border-sky-500/40 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30 hover:text-sky-50"
              variant="outline"
              onClick={onEdit}
              aria-label="Editar evento"
            >
              <Pencil className="size-5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventEditorDialog({
  open,
  organizationId,
  eventId,
  readOnlyOrg,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  organizationId: string;
  eventId: string | null;
  readOnlyOrg: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (
    event: EventSummary,
    options?: { continueEditing?: boolean },
  ) => void;
  onDeleted: (eventId: string) => void;
}) {
  const isCreate = !eventId;
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("America/Bogota");
  const [status, setStatus] = useState<EventSummary["status"]>("BORRADOR");
  const [usage, setUsage] = useState<EventUsage | null>(null);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const archived = status === "ARCHIVED";
  const fieldsLocked = archived || readOnlyOrg;

  useEffect(() => {
    if (!open) return;

    setError("");
    setDraftName("");
    setDraftEmail("");
    setEditingAdminId(null);

    if (!eventId) {
      setName("");
      setDescription("");
      setTimezone("America/Bogota");
      setStatus("BORRADOR");
      setUsage(null);
      setAdmins([]);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/events/${eventId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          event?: EventSummary;
          usage?: EventUsage;
          admins?: AdminSummary[];
          error?: string;
        };
        if (!response.ok || !payload.event || !payload.usage) {
          throw new Error(payload.error ?? "No fue posible cargar.");
        }
        if (cancelled) return;
        setName(payload.event.name);
        setDescription(payload.event.description);
        setTimezone(payload.event.timezone);
        setStatus(payload.event.status);
        setUsage(payload.usage);
        setAdmins(payload.admins ?? []);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar el evento.",
        );
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  async function saveEvent() {
    setLoading(true);
    setError("");
    try {
      if (isCreate) {
        const response = await fetch(
          `/api/organizations/${organizationId}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description, timezone }),
          },
        );
        const payload = (await response.json()) as {
          event?: EventSummary;
          error?: string;
        };
        if (!response.ok || !payload.event) {
          setError(payload.error ?? "No fue posible crear el evento.");
          return;
        }
        onSaved(payload.event, { continueEditing: true });
        setStatus(payload.event.status);
        setAdmins([]);
        setUsage({
          executionCount: 0,
          isEmpty: true,
        });
        return;
      }

      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, timezone }),
      });
      const payload = (await response.json()) as {
        event?: EventSummary;
        error?: string;
      };
      if (!response.ok || !payload.event) {
        setError(payload.error ?? "No fue posible guardar.");
        return;
      }
      onSaved(payload.event);
      setStatus(payload.event.status);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  async function setEventStatus(next: "ARCHIVED" | "BORRADOR") {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = (await response.json()) as {
        event?: EventSummary;
        error?: string;
      };
      if (!response.ok || !payload.event) {
        setError(payload.error ?? "No fue posible cambiar el estado.");
        return;
      }
      onSaved(payload.event);
      setStatus(payload.event.status);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  async function hardDelete() {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "No fue posible eliminar.");
        return;
      }
      onDeleted(eventId);
      onOpenChange(false);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAdmin() {
    if (!eventId || fieldsLocked) return;
    setAdminBusy(true);
    setError("");
    const endpoint = editingAdminId
      ? `/api/events/${eventId}/admins/${editingAdminId}`
      : `/api/events/${eventId}/admins`;
    try {
      const response = await fetch(endpoint, {
        method: editingAdminId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, email: draftEmail }),
      });
      const payload = (await response.json()) as {
        admin?: AdminSummary;
        error?: string;
      };
      if (!response.ok || !payload.admin) {
        setError(payload.error ?? "No fue posible guardar el EventAdmin.");
        return;
      }
      setAdmins((current) => {
        const exists = current.some((item) => item.id === payload.admin!.id);
        if (!exists) return [...current, payload.admin!];
        return current.map((item) =>
          item.id === payload.admin!.id ? payload.admin! : item,
        );
      });
      setDraftName("");
      setDraftEmail("");
      setEditingAdminId(null);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function removeAdmin(adminId: string) {
    if (!eventId || fieldsLocked) return;
    setAdminBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${eventId}/admins/${adminId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "No fue posible eliminar el EventAdmin.");
        return;
      }
      setAdmins((current) => current.filter((item) => item.id !== adminId));
      if (editingAdminId === adminId) {
        setEditingAdminId(null);
        setDraftName("");
        setDraftEmail("");
      }
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate
              ? "Nuevo evento"
              : archived
                ? "Evento archivado"
                : "Editar evento"}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Define el diseño base. Al crear, podrás asignar EventAdmins enseguida."
              : archived
                ? "Solo lectura. Desarchiva para volver a usarlo."
                : "Título, descripción, zona horaria y EventAdmins."}
          </DialogDescription>
        </DialogHeader>

        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="event-name">Título</Label>
                <Input
                  id="event-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={fieldsLocked}
                  required
                  minLength={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-description">Descripción</Label>
                <Input
                  id="event-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={fieldsLocked}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-timezone">Zona horaria</Label>
                <TimezoneCombobox
                  id="event-timezone"
                  value={timezone}
                  onValueChange={setTimezone}
                  disabled={fieldsLocked}
                />
              </div>
            </div>

            {!isCreate ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">EventAdmins</h3>
                  <p className="text-xs text-muted-foreground">
                    Configuran y administran este evento.
                  </p>
                </div>

                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="w-[1%] text-right">
                          Acciones
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {admins.map((admin) => (
                        <TableRow key={admin.id}>
                          <TableCell className="font-medium">
                            {admin.name}
                          </TableCell>
                          <TableCell>{admin.email}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={fieldsLocked || adminBusy}
                                onClick={() => {
                                  setEditingAdminId(admin.id);
                                  setDraftName(admin.name);
                                  setDraftEmail(admin.email);
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={fieldsLocked || adminBusy}
                                onClick={() => removeAdmin(admin.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!admins.length ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-muted-foreground"
                          >
                            Aún no hay EventAdmins.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                {!fieldsLocked ? (
                  <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      placeholder="Nombre"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      disabled={adminBusy}
                    />
                    <Input
                      placeholder="Email"
                      type="email"
                      value={draftEmail}
                      onChange={(event) => setDraftEmail(event.target.value)}
                      disabled={adminBusy}
                    />
                    <Button
                      type="button"
                      disabled={
                        adminBusy || !draftName.trim() || !draftEmail.trim()
                      }
                      onClick={saveAdmin}
                    >
                      {adminBusy ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : null}
                      {editingAdminId ? "Guardar" : "Agregar"}
                    </Button>
                  </div>
                ) : null}

                {usage ? (
                  <p className="text-xs text-muted-foreground">
                    Contenido: {usage.executionCount} ejecuciones ·{" "}
                    {admins.length} EventAdmins
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {!isCreate && !archived && !readOnlyOrg ? (
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setEventStatus("ARCHIVED")}
              >
                <Archive className="size-4" />
                Archivar
              </Button>
            ) : null}
            {!isCreate && archived && !readOnlyOrg ? (
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setEventStatus("BORRADOR")}
              >
                <ArchiveRestore className="size-4" />
                Desarchivar
              </Button>
            ) : null}
            {!isCreate && !readOnlyOrg ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={loading || (usage ? !usage.isEmpty : true)}
                  >
                    <Trash2 className="size-4" />
                    Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      ¿Eliminar definitivamente?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Solo disponible si no hay ejecuciones. Se borrará el
                      diseño del evento.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={hardDelete}>
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
            {!fieldsLocked ? (
              <Button
                type="button"
                disabled={loading || detailLoading || name.trim().length < 3}
                onClick={saveEvent}
              >
                {loading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {isCreate ? "Crear" : "Guardar"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
