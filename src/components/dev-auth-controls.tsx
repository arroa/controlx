"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DevAuthControlsProps = {
  userId: string | null;
};

export function DevAuthControls({ userId }: DevAuthControlsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/dev-logout", { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!userId) {
    return (
      <>
        <Badge
          variant="outline"
          className="hidden border-amber-400/30 bg-amber-400/10 text-amber-200 md:flex"
        >
          Dev bypass
        </Badge>
        <Button size="sm" onClick={() => router.push("/sign-in")}>
          Entrar (dev)
        </Button>
      </>
    );
  }

  return (
    <>
      <Badge
        variant="outline"
        className="hidden max-w-[180px] truncate border-amber-400/30 bg-amber-400/10 text-amber-200 md:flex"
      >
        {userId.replace(/^dev:/, "")}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        disabled={loading}
        onClick={handleLogout}
      >
        Salir
      </Button>
    </>
  );
}
