export type DealStatus = "funded" | "in_progress" | "completed"

export type MilestoneStatus = "pending" | "submitted" | "released" | "refunded"

export type ReleaseRule = "approval" | "schedule"

export type Party = {
  name?: string   // optional: not stored onchain, derived from address
  address: string
}

export type Milestone = {
  id: string         // "{dealId}-{index}"
  title: string      // from DealCreated event (emitted; not stored onchain)
  amount: number     // USDC whole units
  rule: ReleaseRule
  status: MilestoneStatus
  dueAt?: string     // ISO string for schedule milestones
  releasedAt?: string
  txHash?: string    // release/refund tx hash from events
}

export type SplitShare = {
  recipient: string
  address: string
  bps: number
}

export type Deal = {
  id: string
  title: string      // from DealCreated event
  payer: Party
  payee: Party
  total: number      // USDC whole units
  released: number
  status: DealStatus
  createdAt: string  // ISO
  milestones: Milestone[]
  splits: SplitShare[]
  earnYield: boolean
  yieldEarned?: number  // pending yield in USDC from pendingYield view
  feeBps: number
}

export type ActivityEvent = {
  id: string
  kind: "released" | "created" | "split" | "yield"
  dealId: string
  label: string
  amount?: number
  at: string
  txHash?: string
}
