"use client";

import { CalendarIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import { es } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MINUTE_STEP = 5;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function roundToStep(minute: number) {
  return Math.min(55, Math.round(minute / MINUTE_STEP) * MINUTE_STEP);
}

/** Lee fecha/hora civil en una TZ a partir de un ISO. */
export function zonedPartsFromIso(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    hour: Number(value.hour),
    minute: Number(value.minute),
  };
}

export function toZonedInput(iso: string, timezone: string) {
  const p = zonedPartsFromIso(iso, timezone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function zonedInputToIso(value: string, timezone: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = desiredUtc;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const zoned = Object.fromEntries(
      parts.map((part) => [part.type, Number(part.value)]),
    );
    const asUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
    );
    instant += desiredUtc - asUtc;
  }

  return new Date(instant).toISOString();
}

function formatDisplay(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function calendarDateFromParts(parts: {
  year: number;
  month: number;
  day: number;
}) {
  return new Date(parts.year, parts.month - 1, parts.day);
}

type DateTimePickerProps = {
  value: string | null;
  timezone: string;
  onChange: (iso: string | null) => void;
  /** Si se define, se llama al confirmar (botón principal) con el valor actual. */
  onConfirm?: (iso: string | null) => void | Promise<void>;
  confirmLabel?: string;
  confirming?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function DateTimePicker({
  value,
  timezone,
  onChange,
  onConfirm,
  confirmLabel = "Listo",
  confirming = false,
  placeholder = "Elegir fecha y hora",
  className,
  disabled,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const parts = useMemo(
    () => (value ? zonedPartsFromIso(value, timezone) : null),
    [value, timezone],
  );

  const selectedDate = parts ? calendarDateFromParts(parts) : undefined;
  const hour = parts?.hour ?? 9;
  const minute = parts ? roundToStep(parts.minute) : 0;

  function commit(next: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }) {
    const local = `${next.year}-${pad(next.month)}-${pad(next.day)}T${pad(next.hour)}:${pad(next.minute)}`;
    onChange(zonedInputToIso(local, timezone));
  }

  function handleSelectDay(date: Date | undefined) {
    if (!date) return;
    commit({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour,
      minute,
    });
  }

  function handleHour(nextHour: string) {
    const base = parts ?? {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      day: new Date().getDate(),
      hour: 9,
      minute: 0,
    };
    commit({ ...base, hour: Number(nextHour), minute });
  }

  function handleMinute(nextMinute: string) {
    const base = parts ?? {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      day: new Date().getDate(),
      hour: 9,
      minute: 0,
    };
    commit({ ...base, hour, minute: Number(nextMinute) });
  }

  async function handleConfirm() {
    if (onConfirm) {
      try {
        await onConfirm(value);
        setOpen(false);
      } catch {
        // El padre muestra el error; la modal permanece abierta.
      }
      return;
    }
    setOpen(false);
  }

  async function handleClear() {
    onChange(null);
    if (onConfirm) {
      try {
        await onConfirm(null);
        setOpen(false);
      } catch {
        // El padre muestra el error; la modal permanece abierta.
      }
      return;
    }
    setOpen(false);
  }

  const hours = Array.from({ length: 24 }, (_, index) => index);
  const minutes = Array.from(
    { length: 60 / MINUTE_STEP },
    (_, index) => index * MINUTE_STEP,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || confirming}
          className={cn(
            "h-8 w-full justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 opacity-70" />
          <span className="truncate">
            {value ? formatDisplay(value, timezone) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto overflow-hidden p-0"
        sideOffset={6}
      >
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            locale={es}
            selected={selectedDate}
            onSelect={handleSelectDay}
            defaultMonth={selectedDate}
            className="border-b sm:border-r sm:border-b-0"
          />
          <div className="flex w-full flex-col gap-3 p-3 sm:w-40">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Hora
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Select value={String(hour)} onValueChange={handleHour}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="HH" />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((item) => (
                      <SelectItem key={item} value={String(item)}>
                        {pad(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(minute)} onValueChange={handleMinute}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="MM" />
                  </SelectTrigger>
                  <SelectContent>
                    {minutes.map((item) => (
                      <SelectItem key={item} value={String(item)}>
                        {pad(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Minutos cada {MINUTE_STEP} · TZ {timezone}
              </p>
            </div>

            <div className="mt-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1"
                disabled={!value || confirming}
                onClick={() => void handleClear()}
              >
                <X className="size-3.5" />
                Borrar
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={confirming || (Boolean(onConfirm) && !value)}
                onClick={() => void handleConfirm()}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
