"use client";

import {
  Archive,
  ArchiveRestore,
  Building2,
  LoaderCircle,
  LogIn,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  OrganizationSummary,
  OrganizationUsage,
} from "@/lib/admin-data";

type AdminDashboardProps = {
  databaseReady: boolean;
  initialOrganizations: OrganizationSummary[];
};

type OrganizationDetail = {
  organization: OrganizationSummary;
  admins: AdminSummary[];
  usage: OrganizationUsage;
};

export function AdminDashboard({
  databaseReady,
  initialOrganizations,
}: AdminDashboardProps) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const active = useMemo(
    () => organizations.filter((item) => item.status !== "ARCHIVED"),
    [organizations],
  );
  const archived = useMemo(
    () => organizations.filter((item) => item.status === "ARCHIVED"),
    [organizations],
  );

  function openCreate() {
    setEditingId(null);
    setEditorOpen(true);
  }

  function openEdit(organizationId: string) {
    setEditingId(organizationId);
    setEditorOpen(true);
  }

  function upsertOrganization(organization: OrganizationSummary) {
    setOrganizations((current) => {
      const exists = current.some((item) => item.id === organization.id);
      if (!exists) return [organization, ...current];
      return current.map((item) =>
        item.id === organization.id ? organization : item,
      );
    });
  }

  function removeOrganization(organizationId: string) {
    setOrganizations((current) =>
      current.filter((item) => item.id !== organizationId),
    );
  }

  return (
    <div className="space-y-8">
      {!databaseReady ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm">
          <Building2 className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="font-medium text-amber-200">MongoDB pendiente</p>
            <p className="mt-1 text-amber-100/70">
              Configura MONGODB_URI para guardar organizaciones.
            </p>
          </div>
        </div>
      ) : null}

      <section>
        <div className="mb-5">
          <h2 className="text-xl font-semibold">Organizaciones</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea, edita y asigna OrgAdmins. Entra solo a organizaciones activas.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((organization) => (
            <OrganizationCard
              key={organization.id}
              organization={organization}
              onEdit={() => openEdit(organization.id)}
            />
          ))}

          <button
            type="button"
            disabled={!databaseReady}
            onClick={openCreate}
            className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-transparent text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex size-12 items-center justify-center rounded-full border border-dashed">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-medium">Nueva organización</span>
          </button>
        </div>
      </section>

      {archived.length ? (
        <section>
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Archivo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Organizaciones archivadas: solo consulta y desarchivar.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {archived.map((organization) => (
              <OrganizationCard
                key={organization.id}
                organization={organization}
                archived
                onEdit={() => openEdit(organization.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <OrganizationEditorDialog
        open={editorOpen}
        organizationId={editingId}
        onOpenChange={setEditorOpen}
        onSaved={(organization, options) => {
          upsertOrganization(organization);
          if (options?.continueEditing) {
            setEditingId(organization.id);
          }
        }}
        onDeleted={removeOrganization}
      />
    </div>
  );
}

function OrganizationCard({
  organization,
  archived = false,
  onEdit,
}: {
  organization: OrganizationSummary;
  archived?: boolean;
  onEdit: () => void;
}) {
  return (
    <Card className={archived ? "opacity-80" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <Badge variant="outline">{archived ? "Archivada" : "Activa"}</Badge>
        </div>
        <CardTitle className="pt-3">{organization.name}</CardTitle>
        <CardDescription>
          {organization.description || "Sin descripción"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {archived ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="h-12 w-[20%] min-w-14 border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 hover:text-amber-50"
              onClick={onEdit}
              aria-label="Ver o desarchivar organización"
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
              <Link
                href={`/organizations/${organization.id}`}
                aria-label="Entrar a la organización"
              >
                <LogIn className="size-5" />
              </Link>
            </Button>
            <Button
              className="h-12 w-[20%] border-sky-500/40 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30 hover:text-sky-50"
              variant="outline"
              onClick={onEdit}
              aria-label="Editar organización"
            >
              <Pencil className="size-5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrganizationEditorDialog({
  open,
  organizationId,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  organizationId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (
    organization: OrganizationSummary,
    options?: { continueEditing?: boolean },
  ) => void;
  onDeleted: (organizationId: string) => void;
}) {
  const isCreate = !organizationId;
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [usage, setUsage] = useState<OrganizationUsage | null>(null);
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const archived = status === "ARCHIVED";

  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError("");
    setDraftName("");
    setDraftEmail("");
    setEditingAdminId(null);

    if (!organizationId) {
      setName("");
      setDescription("");
      setAdmins([]);
      setUsage(null);
      setStatus("ACTIVE");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/organizations/${organizationId}`)
      .then(async (response) => {
        const payload = (await response.json()) as OrganizationDetail & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "No fue posible cargar.");
        }
        if (cancelled) return;
        setName(payload.organization.name);
        setDescription(payload.organization.description);
        setStatus(payload.organization.status);
        setAdmins(payload.admins);
        setUsage(payload.usage);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No fue posible cargar la organización.",
        );
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  async function saveOrganization() {
    setLoading(true);
    setError("");
    try {
      if (isCreate) {
        const response = await fetch("/api/organizations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });
        const payload = (await response.json()) as {
          organization?: OrganizationSummary;
          error?: string;
        };
        if (!response.ok || !payload.organization) {
          setError(payload.error ?? "No fue posible crear la organización.");
          return;
        }
        onSaved(payload.organization, { continueEditing: true });
        setAdmins([]);
        setUsage({
          eventCount: 0,
          adminCount: 0,
          executionCount: 0,
          isEmpty: true,
        });
        setStatus(payload.organization.status);
        return;
      }

      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const payload = (await response.json()) as {
        organization?: OrganizationSummary;
        error?: string;
      };
      if (!response.ok || !payload.organization) {
        setError(payload.error ?? "No fue posible guardar.");
        return;
      }
      onSaved(payload.organization);
      setStatus(payload.organization.status);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  async function setOrganizationStatus(next: "ACTIVE" | "ARCHIVED") {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = (await response.json()) as {
        organization?: OrganizationSummary;
        error?: string;
      };
      if (!response.ok || !payload.organization) {
        setError(payload.error ?? "No fue posible cambiar el estado.");
        return;
      }
      onSaved(payload.organization);
      setStatus(payload.organization.status);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  async function hardDelete() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "No fue posible eliminar.");
        return;
      }
      onDeleted(organizationId);
      onOpenChange(false);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAdmin() {
    if (!organizationId || archived) return;
    setAdminBusy(true);
    setError("");
    const endpoint = editingAdminId
      ? `/api/organizations/${organizationId}/admins/${editingAdminId}`
      : `/api/organizations/${organizationId}/admins`;
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
        setError(payload.error ?? "No fue posible guardar el OrgAdmin.");
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
      setUsage((current) =>
        current
          ? {
              ...current,
              adminCount: editingAdminId
                ? current.adminCount
                : current.adminCount + 1,
            }
          : current,
      );
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function removeAdmin(adminId: string) {
    if (!organizationId || archived) return;
    setAdminBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/admins/${adminId}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "No fue posible eliminar el OrgAdmin.");
        return;
      }
      setAdmins((current) => current.filter((item) => item.id !== adminId));
      if (editingAdminId === adminId) {
        setEditingAdminId(null);
        setDraftName("");
        setDraftEmail("");
      }
      setUsage((current) =>
        current
          ? { ...current, adminCount: Math.max(0, current.adminCount - 1) }
          : current,
      );
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
              ? "Nueva organización"
              : archived
                ? "Organización archivada"
                : "Editar organización"}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Define título y descripción. Al crear, podrás asignar OrgAdmins enseguida."
              : archived
                ? "Solo lectura. Desarchiva para volver a usarla."
                : "Título, descripción y OrgAdmins de esta organización."}
          </DialogDescription>
        </DialogHeader>

        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="org-name">Título</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={archived}
                  required
                  minLength={2}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="org-description">Descripción</Label>
                <Input
                  id="org-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={archived}
                />
              </div>
            </div>

            {!isCreate ? (
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">OrgAdmins</h3>
                    <p className="text-xs text-muted-foreground">
                      Pueden administrar la organización y crear eventos.
                    </p>
                  </div>
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
                                disabled={archived || adminBusy}
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
                                disabled={archived || adminBusy}
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
                            Aún no hay OrgAdmins.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                {!archived ? (
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
                    Contenido: {usage.eventCount} eventos ·{" "}
                    {usage.executionCount} ejecuciones · {usage.adminCount}{" "}
                    OrgAdmins
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
            {!isCreate && !archived ? (
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setOrganizationStatus("ARCHIVED")}
              >
                <Archive className="size-4" />
                Archivar
              </Button>
            ) : null}
            {!isCreate && archived ? (
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setOrganizationStatus("ACTIVE")}
              >
                <ArchiveRestore className="size-4" />
                Desarchivar
              </Button>
            ) : null}
            {!isCreate ? (
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
                    <AlertDialogTitle>¿Eliminar definitivamente?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Solo disponible si no hay eventos ni ejecuciones. Esta
                      acción no se puede deshacer.
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
            {!archived ? (
              <Button
                type="button"
                disabled={loading || detailLoading || name.trim().length < 2}
                onClick={saveOrganization}
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
