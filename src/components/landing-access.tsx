"use client";

import { SignIn } from "@clerk/nextjs";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

type LandingAccessProps = {
  bypassEnabled: boolean;
  isAuthenticated: boolean;
  destination: string;
};

export function LandingAccess({
  bypassEnabled,
  isAuthenticated,
  destination,
}: LandingAccessProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return (
      <Button size="lg" onClick={() => router.push(destination)}>
        Ir al sistema
        <ArrowRight className="size-4" />
      </Button>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        destination?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "No fue posible ingresar.");
        return;
      }

      router.push(payload?.destination ?? "/dashboard");
      router.refresh();
    } catch {
      setError("No fue posible conectar con ControlX.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg">
          Ingresar al sistema
          <ArrowRight className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {bypassEnabled ? (
          <>
            <DialogHeader>
              <DialogTitle>Ingresar a ControlX</DialogTitle>
              <DialogDescription>
                Acceso beta habilitado para usuarios autorizados.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="access-email">Correo electrónico</Label>
                <Input
                  id="access-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@empresa.com"
                />
              </div>
              {error ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300"
                >
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Validando…
                  </>
                ) : (
                  "Continuar"
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                ControlX Beta · Acceso administrado
              </p>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Ingresar a ControlX</DialogTitle>
              <DialogDescription>
                Autenticación segura administrada por Clerk.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center">
              <SignIn routing="hash" />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
