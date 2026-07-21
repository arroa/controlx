"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CirclePlus,
  LoaderCircle,
  Pencil,
  PencilRuler,
  Search,
  Shield,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
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
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  NOVEDAD_ICON_LABELS,
  NOVEDAD_ICONS,
  type NovedadIcon,
  type NovedadItem,
} from "@/lib/novedades-types";

type SortKey = "publishedAt" | "title";
type SortDir = "asc" | "desc";

const ICON_MAP: Record<NovedadIcon, LucideIcon> = {
  sparkles: Sparkles,
  users: Users,
  roles: UserCog,
  setup: Wrench,
  planner: CalendarClock,
  fix: PencilRuler,
  shield: Shield,
};

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", { timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(11, 16);
  }
}

function toDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export function NovedadesBoard({
  initialItems,
  canManage,
}: {
  initialItems: NovedadItem[];
  canManage: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? items.filter((item) =>
          `${item.title} ${item.changes}`.toLowerCase().includes(needle),
        )
      : items;

    return [...filtered].sort((a, b) => {
      const factor = sortDir === "asc" ? 1 : -1;
      if (sortKey === "title") {
        return a.title.localeCompare(b.title, "es") * factor;
      }
      return (
        (new Date(a.publishedAt).getTime() -
          new Date(b.publishedAt).getTime()) *
        factor
      );
    });
  }, [items, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "publishedAt" ? "desc" : "asc");
  }

  function upsert(item: NovedadItem) {
    setItems((current) => {
      const exists = current.some((row) => row.id === item.id);
      if (exists) {
        return current.map((row) => (row.id === item.id ? item : row));
      }
      return [item, ...current];
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar novedades…"
            className="h-9 pl-8"
          />
        </div>
        {canManage ? (
          <NovedadDialog mode="create" onSaved={upsert} />
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12"> </TableHead>
              <SortableHead
                label="Fecha"
                active={sortKey === "publishedAt"}
                dir={sortDir}
                onClick={() => toggleSort("publishedAt")}
                className="w-[7.5rem]"
              />
              <TableHead className="w-[5rem]">Hora</TableHead>
              <SortableHead
                label="Cambios"
                active={sortKey === "title"}
                dir={sortDir}
                onClick={() => toggleSort("title")}
              />
              {canManage ? (
                <TableHead className="w-[6rem] text-right">Acciones</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((item) => {
                const Icon = ICON_MAP[item.icon] ?? Sparkles;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="w-12">
                      <div
                        className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
                        title={NOVEDAD_ICON_LABELS[item.icon]}
                      >
                        <Icon className="size-4" />
                      </div>
                    </TableCell>
                    <TableCell className="w-[7.5rem] whitespace-nowrap text-muted-foreground">
                      {formatDate(item.publishedAt)}
                    </TableCell>
                    <TableCell className="w-[5rem] whitespace-nowrap text-muted-foreground">
                      {formatTime(item.publishedAt)}
                    </TableCell>
                    <TableCell className="min-w-[20rem] w-full">
                      <p className="font-medium" title={item.title}>
                        {item.title}
                      </p>
                      <p
                        className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground line-clamp-3"
                        title={item.changes}
                      >
                        {item.changes}
                      </p>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-0.5">
                          <NovedadDialog
                            mode="edit"
                            item={item}
                            onSaved={upsert}
                          />
                          <DeleteNovedad
                            item={item}
                            onDeleted={() =>
                              setItems((current) =>
                                current.filter((row) => row.id !== item.id),
                              )
                            }
                          />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 5 : 4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No hay novedades que coincidan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 opacity-70" />
      </button>
    </TableHead>
  );
}

function NovedadDialog({
  mode,
  item,
  onSaved,
}: {
  mode: "create" | "edit";
  item?: NovedadItem;
  onSaved: (item: NovedadItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(item?.title ?? "");
  const [changes, setChanges] = useState(item?.changes ?? "");
  const [icon, setIcon] = useState<NovedadIcon>(item?.icon ?? "sparkles");
  const [publishedLocal, setPublishedLocal] = useState(
    item ? toDatetimeLocalValue(item.publishedAt) : toDatetimeLocalValue(new Date().toISOString()),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const body = {
      title,
      changes,
      icon,
      publishedAt: fromDatetimeLocalValue(publishedLocal),
    };
    const response = await fetch(
      mode === "create" ? "/api/novedades" : `/api/novedades/${item!.id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as { item?: NovedadItem; error?: string })
      : null;
    setLoading(false);
    if (!response?.ok || !payload?.item) {
      setError(payload?.error ?? "No fue posible guardar.");
      return;
    }
    onSaved(payload.item);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTitle(item?.title ?? "");
          setChanges(item?.changes ?? "");
          setIcon(item?.icon ?? "sparkles");
          setPublishedLocal(
            item
              ? toDatetimeLocalValue(item.publishedAt)
              : toDatetimeLocalValue(new Date().toISOString()),
          );
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button variant="outline">
            <CirclePlus className="size-4" />
            Nueva novedad
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Editar">
            <Pencil className="size-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Publicar novedad" : "Editar novedad"}
          </DialogTitle>
          <DialogDescription>
            Resumen visible para todos los usuarios autenticados.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`nov-title-${mode}`}>Título</Label>
            <Input
              id={`nov-title-${mode}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Icono</Label>
              <Select
                value={icon}
                onValueChange={(value) => setIcon(value as NovedadIcon)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOVEDAD_ICONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {NOVEDAD_ICON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`nov-when-${mode}`}>Fecha y hora</Label>
              <Input
                id={`nov-when-${mode}`}
                type="datetime-local"
                value={publishedLocal}
                onChange={(event) => setPublishedLocal(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`nov-changes-${mode}`}>Cambios</Label>
            <Textarea
              id={`nov-changes-${mode}`}
              value={changes}
              onChange={(event) => setChanges(event.target.value)}
              rows={6}
              placeholder="Una línea por cambio…"
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
            {loading ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteNovedad({
  item,
  onDeleted,
}: {
  item: NovedadItem;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const response = await fetch(`/api/novedades/${item.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setLoading(false);
    if (!response?.ok) return;
    onDeleted();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          aria-label="Eliminar"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar novedad?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quitará “{item.title}” del listado público.
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
            {loading ? "Eliminando…" : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
