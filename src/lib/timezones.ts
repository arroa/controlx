import { rawTimeZones } from "@vvo/tzdb";

export type TimezoneOption = {
  value: string;
  label: string;
  offset: string;
  keywords: string[];
};

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60)
    .toString()
    .padStart(2, "0");
  const remainingMinutes = (absolute % 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:${remainingMinutes}`;
}

export const timezoneOptions: TimezoneOption[] = [
  {
    value: "UTC",
    label: "UTC",
    offset: "UTC+00:00",
    keywords: ["universal", "coordinated", "gmt", "greenwich"],
  },
  ...rawTimeZones.map((timezone) => ({
    value: timezone.name,
    label: timezone.mainCities[0]
      ? `${timezone.mainCities[0]}, ${timezone.countryName}`
      : timezone.alternativeName || timezone.name,
    offset: formatOffset(timezone.rawOffsetInMinutes),
    keywords: [
      timezone.name,
      timezone.countryName,
      timezone.countryCode,
      timezone.continentName,
      timezone.alternativeName,
      timezone.abbreviation,
      ...timezone.mainCities,
      ...timezone.group,
      formatOffset(timezone.rawOffsetInMinutes),
      timezone.rawFormat,
    ].filter(Boolean),
  })),
].sort((a, b) => {
  if (a.value === "America/Bogota") return -1;
  if (b.value === "America/Bogota") return 1;
  if (a.value === "America/Lima") return -1;
  if (b.value === "America/Lima") return 1;
  if (a.value === "UTC") return -1;
  if (b.value === "UTC") return 1;
  return a.label.localeCompare(b.label, "es");
});

const supportedTimezoneNames = new Set(
  timezoneOptions.map((timezone) => timezone.value),
);

export function isSupportedTimezone(value: string): boolean {
  return supportedTimezoneNames.has(value);
}
