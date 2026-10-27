/**
 * Off-chain share details for a deal (recipient emails and names).
 * Emails are never sent onchain or to a server; they live in this browser only
 * and are used to prefill mailto links.
 */

export type ShareRecipient = {
  name?: string
  email: string
  role: "Payee" | "Split recipient"
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

export function loadShare(dealId: string): ShareRecipient[] {
  try {
    const raw = localStorage.getItem(key(dealId))
    return raw ? (JSON.parse(raw) as ShareRecipient[]) : []
  } catch {
    return []
  }
}

export function dealUrl(dealId: string) {
  return `${window.location.origin}/deals/${dealId}`
}

export function mailtoFor(r: ShareRecipient, dealId: string, dealTitle: string) {
  const subject = `You've been added to an escrow deal: ${dealTitle}`
  const body = [
    `Hi${r.name ? ` ${r.name}` : ""},`,
    "",
    `You've been added as ${r.role === "Payee" ? "the payee" : "a payout recipient"} on an Arctic escrow deal (#${dealId}).`,
    "Funds are locked in USDC on Arc and released as milestones complete.",
    "",
    `View the deal: ${dealUrl(dealId)}`,
    r.address ? `Connect this wallet to act on it: ${r.address}` : "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n")
  return `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
