"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CirclePlus,
  Download,
  Eye,
  LoaderCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { downloadFeedbackExcel } from "@/lib/feedback-export";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  feedbackStatusNoteHint,
  feedbackStatusNoteLabel,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/feedback-types";
import { cn } from "@/lib/utils";

type StatusFilter = "ALL" | FeedbackStatus;
type SortKey = "createdAt" | "statusChangedAt";
type SortDir = "asc" | "desc";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function previewMessage(message: string, max = 72) {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function statusBadgeVariant(status: FeedbackStatus) {
  if (status === "IMPLEMENTED") return "secondary" as const;
  if (status === "DISCARDED") return "destructive" as const;
  return "outline" as const;
}

export function FeedbackBoard({
  initialItems,
  viewer,
}: {
  initialItems: FeedbackItem[];
  viewer: {
    id: string;
    email: string;
    canModerate: boolean;
  };
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("statusChangedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const visible = useMemo(() => {
    const filtered =
      statusFilter === "ALL"
        ? items
        : items.filter((item) => item.status === statusFilter);

    return [...filtered].sort((a, b) => {
      const factor = sortDir === "asc" ? 1 : -1;
      return (
        (new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime()) *
        factor
      );
    });
  }, [items, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  }

  function canMutate(item: FeedbackItem) {
    if (viewer.canModerate) return true;
    if (item.authorId && item.authorId === viewer.id) return true;
    return item.authorEmail.toLowerCase() === viewer.email.toLowerCase();
  }

  function upsertItem(item: FeedbackItem) {
    setItems((current) => {
      const exists = current.some((row) => row.id === item.id);
      if (exists) {
        return current.map((row) => (row.id === item.id ? item : row));
      }
      return [item, ...current];
    });
    router.refresh();
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((row) => row.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Comentarios</h2>
          <p className="text-sm text-muted-foreground">
            {viewer.canModerate
              ? "Moderación · ves todos los comentarios"
              : "Solo tus comentarios · puedes editar o borrar los tuyos"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="w-[11.5rem]" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              {FEEDBACK_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {FEEDBACK_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline">{visible.length}</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!visible.length}
            onClick={() => downloadFeedbackExcel(visible)}
          >
            <Download className="size-4" />
            Excel
          </Button>
          <FeedbackFormDialog
            mode="create"
            onSaved={upsertItem}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[34%]">Comentario</TableHead>
              <TableHead className="w-[12%]">Estado</TableHead>
              <TableHead className="w-[18%]">Autor</TableHead>
              <SortableHead
                label="Creada"
                active={sortKey === "createdAt"}
                dir={sortDir}
                onClick={() => toggleSort("createdAt")}
                className="w-[14%]"
              />
              <SortableHead
                label="Último estado"
                active={sortKey === "statusChangedAt"}
                dir={sortDir}
                onClick={() => toggleSort("statusChangedAt")}
                className="w-[14%]"
              />
              <TableHead className="w-[8%] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-0 font-medium">
                    <span className="block truncate" title={item.message}>
                      {previewMessage(item.message)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(item.status)}>
                      {FEEDBACK_STATUS_LABELS[item.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <span className="block truncate text-muted-foreground">
                      {item.authorEmail}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatWhen(item.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatWhen(item.statusChangedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <FeedbackViewDialog item={item} />
                      {canMutate(item) ? (
                        <>
                          <FeedbackFormDialog
                            mode="edit"
                            item={item}
                            onSaved={upsertItem}
                          />
                          <FeedbackDeleteButton
                            item={item}
                            onDeleted={() => removeItem(item.id)}
                          />
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {items.length
                    ? "Ningún comentario coincide con el filtro."
                    : "Todavía no hay comentarios."}
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

function FeedbackViewDialog({ item }: { item: FeedbackItem }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Ver">
          <Eye className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle del comentario</DialogTitle>
          <DialogDescription>
            {item.authorEmail} · creada {formatWhen(item.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(item.status)}>
              {FEEDBACK_STATUS_LABELS[item.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Último estado: {formatWhen(item.statusChangedAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-6">
            {item.message}
          </p>
          {item.statusNote ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {feedbackStatusNoteLabel(item.status)}
              </p>
              <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-6">
                {item.statusNote}
              </p>
            </div>
          ) : null}
          {item.updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Actualizado: {formatWhen(item.updatedAt)}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackFormDialog({
  mode,
  item,
  onSaved,
}: {
  mode: "create" | "edit";
  item?: FeedbackItem;
  onSaved: (item: FeedbackItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(item?.message ?? "");
  const [status, setStatus] = useState<FeedbackStatus>(item?.status ?? "OPEN");
  const [statusNote, setStatusNote] = useState(item?.statusNote ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const needsNote = status !== "OPEN";

  function resetForm() {
    setMessage(item?.message ?? "");
    setStatus(item?.status ?? "OPEN");
    setStatusNote(item?.statusNote ?? "");
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(
        mode === "create" ? "/api/feedback" : `/api/feedback/${item!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, status, statusNote }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        item?: FeedbackItem;
      } | null;

      if (!response.ok || !payload?.item) {
        setError(payload?.error ?? "No fue posible guardar.");
        return;
      }

      onSaved(payload.item);
      setOpen(false);
      if (mode === "create") {
        setMessage("");
        setStatus("OPEN");
        setStatusNote("");
      }
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm">
            <CirclePlus className="size-4" />
            Nuevo
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Editar"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nuevo comentario" : "Editar comentario"}
          </DialogTitle>
          <DialogDescription>
            Describe la mejora, bug o idea y elige un estado.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`feedback-message-${mode}-${item?.id ?? "new"}`}>
              Comentario
            </Label>
            <Textarea
              id={`feedback-message-${mode}-${item?.id ?? "new"}`}
              required
              minLength={5}
              maxLength={4000}
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ideas, bugs, dudas de UX, prioridades…"
            />
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as FeedbackStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {FEEDBACK_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsNote ? (
            <div className="space-y-2">
              <Label htmlFor={`feedback-note-${mode}-${item?.id ?? "new"}`}>
                {feedbackStatusNoteLabel(status)}
              </Label>
              <Textarea
                id={`feedback-note-${mode}-${item?.id ?? "new"}`}
                required
                minLength={5}
                maxLength={4000}
                rows={3}
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                placeholder={feedbackStatusNoteHint(status)}
              />
            </div>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                message.trim().length < 5 ||
                (needsNote && statusNote.trim().length < 5)
              }
            >
              {loading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : mode === "create" ? (
                "Crear"
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackDeleteButton({
  item,
  onDeleted,
}: {
  item: FeedbackItem;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/feedback/${item.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setError(payload?.error ?? "No fue posible eliminar.");
        return;
      }
      onDeleted();
      setOpen(false);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label="Eliminar"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar comentario</AlertDialogTitle>
          <AlertDialogDescription>
            Se borrará de forma permanente. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {previewMessage(item.message, 120)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {loading ? "Eliminando…" : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
