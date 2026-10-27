/**
 * Vesting schedule presets: equal Schedule-rule milestones at a fixed interval.
 * The escrow contract allows at most 20 milestones per deal.
 */

export const MAX_MILESTONES = 20

export type VestingDuration = 12 | 24 | 36
export type VestingFrequency = "monthly" | "quarterly"

export const stepMonths = (f: VestingFrequency) => (f === "monthly" ? 1 : 3)

export const releaseCount = (months: VestingDuration, f: VestingFrequency) =>
  months / stepMonths(f)

export const frequencyAllowed = (months: VestingDuration, f: VestingFrequency) =>
  releaseCount(months, f) <= MAX_MILESTONES

/** Add months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
function addMonths(date: Date, months: number): Date {
  const out = new Date(date)
  const day = out.getDate()
  out.setDate(1)
  out.setMonth(out.getMonth() + months)
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate()
  out.setDate(Math.min(day, lastDay))
  return out
}

/** Format as the value of an <input type="datetime-local"> (local time). */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export type VestingMilestone = { title: string; amount: string; dueAt: string }

/** Equal amounts to the cent; the last release absorbs any rounding remainder. */
export function buildVesting(
  total: number,
  months: VestingDuration,
  frequency: VestingFrequency,
  start: Date,
): VestingMilestone[] {
  const n = releaseCount(months, frequency)
  const step = stepMonths(frequency)
  const cents = Math.round(total * 100)
  const each = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => {
    const amountCents = i === n - 1 ? cents - each * (n - 1) : each
    return {
      title: `Vest ${i + 1} of ${n}`,
      amount: (amountCents / 100).toString(),
      dueAt: toLocalInput(addMonths(start, step * (i + 1))),
    }
  })
}
