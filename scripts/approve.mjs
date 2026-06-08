// Stage 3 setup: approve the Polymarket exchange contracts to move the wallet's
// USDC.e (collateral) and CTF outcome tokens. One-time, on-chain, ~cents of gas.
// Does NOT place orders or move funds — only sets allowances.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const { getContractConfig } = require("@polymarket/clob-client");

const RPC = "https://polygon-bor-rpc.publicnode.com";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pk = env.match(/^WALLET_PRIVATE_KEY=(.+)$/m)?.[1]?.trim();

const provider = new ethers.JsonRpcProvider(RPC, 137);
const wallet = new ethers.Wallet(pk, provider);
console.log("Wallet:", wallet.address);

const cfg = getContractConfig(137);
const spenders = [
  ["exchange", cfg.exchange],
  ["negRiskExchange", cfg.negRiskExchange],
  ["negRiskAdapter", cfg.negRiskAdapter],
];

const erc20 = new ethers.Contract(
  cfg.collateral.toLowerCase(),
  [
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ],
  wallet
);
const ctf = new ethers.Contract(
  cfg.conditionalTokens.toLowerCase(),
  [
    "function setApprovalForAll(address,bool)",
    "function isApprovedForAll(address,address) view returns (bool)",
  ],
  wallet
);

for (const [name, spender] of spenders) {
  if ((await erc20.allowance(wallet.address, spender)) > 0n) {
    console.log(`USDC.e → ${name}: already approved`);
    continue;
  }
  const tx = await erc20.approve(spender, ethers.MaxUint256);
  console.log(`USDC.e → ${name}: approving… ${tx.hash}`);
  await tx.wait();
  console.log("  ✓ confirmed");
}

for (const [name, spender] of spenders) {
  if (await ctf.isApprovedForAll(wallet.address, spender)) {
    console.log(`CTF → ${name}: already approved`);
    continue;
  }
  const tx = await ctf.setApprovalForAll(spender, true);
  console.log(`CTF → ${name}: approving… ${tx.hash}`);
  await tx.wait();
  console.log("  ✓ confirmed");
}

console.log("\nAll approvals set. (No order placed.)");
