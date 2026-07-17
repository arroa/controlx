"use client";

import {
  ArrowRight,
  Building2,
  CirclePlus,
  Database,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
import type { OrganizationSummary } from "@/lib/admin-data";

type AdminDashboardProps = {
  databaseReady: boolean;
  initialOrganizations: OrganizationSummary[];
};

export function AdminDashboard({
  databaseReady,
  initialOrganizations,
}: AdminDashboardProps) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-8">
      {!databaseReady ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm">
          <Database className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="font-medium text-amber-200">MongoDB pendiente</p>
            <p className="mt-1 text-amber-100/70">
              Configura MONGODB_URI para guardar organizaciones.
            </p>
          </div>
        </div>
      ) : null}

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Organizaciones</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Entra a una organización para administrar sus responsables y
              eventos.
            </p>
          </div>
          <OrganizationDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            disabled={!databaseReady}
            onCreated={(organization) =>
              setOrganizations((current) => [organization, ...current])
            }
          />
        </div>

        {organizations.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {organizations.map((organization) => (
              <Card key={organization.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="size-5" />
                    </div>
                    <Badge variant="outline">Activa</Badge>
                  </div>
                  <CardTitle className="pt-3">{organization.name}</CardTitle>
                  <CardDescription>
                    {organization.description || "Sin descripción"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/organizations/${organization.id}`}>
                      Entrar a la organización
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Building2 className="size-5" />
              </div>
              <p className="font-medium">Aún no hay organizaciones</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Crea la primera organización. Luego podrás entrar, asignar
                OrgAdmins y crear sus eventos.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function OrganizationDialog({
  open,
  onOpenChange,
  disabled,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  onCreated: (organization: OrganizationSummary) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
        }),
      });
      const payload = (await response.json()) as {
        organization?: OrganizationSummary;
        error?: string;
      };
      if (!response.ok || !payload.organization) {
        setError(payload.error ?? "No fue posible crear la organización.");
        return;
      }

      onCreated(payload.organization);
      onOpenChange(false);
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <CirclePlus className="size-4" />
          Crear organización
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva organización</DialogTitle>
          <DialogDescription>
            Primero crea la organización; después asignarás sus OrgAdmins.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="organization-name">Nombre</Label>
            <Input id="organization-name" name="name" required minLength={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="organization-description">Descripción</Label>
            <Input id="organization-description" name="description" />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {loading ? "Creando…" : "Crear organización"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
