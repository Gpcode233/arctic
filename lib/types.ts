export type DealStatus = "funded" | "in_progress" | "completed"

export type MilestoneStatus = "pending" | "submitted" | "released" | "refunded" | "disputed"

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
  deliverBy?: string // ISO delivery deadline for approval milestones
  deliveredAt?: string
  releasedAt?: string  // release or refund time
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
  arbiter?: Party    // undefined when the deal has no arbiter
  total: number      // USDC whole units
  released: number
  refunded: number
  status: DealStatus
  createdAt: string  // ISO
  acceptedAt?: string  // ISO; undefined until the payee accepts
  reviewPeriod: number // seconds the payer has to review a delivery
  milestones: Milestone[]
  splits: SplitShare[]
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
