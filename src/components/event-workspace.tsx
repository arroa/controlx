"use client";

import {
  Boxes,
  CalendarClock,
  PencilRuler,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EventReadinessBoard } from "@/components/event-readiness-board";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EventSummary } from "@/lib/admin-data";
import type { EventReadiness } from "@/lib/event-readiness-types";

export function EventWorkspace({
  event,
  readiness: initialReadiness,
  readOnly = false,
}: {
  event: EventSummary;
  readiness: EventReadiness;
  readOnly?: boolean;
}) {
  const [readiness, setReadiness] = useState(initialReadiness);

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Preparación del evento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {readOnly
              ? "Consulta en solo lectura mientras el evento esté archivado."
              : "Setup, diseño, roles y planificador."}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PreparationCard
            number="1"
            title="Setup"
            description="Actores, Día D, workstreams y bloques."
            href={`/events/${event.id}/setup`}
            icon={Boxes}
            readOnly={readOnly}
          />
          <PreparationCard
            number="2"
            title="Diseño"
            description="Actividades y pasos por workstream y bloque."
            href={`/events/${event.id}/design`}
            icon={PencilRuler}
            readOnly={readOnly}
          />
          <PreparationCard
            number="3"
            title="Roles"
            description="Asigna ejecutores y aprobadores a los pasos."
            href={`/events/${event.id}/roles`}
            icon={UsersRound}
            readOnly={readOnly}
          />
          <PreparationCard
            number="4"
            title="Planificador"
            description="Horarios y dependencias entre pasos."
            href={`/events/${event.id}/plan`}
            icon={CalendarClock}
            readOnly={readOnly}
          />
        </div>
      </section>

      {!readOnly ? (
        <EventReadinessBoard
          readiness={readiness}
          onReadinessChange={setReadiness}
        />
      ) : null}
    </div>
  );
}

function PreparationCard({
  number,
  title,
  description,
  href,
  icon: Icon,
  readOnly = false,
}: {
  number: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  readOnly?: boolean;
}) {
  return (
    <Card
      className={
        readOnly
          ? "flex h-full flex-col opacity-80"
          : "flex h-full flex-col"
      }
    >
      <CardHeader className="flex-1">
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {number}/4
          </span>
        </div>
        <CardTitle className="pt-2">{title}</CardTitle>
        <CardDescription className="min-h-[2.5rem] line-clamp-2">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto pt-0">
        {readOnly ? (
          <Button variant="outline" className="w-full" disabled>
            Solo lectura
          </Button>
        ) : (
          <Button variant="outline" className="w-full" asChild>
            <Link href={href}>Abrir {title.toLowerCase()}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
