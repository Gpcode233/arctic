/**
 * Arc chain and contract configuration.
 * Values come from NEXT_PUBLIC_* env vars (set in .env.local after deploy).
 * Fall back to Arc Testnet defaults so the app compiles without .env.
 */

// Arc Testnet (chain 5042002) — default for development.
// Arc Mainnet (chain 5042) — set NEXT_PUBLIC_CHAIN_ID=5042 and matching values.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 5042002)

const legacyContractAddress =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined) ?? undefined

export const MAINNET_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_MAINNET_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  (CHAIN_ID === 5042 ? legacyContractAddress : undefined)

export const TESTNET_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_TESTNET_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  (CHAIN_ID === 5042002 ? legacyContractAddress : undefined)

export function getContractAddress(chainId = CHAIN_ID): `0x${string}` | undefined {
  if (chainId === 5042) return MAINNET_CONTRACT_ADDRESS
  if (chainId === 5042002) return TESTNET_CONTRACT_ADDRESS
  return undefined
}

/** Contract address for the configured default network. */
export const CONTRACT_ADDRESS = getContractAddress()

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

export function explorerUrl(chainId = CHAIN_ID): string {
  if (chainId === 5042) return 'https://explorer.arc.io'
  return 'https://explorer.testnet.arc.io'
}

/** Explorer root for the configured default network. */
export const EXPLORER_URL = explorerUrl()

export function explorerTx(hash: string, chainId = CHAIN_ID): string {
  return `${explorerUrl(chainId)}/tx/${hash}`
}

export function explorerAddr(address: string, chainId = CHAIN_ID): string {
  return `${explorerUrl(chainId)}/address/${address}`
}
