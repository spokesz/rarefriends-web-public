import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { parseAbi, type Address } from "viem";
import { contractRead, ProtocolError, type ChainContext } from "../src/lib/protocol/chain-context.ts";
import { rewardApyPercent } from "../src/lib/protocol/metrics.ts";
import type { ChainIndex } from "../src/lib/protocol/indexer.ts";
import type { ProtocolAccount } from "../src/features/protocol/model.ts";
import type { ProtocolState } from "../src/features/protocol/types.ts";
import * as protocolModel from "../src/features/protocol/model.ts";

const source = await readFile(new URL("../src/server/protocol/wallet-read.ts", import.meta.url), "utf8");
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
const UNIT = 10n ** 18n;
const owner: Address = "0x1111111111111111111111111111111111111111";
const addresses = {
  RF: "0x0000000000000000000000000000000000000001",
  WETH: "0x0000000000000000000000000000000000000002",
  Genesis: "0x0000000000000000000000000000000000000003",
  Generations: "0x0000000000000000000000000000000000000004",
  ActivationManager: "0x0000000000000000000000000000000000000005",
  Reserve: "0x0000000000000000000000000000000000000006",
} satisfies Record<string, Address>;
const activationAbi = parseAbi([
  "event Activated(address indexed collection, uint256 indexed tokenId, address indexed holder, uint8 tier, uint256 weight, uint256 payment)",
  "event ActivationCleared(address indexed collection, uint256 indexed tokenId)",
]);
const at = 1_789_790_000n;
const liveBlock = { number: 1_000n, timestamp: at, hash: `0x${"a".repeat(64)}` };
const totals = {
  v: 1, blockNumber: "900", blockHash: `0x${"b".repeat(64)}`,
  activatedGenesis: 2, friendsPlaying: 5,
  genesisWeight: String(200n * UNIT), generationsWeight: String(50n * UNIT),
  activationPaid: String(1_000n * UNIT), ammVolume: String(7n * UNIT),
  claimedRf: String(30n * UNIT), claimedWeth: String(2n * UNIT),
};
const publication = {
  chainId: 4663, generatedAt: new Date(Number(at - 30n) * 1000).toISOString(),
  blockTimestamp: Number(at - 30n), finalizedBlock: "890", protocolSnapshot: totals, stale: false,
};
const prices = { rfUsd: 2, ethUsd: 2_000, label: "test prices", marketReady: true, usdAvailable: true };

type Readers = {
  readProtocolSnapshot(context: ChainContext): Promise<ProtocolState>;
  readWalletPortfolioState(address: Address, context: ChainContext): Promise<ProtocolState>;
};

/** Load the real reader and APR formula, isolating external services and wallet detail reads. */
function readers(options: { legacy?: boolean; failure?: Error; expired?: boolean } = {}) {
  const finish = options.expired ? at - 1n : at + 3_600n;
  const rfStream = [20n * UNIT, UNIT / 100_000n, finish, at - 60n];
  const wethStream = [UNIT / 100n, UNIT / 1_000_000_000n, finish, at - 60n];
  const getBlock = mock.fn(async () => liveBlock);
  const getLogs = mock.fn(async (query: unknown) => {
    assert.ok(query && typeof query === "object");
    return [{ args: { payment: 7n * UNIT } }, { args: { payment: 5n * UNIT } }];
  });
  const readContract = mock.fn(async ({ address, functionName, args = [], blockNumber }: {
    address: Address; functionName: string; args?: unknown[]; blockNumber?: bigint;
  }) => {
    assert.equal(blockNumber, liveBlock.number, "live contract views must stay on the latest block");
    if (address === addresses.RF && functionName === "INITIAL_SUPPLY") return 10_000n * UNIT;
    if (address === addresses.RF && functionName === "totalSupply") return 9_900n * UNIT;
    if (address === addresses.Reserve && functionName === "inventoryCount") return 9n;
    if (address === addresses.ActivationManager && functionName === "totalWeight") return 250n * UNIT;
    if (address === addresses.ActivationManager && functionName === "streams") {
      assert.ok(args[0] === addresses.RF || args[0] === addresses.WETH);
      return args[0] === addresses.RF ? rfStream : wethStream;
    }
    assert.fail(`Unexpected contract view: ${functionName}`);
  });
  const contracts = Object.fromEntries(Object.entries(addresses).map(([name, address]) => [name, {
    address, abi: name === "ActivationManager" ? activationAbi : [],
  }]));
  const manifest = {
    chainId: 4663, deploymentBlock: "100", contracts,
    // Deliberately wrong legacy data must never become a fallback or APR denominator.
    ...(options.legacy ? { protocolSnapshot: { ...totals, activationPaid: String(UNIT), friendsPlaying: 999, activatedGenesis: 998 } } : {}),
  };
  const context = {
    manifest, client: { getBlock, getLogs, readContract }, chainId: 4663, local: false, accounts: [], fromBlock: 100n,
    rpcUrl: "https://robinhood-mainnet.g.alchemy.com/v2/fake-test-key",
  } as unknown as ChainContext;
  const readProtocolTotals = mock.fn(async (received: ChainContext) => {
    assert.equal(received, context);
    if (options.failure) throw options.failure;
    return publication;
  });
  const account: ProtocolAccount = {
    address: owner, live: true, eth: 4, weth: 3, tokenBalance: 250, friends: [],
    activity: [{ id: "known", title: "Existing wallet activity", at: Number(at) * 1000 }], history: [],
    claimed: 8, claimedWeth: 0.2, rewardCreditWeth: 0.5, rewardCredit: 6, activationPaid: -1,
  };
  const indexed = mock.fn(async (address: Address, received: ChainContext, index: ChainIndex, base: ProtocolState) => {
    assert.equal(address, owner);
    assert.equal(received, context);
    assert.equal(index.block, liveBlock.number);
    assert.equal(index.at, Number(at));
    assert.equal(base.blockNumber, String(liveBlock.number));
    return { ...base, account };
  });
  const nftFetch = mock.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/getNFTsForOwner"));
    assert.equal(url.searchParams.get("owner"), owner);
    return Response.json({ ownedNfts: [
      { contractAddress: addresses.Genesis, tokenId: "11" },
      { contractAddress: addresses.Generations, tokenId: "5" },
    ] });
  });
  const dependencies: Record<string, unknown> = {
    "../../lib/protocol/chain-context": { contractRead, ProtocolError },
    "../../lib/protocol/indexer": { units: (value: bigint) => Number(value) / 1e18 },
    "../../lib/protocol/metrics": { rewardApyPercent },
    "../../lib/protocol/reserve": { readReserveStatus: async () => ({ blockNumber: String(liveBlock.number) }) },
    "./state": { chainPrices: async () => prices, readIndexedProtocolState: indexed },
    "./prices": { readEthUsdPrice: async () => ({ usd: prices.ethUsd }) },
    "./snapshot": { readProtocolTotals },
  };
  const readerModule = { exports: {} };
  new Function("require", "module", "exports", "fetch", compiled)((name: string) => {
    const key = name.replace(/\.ts$/, "");
    assert.ok(key in dependencies, `Unexpected metric reader dependency: ${name}`);
    return dependencies[key];
  }, readerModule, readerModule.exports, nftFetch);
  return { ...(readerModule.exports as Readers), context, getBlock, getLogs, readContract, readProtocolTotals,
    indexed, nftFetch, account, rfStream, wethStream };
}

for (const legacy of [true, false]) {
  test(`production metrics use the snapshot service ${legacy ? "instead of obsolete embedded totals" : "without an embedded snapshot"}`, async () => {
    const reader = readers({ legacy });
    const state = await reader.readProtocolSnapshot(reader.context);
    assert.equal(reader.readProtocolTotals.mock.callCount(), 1);
    assert.equal(reader.getLogs.mock.callCount(), 0, "public metrics must not scan global activation history");
    assert.equal(state.account, null);
    assert.equal(state.blockNumber, String(liveBlock.number));
    assert.equal(state.timestamp, Number(at) * 1000);
    const metrics = state.protocol.metrics;
    assert.equal(metrics.friendsPlaying, 5);
    assert.equal(metrics.activatedGenesis, 2);
    assert.equal(metrics.genesisWeight, 200);
    assert.equal(metrics.generationsWeight, 50);
    assert.equal(metrics.ammVolumeEth, 7);
    assert.equal(metrics.ammVolumeUsd, 14_000);
    assert.equal(metrics.distributedRf, 30);
    assert.equal(metrics.distributedWeth, 2);
    assert.equal(metrics.distributedUsd, 4_060);
    assert.equal(metrics.supplyBurned, 100);
    assert.equal(metrics.rewardApy, rewardApyPercent({
      rateRf: reader.rfStream[1], rateWeth: reader.wethStream[1],
      pendingRf: reader.rfStream[0], pendingWeth: reader.wethStream[0],
    }, BigInt(totals.activationPaid), prices));
  });
}

test("active stream APR excludes pending fees", () => {
  const rates = { rateRf: UNIT / 100_000n, rateWeth: UNIT / 1_000_000_000n, pendingRf: 20n * UNIT, pendingWeth: UNIT / 100n };
  const expected = (0.00001 * 2 + 0.000000001 * 2_000) * 86_400 * 365 / 2_000 * 100;
  assert.ok(Math.abs(rewardApyPercent(rates, 1_000n * UNIT, prices) - expected) < 1e-10);
  assert.equal(rewardApyPercent(rates, 1_000n * UNIT, prices), rewardApyPercent({ ...rates, pendingRf: 0n, pendingWeth: 0n }, 1_000n * UNIT, prices));
});

test("portfolio APR uses active rewards only and preserves the activation spending denominator", async () => {
  const source = await readFile(new URL("../src/features/portfolio/analytics-data.ts", import.meta.url), "utf8");
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } }).outputText;
  const analytics = { exports: {} as typeof import("../src/features/portfolio/analytics-data.ts") };
  new Function("require", "exports", compiled)((name: string) => {
    assert.equal(name, "../protocol/model");
    return protocolModel;
  }, analytics.exports);
  const reader = readers();
  const state = await reader.readWalletPortfolioState(owner, reader.context);
  const account = { ...state.account!, activationPaid: 100, friends: [
    { id: 1, collection: "Genesis" as const, generation: 0, tier: 0, activated: true, hardwired: true, weight: 25, earnings: 0, portrait: 0 },
  ] };
  const protocol = { ...state.protocol, streams: [
    { asset: "RF" as const, start: 0, end: 2, budget: 70, dripped: 0, pending: 1_000 },
    { asset: "WETH" as const, start: 0, end: 1, budget: 10, dripped: 0, pending: 1 },
  ] };
  // 10% share of 70 RF/week, divided by 100 RF paid: 365% APR.
  assert.ok(Math.abs(analytics.exports.holderApyPercent(account, protocol, 1)! - 365) < 1e-10);
  assert.equal(analytics.exports.holderApyPercent(account, protocol, 2), 0);
  assert.equal(analytics.exports.holderApyPercent({ ...account, activationPaid: 0 }, protocol, 1), null);
});

test("expired streams produce zero APR even with pending fees", async () => {
  const reader = readers({ expired: true });
  const state = await reader.readProtocolSnapshot(reader.context);
  assert.equal(state.protocol.metrics.rewardApy, 0);
});

test("snapshot service failure propagates despite a populated legacy manifest", async () => {
  const failure = new ProtocolError("Protocol totals are temporarily unavailable.", 503);
  const reader = readers({ legacy: true, failure });
  await assert.rejects(reader.readProtocolSnapshot(reader.context), (error) => error === failure);
  assert.equal(reader.readProtocolTotals.mock.callCount(), 1);
  assert.equal(reader.getLogs.mock.callCount(), 0);
});

test("connected portfolios retain account data while using service totals and holder-only activation logs", async () => {
  const reader = readers({ legacy: true });
  const state = await reader.readWalletPortfolioState(owner, reader.context);
  assert.deepEqual(state.account, { ...reader.account, activationPaid: 12 });
  assert.equal(reader.account.activationPaid, -1, "the base account must not be mutated");
  assert.equal(reader.nftFetch.mock.callCount(), 1);
  assert.equal(reader.indexed.mock.callCount(), 1);
  const index = reader.indexed.mock.calls[0].arguments[2];
  assert.deepEqual([...index.nfts.values()], [
    { collection: "Genesis", id: 11n, owner }, { collection: "Generations", id: 5n, owner },
  ]);
  assert.equal(reader.getLogs.mock.callCount(), 1);
  const query = reader.getLogs.mock.calls[0].arguments[0] as { args: unknown; fromBlock: bigint; toBlock: bigint };
  assert.deepEqual(query.args, { holder: owner });
  assert.equal(query.fromBlock, 100n);
  assert.equal(query.toBlock, liveBlock.number);
  assert.equal(reader.readProtocolTotals.mock.callCount(), 1);
  assert.equal(state.protocol.metrics.friendsPlaying, 5);
  assert.equal(state.protocol.metrics.genesisWeight, 200);
  assert.equal(state.protocol.metrics.generationsWeight, 50);
  assert.equal(state.protocol.metrics.rewardApy, reader.indexed.mock.calls[0].arguments[3].protocol.metrics.rewardApy);
});
