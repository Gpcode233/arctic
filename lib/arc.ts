/**
 * Arc chain and contract configuration.
 * Values come from NEXT_PUBLIC_* env vars (set in .env.local after deploy).
 * Fall back to Arc Testnet defaults so the app compiles without .env.
 */

// Arc Testnet (chain 5042002) — default for development.
// Arc Mainnet (chain 5042) — set NEXT_PUBLIC_CHAIN_ID=5042 and matching values.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 5042002)

/** ArcticEscrow contract address (deployed via deploy:self) */
export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined) ?? undefined

/**
 * USDC ERC-20 address.
 * On both Arc mainnet and testnet: 0x3600000000000000000000000000000000000000
 * 6 decimals on the ERC-20 interface.
 */
export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`) ??
  '0x3600000000000000000000000000000000000000'

/** USDC decimals on Arc (ERC-20 view = 6). */
export const USDC_DECIMALS = 6

/** Arc mainnet explorer root. */
export const EXPLORER_URL = CHAIN_ID === 5042
  ? 'https://explorer.arc.io'
  : 'https://explorer.testnet.arc.io'

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`
}

export function explorerAddr(address: string): string {
  return `${EXPLORER_URL}/address/${address}`
}
