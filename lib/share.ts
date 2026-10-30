/**
 * Off-chain share details for a deal (recipient emails and names).
 * Emails are never sent onchain or to a server; they live in this browser only
 * and are used to prefill mailto links.
 */

export type ShareRecipient = {
  name?: string
  email: string
  role: "Payee" | "Split recipient" | "Arbiter"
  address?: string
}

const key = (dealId: string) => `arctic:share:${dealId}`

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export function saveShare(dealId: string, recipients: ShareRecipient[]) {
  try {
    localStorage.setItem(key(dealId), JSON.stringify(recipients))
  } catch {
    /* storage unavailable: share links still work without saved emails */
  }
}

/** Raw stored value (a stable string, so it works as a useSyncExternalStore snapshot). */
export function readShareRaw(dealId: string): string {
  try {
    return localStorage.getItem(key(dealId)) ?? ""
  } catch {
    return ""
  }
}

export function parseShare(raw: string): ShareRecipient[] {
  try {
    return raw ? (JSON.parse(raw) as ShareRecipient[]) : []
  } catch {
    return []
  }
}

export function dealUrl(dealId: string) {
  return `${window.location.origin}/deals/${dealId}`
}

function roleIntro(r: ShareRecipient, dealId: string): string[] {
  if (r.role === "Arbiter") {
    return [
      `You've been named the arbiter on an Arctic escrow deal (#${dealId}).`,
      "If the payer disputes a delivered milestone, you decide whether it is released to the payee or refunded to the payer.",
      "You hold no funds and take no fee. You only act if a dispute is raised.",
    ]
  }
  return [
    `You've been added as ${r.role === "Payee" ? "the payee" : "a payout recipient"} on an Arctic escrow deal (#${dealId}).`,
    r.role === "Payee"
      ? "Funds are locked in USDC on Arc. Open the deal, check the terms and payout split, then accept it before starting work."
      : "Funds are locked in USDC on Arc and released as milestones complete.",
  ]
}

export function mailtoFor(r: ShareRecipient, dealId: string, dealTitle: string) {
  const subject = r.role === "Arbiter"
    ? `You've been named arbiter on an escrow deal: ${dealTitle}`
    : `You've been added to an escrow deal: ${dealTitle}`
  const body = [
    `Hi${r.name ? ` ${r.name}` : ""},`,
    "",
    ...roleIntro(r, dealId),
    "",
    `View the deal: ${dealUrl(dealId)}`,
    r.address ? `Connect this wallet to act on it: ${r.address}` : "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n")
  return `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
