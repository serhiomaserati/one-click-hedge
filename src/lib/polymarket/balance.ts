/**
 * Read a wallet's Polymarket cash balance — SERVER-SIDE ONLY.
 *
 * On CLOB V2 the collateral is pUSD (Polymarket USD), an ERC-20 held by the
 * user's proxy / deposit wallet. We read balanceOf() on Polygon via viem.
 */
import { createPublicClient, http, getAddress } from "viem";
import { polygon } from "viem/chains";
import { getContractConfig } from "@polymarket/clob-client-v2";
import { POLYMARKET } from "./config";

const PUSD = getAddress(getContractConfig(137).collateral);
const DECIMALS = 6;

const erc20BalanceOf = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

let client: ReturnType<typeof createPublicClient> | null = null;
function publicClient() {
  if (!client) {
    client = createPublicClient({ chain: polygon, transport: http(POLYMARKET.polygonRpc) });
  }
  return client;
}

/** Available Polymarket cash (pUSD) for an address, in dollars. 0 on any error. */
export async function getCashBalance(address: string): Promise<number> {
  try {
    const raw = (await publicClient().readContract({
      address: PUSD,
      abi: erc20BalanceOf,
      functionName: "balanceOf",
      args: [getAddress(address)],
    })) as bigint;
    return Number(raw) / 10 ** DECIMALS;
  } catch {
    return 0;
  }
}
