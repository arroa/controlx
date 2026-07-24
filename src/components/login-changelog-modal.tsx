"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  hasReleaseNotes,
  RELEASE_NOTES,
  RELEASE_NOTES_STORAGE_KEY,
} from "@/lib/release-notes";

export function LoginChangelogModal() {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dontShowAgainRef = useRef(false);

  useEffect(() => {
    if (!hasReleaseNotes()) return;
    try {
      if (window.localStorage.getItem(RELEASE_NOTES_STORAGE_KEY) === "1") {
        return;
      }
    } catch {
      // localStorage blocked — still show once per session via state
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    dontShowAgainRef.current = dontShowAgain;
  }, [dontShowAgain]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (dontShowAgainRef.current) {
        try {
          window.localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, "1");
        } catch {
          // ignore
        }
      }
      setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!hasReleaseNotes()) return null;

  function persistIfNeeded() {
    if (!dontShowAgainRef.current) return;
    try {
      window.localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }

  function dismiss() {
    persistIfNeeded();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          return;
        }
        dismiss();
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
