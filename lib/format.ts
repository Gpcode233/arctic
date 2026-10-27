export function usdc(value: number, digits = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

import { EXPLORER_URL as _EXPLORER_URL, explorerTx as _explorerTx, explorerAddr as _explorerAddr } from "@/lib/arc"

export const EXPLORER_URL = _EXPLORER_URL
export const explorerTx = _explorerTx
export const explorerAddr = _explorerAddr

/** Date and time in the viewer's local timezone (scheduled releases). */
export function localDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function shortDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
}
