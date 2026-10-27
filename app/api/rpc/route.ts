/**
 * Same-origin JSON-RPC proxy for chain reads.
 * Some browsers/networks cannot reach *.arc.io directly; the server can.
 * Read-only: transactions are signed and sent by the user's wallet, not here.
 */

const UPSTREAMS =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 5042002) === 5042
    ? ["https://rpc.mainnet.arc.io"]
    : [
        "https://rpc.testnet.arc.io",
        "https://rpc.blockdaemon.testnet.arc.io",
        "https://rpc.quicknode.testnet.arc.io",
      ]

const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBalance",
  "eth_getCode",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
])

type RpcCall = { method?: unknown }

function allowed(body: unknown): boolean {
  const calls: RpcCall[] = Array.isArray(body) ? body : [body as RpcCall]
  return (
    calls.length > 0 &&
    calls.length <= 50 &&
    calls.every((c) => typeof c?.method === "string" && ALLOWED_METHODS.has(c.method))
  )
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 })
  }
  if (!allowed(body)) {
    return Response.json({ error: "method not allowed" }, { status: 403 })
  }

  const payload = JSON.stringify(body)
  for (const url of UPSTREAMS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) continue
      return new Response(await res.text(), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    } catch {
      // try next upstream
    }
  }
  return Response.json({ error: "all RPC upstreams failed" }, { status: 502 })
}
