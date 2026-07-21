"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

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
  RELEASE_NOTES,
  RELEASE_NOTES_STORAGE_KEY,
} from "@/lib/release-notes";

export function LoginChangelogModal() {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(RELEASE_NOTES_STORAGE_KEY) === "1") {
        return;
      }
    } catch {
      // localStorage blocked — still show once per session via state
    }
    setOpen(true);
  }, []);

  function dismiss() {
    if (dontShowAgain) {
      try {
        window.localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, "1");
      } catch {
        // ignore
      }
    }
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else setOpen(true);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            {RELEASE_NOTES.title}
          </DialogTitle>
          <DialogDescription>{RELEASE_NOTES.summary}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {RELEASE_NOTES.items.map((item) => (
            <li
              key={item.title}
              className="rounded-lg border bg-muted/30 px-3 py-2.5"
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col gap-3 sm:flex-col">
          <label className="flex cursor-pointer items-center gap-2 self-start text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
            />
            <span>No volver a ver este aviso</span>
          </label>
          <Button type="button" className="w-full" onClick={dismiss}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
