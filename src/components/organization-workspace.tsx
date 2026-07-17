"use client";

import {
  ArrowRight,
  CalendarRange,
  CirclePlus,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AdminManager } from "@/components/admin-manager";
import { TimezoneCombobox } from "@/components/timezone-combobox";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AdminSummary,
  EventSummary,
  OrganizationSummary,
} from "@/lib/admin-data";

export function OrganizationWorkspace({
  organization,
  initialAdmins,
  initialEvents,
}: {
  organization: OrganizationSummary;
  initialAdmins: AdminSummary[];
  initialEvents: EventSummary[];
}) {
  const [events, setEvents] = useState(initialEvents);

  return (
    <div className="space-y-10">
      <AdminManager
        title="OrgAdmins"
        description="Administran esta organización y pueden crear sus eventos."
        roleLabel="OrgAdmin"
        endpoint={`/api/organizations/${organization.id}/admins`}
        initialAdmins={initialAdmins}
      />

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Eventos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Diseños de procesos pertenecientes a {organization.name}.
            </p>
          </div>
          <EventDialog
            organizationId={organization.id}
            onCreated={(event) =>
              setEvents((current) => [event, ...current])
            }
          />
        </div>
        {events.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <Card key={event.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{event.status}</Badge>
                    <Badge variant="secondary">
                      {event.executionCount} ejecuciones
                    </Badge>
                  </div>
                  <CardTitle className="pt-3">{event.name}</CardTitle>
                  <CardDescription>{event.timezone}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/events/${event.id}`}>
                      Entrar al evento
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
              <CalendarRange className="mb-4 size-6 text-muted-foreground" />
              <p className="font-medium">Aún no hay eventos</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Crea un evento dentro de esta organización.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function EventDialog({
  organizationId,
  onCreated,
}: {
  organizationId: string;
  onCreated: (event: EventSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [timezone, setTimezone] = useState("America/Bogota");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/organizations/${organizationId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          timezone,
        }),
      },
    ).catch(() => null);
    const payload = response
      ? ((await response.json()) as { event?: EventSummary; error?: string })
      : null;

    if (!response?.ok || !payload?.event) {
      setError(payload?.error ?? "No fue posible crear el evento.");
      setLoading(false);
      return;
    }
    onCreated(payload.event);
    setOpen(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CirclePlus className="size-4" />
          Crear evento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo evento</DialogTitle>
          <DialogDescription>
            Crea el diseño base. Luego entrarás al evento para configurarlo.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="event-name">Nombre</Label>
            <Input id="event-name" name="name" required minLength={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-description">Descripción</Label>
            <Input id="event-description" name="description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-timezone">Zona horaria</Label>
            <TimezoneCombobox
              id="event-timezone"
              value={timezone}
              onValueChange={setTimezone}
            />
          </div>
          <FormError message={error} />
          <Button className="w-full" disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {loading ? "Creando…" : "Crear evento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormError({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="text-sm text-red-300">
      {message}
    </p>
  ) : null;
}
