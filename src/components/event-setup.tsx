"use client";

import {
  Boxes,
  CirclePlus,
  Layers3,
  LoaderCircle,
  Pencil,
  Trash2,
} from "lucide-react";
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
import type { BlockSummary, WorkstreamSummary } from "@/lib/admin-data";

type CatalogKind = "workstream" | "block";
type CatalogItem = WorkstreamSummary | BlockSummary;

export function EventSetup({
  eventId,
  initialWorkstreams,
  initialBlocks,
}: {
  eventId: string;
  initialWorkstreams: WorkstreamSummary[];
  initialBlocks: BlockSummary[];
}) {
  const [workstreams, setWorkstreams] = useState(initialWorkstreams);
  const [blocks, setBlocks] = useState(initialBlocks);

  return (
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
