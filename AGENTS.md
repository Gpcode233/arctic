## ArcticEscrow — Deployed Contracts

| Network     | Contract address | Explorer |
|-------------|-----------------|---------|
| Arc Testnet | `0x5637269684369eb9f085a3888417b84bb001a0fe` | [Explorer](https://explorer.testnet.arc.io/address/0x5637269684369eb9f085a3888417b84bb001a0fe) |

**Deploy tx:** `0x162063e21a47fcd83f332f1b94bba2ea5ebbe6c4161a52bfee68978b6b22e14a`
**Deployed:** 2026-10-26T17:07:57.872Z
**Constructor args:** USDC=`0x3600...0000`, vault=`0x0000...0000` (yield disabled), treasury=`0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`, feeBps=50, yieldFeeBps=500

## Architecture decisions

- `contracts/ArcticEscrow.sol` — Solidity 0.8.28, OZ v5.1.0, `via_ir=true` (needed for Yul codegen correctness; eliminates stack-too-deep).
- Deal titles stored **only in events** (`DealCreated`); on-chain storage holds only `keccak256(title)` for verification. Eliminates solc Yul IR stack-too-deep bug.
- Yield disabled at deploy time (`vault = address(0)`) until a USDC Morpho vault exists on Arc mainnet.
- Fee parameters snapshotted into each Deal struct at creation time.
- Split payment push with safe-fallback to payer on transfer failure (`_sendOrFallback`).
- Payer can refund Pending milestones (liveness escape hatch); payee can refund Pending or Delivered.

## Security review findings (resolved)

1. [Critical] Push-payment DoS on split recipients → fixed with safe `.call` fallback to payer.
2. [High] Milestone liveness: payer could be locked out → payer now refunds Pending milestones.
3. [Medium] Global fee mutation affecting live deals → fees snapshotted per-deal.
4. [Medium] Vault constructor validation missing → `IERC4626.asset() == _usdc` check added.
5. [Medium] `_usdc` not validated as a contract → `code.length > 0` check added.
6. [Low] Uninitialized locals flagged by Slither → explicit `= 0` initializers added.

## Environment variables

After deploying, set in `.env.local`:
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — deployed ArcticEscrow address
- `NEXT_PUBLIC_CHAIN_ID` — `5042002` for testnet, `5042` for mainnet
- `NEXT_PUBLIC_USDC_ADDRESS` — USDC ERC-20 address (default: `0x3600000000000000000000000000000000000000`)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — optional, from cloud.walletconnect.com

## Foundry test suite

82 tests, 0 failures. Test files:
- `contracts/test/ArcticEscrow.Base.t.sol`
- `contracts/test/ArcticEscrow.Deploy.t.sol`
- `contracts/test/ArcticEscrow.Happy.t.sol`
- `contracts/test/ArcticEscrow.Yield.t.sol`
- `contracts/test/ArcticEscrow.Revert.t.sol`
- `contracts/test/ArcticEscrow.Fuzz.t.sol`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
