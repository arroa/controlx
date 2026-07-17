"use client";

import { CirclePlus, LoaderCircle, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { AdminSummary } from "@/lib/admin-data";

export function AdminManager({
  title,
  description,
  roleLabel,
  endpoint,
  initialAdmins,
}: {
  title: string;
  description: string;
  roleLabel: "OrgAdmin" | "EventAdmin";
  endpoint: string;
  initialAdmins: AdminSummary[];
}) {
  const [admins, setAdmins] = useState(initialAdmins);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <AdminDialog
          roleLabel={roleLabel}
          endpoint={endpoint}
          onSaved={(admin) =>
            setAdmins((current) =>
              current.some((item) => item.id === admin.id)
                ? current.map((item) => (item.id === admin.id ? admin : item))
                : [...current, admin],
            )
          }
        />
      </div>

      {admins.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {admins.map((admin) => (
            <Card key={admin.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{admin.email}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <AdminDialog
                  roleLabel={roleLabel}
                  endpoint={`${endpoint}/${admin.id}`}
                  admin={admin}
                  onSaved={(updated) =>
                    setAdmins((current) =>
                      current.map((item) =>
                        item.id === updated.id ? updated : item,
                      ),
                    )
                  }
                />
                <RemoveAdmin
                  roleLabel={roleLabel}
                  email={admin.email}
                  endpoint={`${endpoint}/${admin.id}`}
                  onRemoved={() =>
                    setAdmins((current) =>
                      current.filter((item) => item.id !== admin.id),
                    )
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          No hay {roleLabel}s asignados todavía.
        </div>
      )}
    </section>
  );
}

function AdminDialog({
  roleLabel,
  endpoint,
  admin,
  onSaved,
}: {
  roleLabel: string;
  endpoint: string;
  admin?: AdminSummary;
  onSaved: (admin: AdminSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(endpoint, {
      method: admin ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email") }),
    }).catch(() => null);
    const payload = response
      ? ((await response.json()) as { admin?: AdminSummary; error?: string })
      : null;
    if (!response?.ok || !payload?.admin) {
      setError(payload?.error ?? "No fue posible guardar el administrador.");
      setLoading(false);
      return;
    }
    onSaved(payload.admin);
    setOpen(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {admin ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${admin.email}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <CirclePlus className="size-4" />
            Asignar {roleLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {admin ? `Editar ${roleLabel}` : `Asignar ${roleLabel}`}
          </DialogTitle>
          <DialogDescription>
            {admin
              ? "Actualiza el correo de acceso."
              : "Asigna acceso mediante correo electrónico."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`admin-email-${admin?.id ?? "new"}`}>
              Correo electrónico
            </Label>
            <Input
              id={`admin-email-${admin?.id ?? "new"}`}
              name="email"
              type="email"
              defaultValue={admin?.email}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {loading ? "Guardando…" : admin ? "Guardar cambios" : "Asignar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveAdmin({
  roleLabel,
  email,
  endpoint,
  onRemoved,
}: {
  roleLabel: string;
  email: string;
  endpoint: string;
  onRemoved: () => void;
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
      setError(payload?.error ?? "No fue posible quitar el acceso.");
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
          aria-label={`Quitar acceso a ${email}`}
          className="text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar acceso de {roleLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            {email} dejará de tener acceso. La asignación quedará inactiva para
            conservar trazabilidad.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
            disabled={loading}
          >
            {loading ? "Quitando…" : "Quitar acceso"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
