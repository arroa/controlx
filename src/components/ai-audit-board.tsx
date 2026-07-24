"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AiGuideAuditItem } from "@/lib/ai/guide-audit-types";
import { GUIDE_ZONE_LABELS } from "@/lib/ai/guide-zones";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<AiGuideAuditItem["status"], string> = {
  ok: "OK",
  rate_limited: "Rate limit",
  rejected: "Rechazado",
  error: "Error",
};

function statusClass(status: AiGuideAuditItem["status"]) {
  switch (status) {
    case "ok":
      return "border-emerald-500/30 text-emerald-700 dark:text-emerald-300";
    case "rate_limited":
      return "border-amber-500/30 text-amber-700 dark:text-amber-300";
    case "rejected":
      return "border-orange-500/30 text-orange-700 dark:text-orange-300";
    case "error":
      return "border-destructive/40 text-destructive";
  }
}

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AiAuditBoard({
  initialItems,
}: {
  initialItems: AiGuideAuditItem[];
}) {
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return initialItems;
    return initialItems.filter((item) => {
      const haystack = [
        item.userEmail,
        item.userMessage,
        item.assistantPreview ?? "",
        item.blockedReason ?? "",
        item.zone,
        item.eventId ?? "",
        item.organizationId ?? "",
        item.toolNames.join(" "),
        item.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [initialItems, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} registro{items.length === 1 ? "" : "s"}
          {query.trim() ? " (filtrados)" : ""}
        </p>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por email, mensaje, zona…"
          className="sm:max-w-sm"
        />
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Cuándo</TableHead>
              <TableHead className="w-[100px]">Estado</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead>Pregunta</TableHead>
              <TableHead>Tools</TableHead>
              <TableHead className="w-[90px]">Tokens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin registros de auditoría todavía.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatWhen(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs", statusClass(item.status))}
                    >
                      {STATUS_LABEL[item.status]}
                    </Badge>
                    {item.blockedReason ? (
                      <p className="mt-1 max-w-[140px] text-[11px] leading-snug text-muted-foreground">
                        {item.blockedReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{item.userEmail}</div>
                    {item.eventId ? (
                      <div className="mt-1 text-muted-foreground">
                        event · {item.eventId.slice(-6)}
                      </div>
                    ) : item.organizationId ? (
                      <div className="mt-1 text-muted-foreground">
                        org · {item.organizationId.slice(-6)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {GUIDE_ZONE_LABELS[item.zone] ?? item.zone}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <p className="text-xs whitespace-pre-wrap">
                      {item.userMessage}
                    </p>
                    {item.assistantPreview ? (
                      <p className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
                        → {item.assistantPreview}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.toolNames.length
                      ? item.toolNames.join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.totalTokens ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
