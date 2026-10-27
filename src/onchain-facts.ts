/**
 * Onchain facts for Arc chains.
 * Arc mainnet:  chain ID 5042,  USDC at 0x3600000000000000000000000000000000000000 (6 decimals)
 * Arc testnet:  chain ID 5042002
 * USDC is the native gas token on Arc — one pool of funds, two views (native 18-dec, ERC-20 6-dec).
 */

export interface ChainFact {
  chainId: number;
  name: string;
  isTestnet: boolean;
  explorerBase: string;
  rpcUrl: string;
  nativeCurrency: { symbol: string; decimals: number; isUsdc: boolean };
  usdc?: { symbol: string; address: string; decimals: number };
  scpBlockchain?: string;
}

const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

export const ONCHAIN_CHAINS = [
  {
    chainId: 5042,
    name: 'Arc',
    isTestnet: false,
    explorerBase: 'https://explorer.arc.io',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    nativeCurrency: { symbol: 'USDC', decimals: 18, isUsdc: true },
    usdc: { symbol: 'USDC', address: ARC_USDC_ADDRESS, decimals: 6 },
    scpBlockchain: undefined, // mainnet not supported by SCP deploy tool
  },
  {
    chainId: 5042002,
    name: 'Arc Testnet',
    isTestnet: true,
    explorerBase: 'https://explorer.testnet.arc.io',
    rpcUrl: 'https://rpc.testnet.arc.io',
    nativeCurrency: { symbol: 'USDC', decimals: 18, isUsdc: true },
    usdc: { symbol: 'USDC', address: ARC_USDC_ADDRESS, decimals: 6 },
    scpBlockchain: 'ARC-TESTNET',
  },
] as const satisfies ChainFact[];

export function requireChain(chainId: number): ChainFact {
  const chain = ONCHAIN_CHAINS.find((c) => c.chainId === chainId);
  if (!chain) throw new Error(`Unknown chain id ${chainId}`);
  return chain;
}

export function requireChainByScpBlockchain(blockchain: string): ChainFact {
  const chain = ONCHAIN_CHAINS.find((c) => c.scpBlockchain === blockchain);
  if (!chain) throw new Error(`Unknown SCP blockchain enum "${blockchain}". Supported: ${ONCHAIN_CHAINS.flatMap((c) => (c.scpBlockchain ? [c.scpBlockchain] : [])).join(', ')}`);
  return chain;
}

export function getUsdc(chainId: number): { address: string; decimals: number } {
  const chain = requireChain(chainId);
  if (!chain.usdc) throw new Error(`No USDC configured for chain ${chainId}`);
  return chain.usdc;
}
