// Protocol parameters. Mirrors the fee set in the escrow contract.
export const protocolFeeBps = 50

export const isAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)
