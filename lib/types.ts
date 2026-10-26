export type DealStatus = "funded" | "in_progress" | "completed"

export type MilestoneStatus = "pending" | "submitted" | "released"

export type ReleaseRule = "approval" | "schedule"

export type Party = {
  name: string
  address: string
}

export type Milestone = {
  id: string
  title: string
  amount: number
  rule: ReleaseRule
  status: MilestoneStatus
  dueAt?: string
  releasedAt?: string
  txHash?: string
}

export type SplitShare = {
  recipient: string
  address: string
  bps: number
}

export type Deal = {
  id: string
  title: string
  payee: Party
  total: number
  released: number
  status: DealStatus
  createdAt: string
  milestones: Milestone[]
  splits: SplitShare[]
}

export type ActivityEvent = {
  id: string
  kind: "released" | "created" | "split"
  dealId: string
  label: string
  amount?: number
  at: string
  txHash?: string
}
