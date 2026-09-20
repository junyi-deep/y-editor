import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class lists, letting a caller's class win over defaults. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
