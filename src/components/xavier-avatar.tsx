import Image from "next/image";

import { cn } from "@/lib/utils";

type XavierAvatarProps = {
  className?: string;
  /** Tamaño del contenedor, p. ej. size-9 */
  sizeClassName?: string;
};

/** Avatar de Xavier = icono de la app ControlX. */
export function XavierAvatar({
  className,
  sizeClassName = "size-9",
}: XavierAvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-lg",
        sizeClassName,
        className,
      )}
      aria-hidden
      title="Xavier"
    >
      <Image
        src="/icon.svg"
        alt=""
        fill
        className="object-cover"
        sizes="36px"
      />
    </span>
  );
}
