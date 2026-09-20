import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as viem from "viem";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import type * as TransactionClient from "../src/features/protocol/transaction-client.ts";
import type { ProtocolConfig, ProtocolState } from "../src/features/protocol/types.ts";

const source = await readFile(new URL("../src/features/protocol/transaction-client.ts", import.meta.url), "utf8");
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
const clientModule = { exports: {} };
const confirmed = async () => ({ status: "success", blockNumber: 2n });
let waitForReceipt = confirmed;
const dependencies: Record<string, unknown> = {
  viem,
  "../../wallet/wallet-chain": {},
  "../../wallet/wallet-rpc": { walletRpcClient: () => ({
    waitForTransactionReceipt: () => waitForReceipt(),
  }) },
};
new Function("require", "exports", compiled)((name: string) => {
  assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
  return dependencies[name];
}, clientModule.exports);
const { portfolioTransferPlan, submitPlan } = clientModule.exports as typeof TransactionClient;
const address = "0x1111111111111111111111111111111111111111";
const walletAddress = "0x2222222222222222222222222222222222222222";
const config = { chainId: 1, contracts: {
  RF: "0x3333333333333333333333333333333333333333",
  WETH: "0x4444444444444444444444444444444444444444",
  Genesis: "0x5555555555555555555555555555555555555555",
  ActivationManager: "0x6666666666666666666666666666666666666666",
} } as unknown as ProtocolConfig;
const rawBalance = "1234567890123456789";
const snapshot = { blockNumber: "1", account: { address, rewardAccounting: "friend", friends: [{
  id: 7, collection: "Genesis", hardwired: true, wallet: { address: walletAddress,
    tokens: ["$RAREFRIENDS", "WETH", "ETH"].map(symbol => ({ symbol, balance: 1.2345678901234567, rawBalance })) },
}] } } as ProtocolState;

for (const asset of ["RF", "WETH"] as const) {
  for (const kind of ["claim", "withdraw"] as const) {
    test(`${kind} ${asset} submits directly with accurate calldata`, async () => {
      const action = { kind, asset, collection: "Genesis" as const, friendId: 7 };
      const plan = portfolioTransferPlan(address, action, config, snapshot);
      const transaction = plan.steps[0].transaction;
      if (kind === "claim") {
        assert.equal(transaction.to, config.contracts.ActivationManager);
        const call = viem.decodeFunctionData({ abi: viem.parseAbi(["function claim(address,address,uint256)"]), data: transaction.data });
        assert.deepEqual(call.args, [config.contracts[asset], config.contracts.Genesis, 7n]);
      } else {
        assert.equal(transaction.to, walletAddress);
        const call = viem.decodeFunctionData({ abi: viem.parseAbi(["function execute(address,uint256,bytes,uint8)"]), data: transaction.data });
        assert.equal(call.args![0], config.contracts[asset]);
        const transfer = viem.decodeFunctionData({ abi: viem.erc20Abi, data: call.args![2] });
        assert.deepEqual(transfer.args, [address, BigInt(rawBalance)]);
      }
      const calls: string[] = [];
      let receipts = 0;
      await submitPlan({ config, input: { address, action }, plan,
        wallet: { address, chainId: "0x1", getSession: () => 1, request: async (method, params) => {
          calls.push(method);
          assert.equal(method, "eth_sendTransaction", "No preflight RPC is allowed");
          assert.deepEqual(params, [transaction]);
          return `0x${"a".repeat(64)}`;
        } }, onProgress: () => {}, onReceipt: async () => { receipts++; } });
      assert.deepEqual(calls, ["eth_sendTransaction"]);
      assert.equal(receipts, 1);
    });
  }
}

function submit(kind: "claim" | "withdraw", sent: string[]) {
  const action = { kind, asset: "WETH" as const, collection: "Genesis" as const, friendId: 7 };
  return submitPlan({ config, input: { address, action }, plan: portfolioTransferPlan(address, action, config, snapshot),
    wallet: { address, chainId: "0x1", getSession: () => 1, request: async method => { sent.push(method); return `0x${"a".repeat(64)}`; } },
    onProgress: () => {}, onReceipt: async () => {} });
}

for (const kind of ["claim", "withdraw"] as const) {
  test(`${kind} ignores a stored pending transaction, never touches localStorage, and can repeat`, async t => {
    const touched: string[] = [];
    const stored = new Map([[`rarefriends.pending.1.${address}`, `0x${"b".repeat(64)}`]]);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key: string) => { touched.push(key); return stored.get(key) ?? null; },
      setItem: (key: string, value: string) => { touched.push(key); stored.set(key, value); },
      removeItem: (key: string) => { touched.push(key); stored.delete(key); },
    } });
    t.after(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });
    const sent: string[] = [];
    await submit(kind, sent);
    await submit(kind, sent);
    assert.deepEqual(sent, ["eth_sendTransaction", "eth_sendTransaction"]);
    assert.deepEqual(touched, []);
  });

  test(`an unconfirmed ${kind} releases the UI and can be sent again`, async t => {
    let now = 0;
    t.mock.method(Date, "now", () => now += 60_000);
    waitForReceipt = async () => { throw new Error("timed out"); };
    t.after(() => { waitForReceipt = confirmed; });
    const sent: string[] = [];
    await assert.rejects(submit(kind, sent), /not confirmed yet.*submit it again/);
    waitForReceipt = confirmed;
    await submit(kind, sent);
    assert.deepEqual(sent, ["eth_sendTransaction", "eth_sendTransaction"]);
  });
}

test("withdrawals require exact snapshot balances instead of rounding display values", () => {
  const stale = structuredClone(snapshot);
  delete stale.account!.friends[0].wallet!.tokens[0].rawBalance;
  assert.throws(() => portfolioTransferPlan(address, { kind: "withdraw", asset: "RF", collection: "Genesis", friendId: 7 }, config, stale), /Refresh your portfolio/);
});
