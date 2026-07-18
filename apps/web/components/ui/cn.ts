export type ClassValue = string | number | false | null | undefined;

/** Minimal className joiner (no external clsx dependency). */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
