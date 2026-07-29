"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuProps = {
  email: string;
  roleLabel: string;
  bypassEnabled?: boolean;
};

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? "U";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function UserMenuShell({
  email,
  roleLabel,
  leaving,
  farewellOpen,
  onFarewellOpenChange,
  onRequestSignOut,
  onConfirmSignOut,
}: {
  email: string;
  roleLabel: string;
  leaving: boolean;
  farewellOpen: boolean;
  onFarewellOpenChange: (open: boolean) => void;
  onRequestSignOut: () => void;
  onConfirmSignOut: () => void;
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20 hover:text-primary"
            aria-label="Menú de usuario"
          >
            {initialsFromEmail(email)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-1 font-normal">
            <p className="truncate text-sm font-medium">{email}</p>
            <p className="text-xs text-primary">{roleLabel}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={leaving}
            onSelect={(event) => {
              // Evita que el menú robe el foco antes del dialog.
              event.preventDefault();
              onRequestSignOut();
            }}
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={farewellOpen} onOpenChange={onFarewellOpenChange}>
        <DialogContent className="sm:max-w-sm" showCloseButton={!leaving}>
          <DialogHeader>
            <DialogTitle>Hasta pronto</DialogTitle>
            <DialogDescription className="text-left leading-relaxed">
              Gracias por operar con ControlX. Cuando vuelvas, tus ejecuciones
              te estarán esperando.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={leaving}
              onClick={() => onFarewellOpenChange(false)}
            >
              Seguir aquí
            </Button>
            <Button
              type="button"
              disabled={leaving}
              onClick={onConfirmSignOut}
            >
              <LogOut className="size-4" />
              {leaving ? "Saliendo…" : "Salir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BypassUserMenu({
  email,
  roleLabel,
}: Omit<UserMenuProps, "bypassEnabled">) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [farewellOpen, setFarewellOpen] = useState(false);

  async function handleSignOut() {
    setLeaving(true);
    try {
      await fetch("/api/auth/dev-logout", { method: "POST" });
      setFarewellOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <UserMenuShell
      email={email}
      roleLabel={roleLabel}
      leaving={leaving}
      farewellOpen={farewellOpen}
      onFarewellOpenChange={setFarewellOpen}
      onRequestSignOut={() => setFarewellOpen(true)}
      onConfirmSignOut={() => {
        void handleSignOut();
      }}
    />
  );
}

function ClerkUserMenu({
  email,
  roleLabel,
}: Omit<UserMenuProps, "bypassEnabled">) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [leaving, setLeaving] = useState(false);
  const [farewellOpen, setFarewellOpen] = useState(false);

  async function handleSignOut() {
    setLeaving(true);
    try {
      await fetch("/api/auth/dev-logout", { method: "POST" });
      if (isSignedIn) {
        await signOut({ redirectUrl: "/" });
        return;
      }
      setFarewellOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <UserMenuShell
      email={email}
      roleLabel={roleLabel}
      leaving={leaving}
      farewellOpen={farewellOpen}
      onFarewellOpenChange={setFarewellOpen}
      onRequestSignOut={() => setFarewellOpen(true)}
      onConfirmSignOut={() => {
        void handleSignOut();
      }}
    />
  );
}

/** Menú propio (estilo Xpaces): iniciales + email + salir. Sin UI de Clerk. */
export function UserMenu({
  email,
  roleLabel,
  bypassEnabled = false,
}: UserMenuProps) {
  if (bypassEnabled) {
    return <BypassUserMenu email={email} roleLabel={roleLabel} />;
  }
  return <ClerkUserMenu email={email} roleLabel={roleLabel} />;
}
