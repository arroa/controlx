"use client";

import { ChevronsUpDown, MapPin } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { timezoneOptions } from "@/lib/timezones";

type TimezoneComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
};

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function scoreTimezoneMatch(
  optionValue: string,
  search: string,
  keywords: string[] = [],
): number {
  const needle = normalizeSearch(search);
  if (!needle) return 1;

  const haystack = normalizeSearch([optionValue, ...keywords].join(" "));
  if (!haystack.includes(needle)) {
    return 0;
  }

  // Prioriza coincidencias al inicio de ciudad/país/IANA.
  if (haystack.startsWith(needle)) return 1;
  if (normalizeSearch(optionValue).includes(needle)) return 0.9;
  return 0.75;
}

export function TimezoneCombobox({
  value,
  onValueChange,
  id,
}: TimezoneComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => timezoneOptions.find((timezone) => timezone.value === value),
    [value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto min-h-10 w-full justify-between px-3 py-2 font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2 text-left">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate">{selected.label}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {selected.value} · {selected.offset}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Selecciona una zona horaria
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(420px,var(--radix-popover-trigger-width))] p-0"
        align="start"
      >
        <Command filter={scoreTimezoneMatch} shouldFilter>
          <CommandInput placeholder="Busca ciudad, país, GMT o zona…" />
          <CommandList>
            <CommandEmpty>No encontramos esa zona horaria.</CommandEmpty>
            <CommandGroup heading="Zonas horarias">
              {timezoneOptions.map((timezone) => (
                <CommandItem
                  key={timezone.value}
                  value={`${timezone.label} ${timezone.value}`}
                  keywords={timezone.keywords}
                  data-checked={value === timezone.value}
                  onSelect={() => {
                    onValueChange(timezone.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{timezone.label}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {timezone.value}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {timezone.offset}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
