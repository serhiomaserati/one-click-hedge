// One-off: derive the wallet address from .env.local and check Polygon balances.
// Prints ONLY the address + balances — never the private key.
import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pk = env.match(/^WALLET_PRIVATE_KEY=(.+)$/m)?.[1]?.trim();
if (!pk) {
  console.log("WALLET_PRIVATE_KEY not set");
  process.exit(1);
}

const address = new ethers.Wallet(pk).address;
console.log("Wallet address:", address);

const RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.llamarpc.com",
  "https://1rpc.io/matic",
  "https://polygon.drpc.org",
];
let provider;
for (const url of RPCS) {
  try {
    const p = new ethers.JsonRpcProvider(url);
    await p.getBlockNumber();
    provider = p;
    console.log("RPC:", url);
    break;
  } catch {
    // try next
  }
}
if (!provider) {
  console.log("No working public RPC right now — key is valid, skip balance check.");
  process.exit(0);
}
const erc20 = ["function balanceOf(address) view returns (uint256)"];
const tokens = {
  "USDC (native)": "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359",
  "USDC.e (bridged)": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
};

const pol = await provider.getBalance(address);
console.log("POL (gas):", ethers.formatEther(pol));

for (const [name, addr] of Object.entries(tokens)) {
  const bal = await new ethers.Contract(addr.toLowerCase(), erc20, provider).balanceOf(address);
  console.log(`${name}:`, ethers.formatUnits(bal, 6));
}
