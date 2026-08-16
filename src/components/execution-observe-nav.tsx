import Link from "next/link";
import { Activity, Eye, Map } from "lucide-react";

import { Button } from "@/components/ui/button";

type ObserveView = "panel" | "monitor" | "mapa";

export function ExecutionObserveNav({
  eventId,
  executionId,
  current,
}: {
  eventId: string;
  executionId: string;
  current: ObserveView;
}) {
  const base = `/events/${eventId}/executions/${executionId}`;
  const items = [
    { id: "monitor" as const, href: `${base}/umbral`, label: "Monitor", Icon: Activity },
    { id: "mapa" as const, href: `${base}/mapa`, label: "Mapa General", Icon: Map },
    { id: "panel" as const, href: base, label: "Panel", Icon: Eye },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Button
          key={item.id}
          size="sm"
          variant={current === item.id ? "secondary" : "outline"}
          asChild
        >
          <Link href={item.href}>
            <item.Icon className="size-3.5" />
            {item.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
