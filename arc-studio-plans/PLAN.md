# Arctic — Auth + Per-Wallet State

## Summary
Arctic is a milestone-based USDC escrow app on Arc. Right now all deal data is read from the contract with no per-user context. This phase adds wallet-as-identity auth, per-wallet localStorage state (display names, full milestone titles/descriptions, notification feed), and a "payee view" so both sides of a deal have a clear, personalised experience.

## Architecture
- **Blockchain:** Arc Testnet (chain 5042002), contract already deployed at `0x5637269684369eb9f085a3888417b84bb001a0fe`
- **Auth:** ConnectKit wallet connection — the connected address is the identity. No passwords, no signup. A "profile" is created automatically on first connect and persisted to localStorage keyed by wallet address.
- **Storage:** `localStorage` keyed by wallet address. Three namespaces: `arctic:profile:<address>` (display name, avatar colour), `arctic:deal-meta:<chainId>:<dealId>` (full title, milestone descriptions, attachments list), `arctic:notifications:<address>` (event feed). Per-wallet isolation is enforced — you only ever read/write your own key.
- **Frontend:** New hooks (`useProfile`, `useDealMeta`, `useNotifications`) wrap localStorage reads/writes. Existing pages read from these hooks in addition to the contract. No new pages needed — enhancements to existing ones.
- **Wallet:** ConnectKit already wired.

## Files to Create/Modify

1. `lib/profile-store.ts` — `useProfile` hook: read/write display name + avatar colour keyed by wallet address. Auto-initialises on first connect.
2. `lib/deal-meta-store.ts` — `useDealMeta(dealId)` hook: store/retrieve full milestone titles, deal description, and file attachment names per deal per chain.
3. `lib/notifications-store.ts` — `useNotifications` hook: append/read a per-wallet event feed (milestone delivered, released, refunded). Polled from contract events on mount.
4. `lib/deals-store.tsx` — extend to merge onchain deal data with off-chain metadata (full titles from `deal-meta-store`, display names from `profile-store`).
5. `app/(app)/profile/page.tsx` — new page: edit display name, avatar colour, see your wallet address, copy it, disconnect.
6. `components/arctic/profile-avatar.tsx` — small avatar component (coloured circle + initials/name) used in nav and deal cards.
7. `components/nav-user.tsx` — replace current wallet button with display name + avatar; links to `/profile`.
8. `app/(app)/deals/[id]/page.tsx` — show payee's display name instead of raw address; show full milestone descriptions from `deal-meta-store`; show notification dot when action is needed.
9. `app/(app)/deals/new/page.tsx` — add description field per milestone (stored to `deal-meta-store` on submit, not sent onchain).
10. `components/arctic/notification-bell.tsx` — bell icon in header showing unread count; dropdown of recent events.
11. `app/(app)/layout.tsx` — add notification bell to header; redirect unauthenticated visitors to a connect-wallet landing state.
12. `app/(app)/dashboard/page.tsx` — personalise greeting with display name; filter stats to only deals involving the connected wallet.

## Build Sequence

1. `lib/profile-store.ts` + `lib/deal-meta-store.ts` + `lib/notifications-store.ts` — the three localStorage hooks, fully isolated by wallet address.
2. `components/arctic/profile-avatar.tsx` — reusable avatar component.
3. `app/(app)/profile/page.tsx` — profile edit page.
4. `components/nav-user.tsx` — wire display name + avatar into the existing nav component.
5. `lib/deals-store.tsx` — merge onchain data with off-chain metadata.
6. `app/(app)/deals/new/page.tsx` — add per-milestone description field, save to `deal-meta-store` on submit.
7. `app/(app)/deals/[id]/page.tsx` — show display names, full descriptions, role-appropriate view.
8. `components/arctic/notification-bell.tsx` + wire into `app/(app)/layout.tsx`.
9. `app/(app)/dashboard/page.tsx` — personalised greeting + filtered stats.
10. Push updated code to GitHub.

## Done When
- [ ] Connecting a wallet creates a profile automatically; display name defaults to truncated address until edited.
- [ ] Profile page lets you set a display name and see your address.
- [ ] Nav shows your display name (or truncated address) and avatar, not a raw ConnectKit button.
- [ ] Two different wallets connecting to the same browser see completely separate deal lists, names, and notifications.
- [ ] Creating a deal saves full milestone descriptions to localStorage; the deal detail page shows them.
- [ ] Notification bell shows unread count and lists recent events for the connected wallet.
- [ ] Dashboard greeting is personalised ("Welcome back, Alice" or "Welcome back, 0xabc…").
- [ ] Disconnecting wallet clears the active session; reconnecting a different address loads that wallet's data.
- [ ] Typecheck and lint pass.
- [ ] Code pushed to GitHub.
