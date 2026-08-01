"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareText,
  Newspaper,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ControlXGuideChat,
  GUIDE_ASSISTANT_NAME,
} from "@/components/controlx-guide-chat";
import { XavierAvatar } from "@/components/xavier-avatar";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { resolveGuideContext } from "@/lib/ai/guide-route-context";
import { cn } from "@/lib/utils";

type AppNavSheetProps = {
  email: string;
  roleLabel: string;
  isSuperAdmin: boolean;
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

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={cn(
        "h-11 w-full justify-start gap-3 px-3 text-sm font-medium",
        active && "bg-primary/15 text-foreground",
      )}
      asChild
    >
      <Link href={href} onClick={onNavigate}>
        <Icon className="size-4 shrink-0 opacity-80" />
        {label}
      </Link>
    </Button>
  );
}

function AppNavSheetShell({
  email,
  roleLabel,
  isSuperAdmin,
  leaving,
  farewellOpen,
  onFarewellOpenChange,
  onRequestSignOut,
  onConfirmSignOut,
}: {
  email: string;
  roleLabel: string;
  isSuperAdmin: boolean;
  leaving: boolean;
  farewellOpen: boolean;
  onFarewellOpenChange: (open: boolean) => void;
  onRequestSignOut: () => void;
  onConfirmSignOut: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const guide = useMemo(() => resolveGuideContext(pathname), [pathname]);

  const links = [
    {
      href: "/ejecuciones",
      label: "Ejecuciones",
      icon: ListChecks,
      show: true,
    },
    {
      href: "/dashboard",
      label: "Administración",
      icon: LayoutDashboard,
      show: isSuperAdmin,
    },
    {
      href: "/novedades",
      label: "Novedades",
      icon: Newspaper,
      show: true,
    },
    {
      href: "/feedback",
      label: "Mejoras",
      icon: MessageSquareText,
      show: true,
    },
    {
      href: "/admin/ai-audit",
      label: "Auditoría IA",
      icon: ScrollText,
      show: isSuperAdmin,
    },
  ].filter((item) => item.show);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[min(100%,20rem)] gap-0 p-0">
          <SheetHeader className="border-b pr-12">
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary"
                aria-hidden
              >
                {initialsFromEmail(email)}
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-sm">{email}</SheetTitle>
                <SheetDescription className="text-xs text-primary">
                  {roleLabel}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <nav className="flex flex-1 flex-col gap-1 p-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setGuideOpen(true);
              }}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-3 text-left transition hover:bg-primary/15"
            >
              <XavierAvatar sizeClassName="size-9" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight">
                  {GUIDE_ASSISTANT_NAME}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Asistente de IA
                </span>
              </span>
            </button>

            {links.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`)
                }
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>

          <SheetFooter className="border-t">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3"
              disabled={leaving}
              onClick={() => {
                setOpen(false);
                onRequestSignOut();
              }}
            >
              <LogOut className="size-4" />
              Cerrar sesión
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ControlXGuideChat
        zone={guide.zone}
        organizationId={guide.organizationId}
        eventId={guide.eventId}
        open={guideOpen}
        onOpenChange={setGuideOpen}
      />

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
            <Button type="button" disabled={leaving} onClick={onConfirmSignOut}>
              <LogOut className="size-4" />
              {leaving ? "Saliendo…" : "Salir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BypassAppNavSheet({
  email,
  roleLabel,
  isSuperAdmin,
}: Omit<AppNavSheetProps, "bypassEnabled">) {
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
    <AppNavSheetShell
      email={email}
      roleLabel={roleLabel}
      isSuperAdmin={isSuperAdmin}
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

function ClerkAppNavSheet({
  email,
  roleLabel,
  isSuperAdmin,
}: Omit<AppNavSheetProps, "bypassEnabled">) {
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
    <AppNavSheetShell
      email={email}
      roleLabel={roleLabel}
      isSuperAdmin={isSuperAdmin}
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

export function AppNavSheet({
  email,
  roleLabel,
  isSuperAdmin,
  bypassEnabled = false,
}: AppNavSheetProps) {
  if (bypassEnabled) {
    return (
      <BypassAppNavSheet
        email={email}
        roleLabel={roleLabel}
        isSuperAdmin={isSuperAdmin}
      />
    );
  }
  return (
    <ClerkAppNavSheet
      email={email}
      roleLabel={roleLabel}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
