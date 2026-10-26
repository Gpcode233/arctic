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

export const EXPLORER_URL = "https://explorer.arc.io"

export function shortDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
}
