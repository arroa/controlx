"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  onSignOut,
}: {
  email: string;
  roleLabel: string;
  leaving: boolean;
  onSignOut: () => void;
}) {
  return (
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
          onSelect={() => {
            onSignOut();
          }}
        >
          <LogOut className="size-4" />
          {leaving ? "Saliendo…" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BypassUserMenu({
  email,
  roleLabel,
}: Omit<UserMenuProps, "bypassEnabled">) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function handleSignOut() {
    setLeaving(true);
    try {
      await fetch("/api/auth/dev-logout", { method: "POST" });
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
      onSignOut={() => {
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

  async function handleSignOut() {
    setLeaving(true);
    try {
      await fetch("/api/auth/dev-logout", { method: "POST" });
      if (isSignedIn) {
        await signOut({ redirectUrl: "/" });
        return;
      }
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
      onSignOut={() => {
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
