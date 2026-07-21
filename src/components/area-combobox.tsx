"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";

type AreaComboboxProps = {
  value: string;
  areas: string[];
  onValueChange: (value: string) => void;
  onAreaCreated?: (area: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

function normalizeArea(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function AreaCombobox({
  value,
  areas,
  onValueChange,
  onAreaCreated,
  placeholder = "Área",
  disabled,
  className,
  id,
}: AreaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const unique = new Set<string>();
    for (const area of areas) {
      const normalized = normalizeArea(area);
      if (normalized) unique.add(normalized);
    }
    if (value.trim()) unique.add(normalizeArea(value));
    return [...unique].sort((a, b) => a.localeCompare(b, "es"));
  }, [areas, value]);

  const needle = normalizeArea(search);
  const filtered = needle
    ? options.filter((area) =>
        area.toLowerCase().includes(needle.toLowerCase()),
      )
    : options;
  const canCreate =
    Boolean(needle) &&
    !options.some((area) => area.toLowerCase() === needle.toLowerCase());

  function selectArea(next: string) {
    const normalized = normalizeArea(next);
    if (!normalized) return;
    if (!options.some((area) => area.toLowerCase() === normalized.toLowerCase())) {
      onAreaCreated?.(normalized);
    }
    onValueChange(normalized);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between px-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar o crear área…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {canCreate ? "Enter para crear." : "Sin áreas."}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((area) => (
                <CommandItem
                  key={area}
                  value={area}
                  onSelect={() => selectArea(area)}
                >
                  {area}
                </CommandItem>
              ))}
              {canCreate ? (
                <CommandItem
                  value={`__create__${needle}`}
                  onSelect={() => selectArea(needle)}
                >
                  <Plus className="size-3.5" />
                  Crear “{needle}”
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
