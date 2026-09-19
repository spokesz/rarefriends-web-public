import type { Address } from "viem";
import type { ProtocolData } from "../../features/protocol/types";

export const REWARD_WEEK_SECONDS = 604_800;
/** One Allocated reward cycle; the contract drips `rate` per second from `start` to `finish`. */
export type RewardStreamCycle = { start: number; finish: number; rate: bigint; budget: bigint };
export type PublicMetricTotals = {
  ammVolume: bigint; claimedRf: bigint; claimedWeth: bigint;
  positions: Map<string, { collection: string; id: bigint; weight: bigint }>;
  /** The latest two cycles per asset: enough to cover any UTC week that spans an allocation. */
  cycles: Record<"RF" | "WETH", RewardStreamCycle[]>;
  /** RF everyone has paid to activate, summed over every Activated event's payment. */
  activationPaid: bigint;
};
export type PublicMetricEvent = { name: string; contract: string; args: Record<string, unknown> };
const amount = (value: unknown) => { if (typeof value !== "bigint" || value < 0n) throw new Error("Invalid public metric amount."); return value; };
const lower = (value: unknown) => { if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Invalid public metric address."); return value.toLowerCase(); };
export function emptyPublicMetricTotals(): PublicMetricTotals { return { ammVolume: 0n, claimedRf: 0n, claimedWeth: 0n, positions: new Map(), cycles: { RF: [], WETH: [] }, activationPaid: 0n }; }

/** Same accounting as readProtocolState, retaining aggregates instead of event history. */
export function applyPublicMetricEvent(totals: PublicMetricTotals, event: PublicMetricEvent, addresses: Record<string, Address>): void {
  const args = event.args;
  if (event.contract === "Market" && event.name === "Swapped") {
    if (typeof args.buy !== "boolean") throw new Error("Invalid swap direction.");
    totals.ammVolume += amount(args.buy ? args.amountIn : args.amountOut);
  }
  if (event.contract !== "ActivationManager") return;
  if (event.name === "Claimed") {
    const asset = lower(args.asset);
    if (asset === addresses.RF.toLowerCase()) totals.claimedRf += amount(args.amount);
    if (asset === addresses.WETH.toLowerCase()) totals.claimedWeth += amount(args.amount);
  }
  if (event.name === "Allocated") {
    const asset = lower(args.asset) === addresses.RF.toLowerCase() ? "RF" : lower(args.asset) === addresses.WETH.toLowerCase() ? "WETH" : null;
    if (asset) {
      const budget = amount(args.amount), finish = Number(amount(args.finish));
      if (!Number.isSafeInteger(finish) || finish <= 0) throw new Error("Invalid reward cycle finish.");
      const cycles = totals.cycles[asset].filter(cycle => cycle.finish !== finish);
      cycles.push({ start: finish - REWARD_WEEK_SECONDS, finish, rate: budget / BigInt(REWARD_WEEK_SECONDS), budget });
      totals.cycles[asset] = cycles.sort((left, right) => left.finish - right.finish).slice(-2);
    }
  }
  if (event.name === "Activated" || event.name === "ActivationCleared") {
    const collection = lower(args.collection);
    const id = amount(args.tokenId);
    const key = `${collection}:${id}`;
    if (event.name === "Activated") { totals.positions.set(key, { collection, id, weight: amount(args.weight) }); totals.activationPaid += amount(args.payment); }
    else totals.positions.delete(key);
  }
}
const mondayOf = (at: number) => Math.floor((at + 259_200) / REWARD_WEEK_SECONDS) * REWARD_WEEK_SECONDS - 259_200;

/**
 * Rate-based view of one asset's reward stream at `at` (unix seconds): everything still to pay (the
 * unreleased cycle balance plus pending fees), and what has dripped in the current Monday-to-Sunday UTC week. `live` is the ActivationManager
 * `streams(asset)` tuple (pending, rate, finish, lastUpdate, …); its cycle is merged with recorded
 * allocations so a restored aggregate without history still covers the running cycle. Drip is counted
 * only while activated weight exists; the wallet reader's event timeline agrees whenever weight was
 * present for the whole week, which has held since launch.
 */
export function rewardStreamProjection(cycles: readonly RewardStreamCycle[], live: readonly bigint[], at: number, weighted: boolean): { remaining: bigint; week: bigint; rate: bigint; pending: bigint } {
  const [pending = 0n, rate = 0n, finish = 0n, lastUpdate = 0n] = live;
  if (pending < 0n || rate < 0n || finish < 0n || lastUpdate < 0n || !Number.isSafeInteger(at) || at < 0) throw new Error("Invalid reward stream state.");
  const accountedUntil = BigInt(at) > lastUpdate ? BigInt(at) : lastUpdate;
  // Still to pay: the running cycle's unreleased balance plus fees waiting for the next allocation.
  const remaining = (finish > accountedUntil ? rate * (finish - accountedUntil) : 0n) + pending;
  const all = [...cycles];
  if (finish > 0n && Number.isSafeInteger(Number(finish)) && !all.some(cycle => cycle.finish === Number(finish))) {
    all.push({ start: Number(finish) - REWARD_WEEK_SECONDS, finish: Number(finish), rate, budget: rate * BigInt(REWARD_WEEK_SECONDS) });
  }
  let week = 0n;
  if (weighted) {
    const weekStart = mondayOf(at);
    for (const cycle of all) {
      const from = Math.max(cycle.start, weekStart), to = Math.min(cycle.finish, at);
      if (to > from) week += cycle.rate * BigInt(to - from);
    }
  }
  // The current drip rate per second, zero once the cycle has finished.
  return { remaining, week, rate: finish > BigInt(at) ? rate : 0n, pending };
}

const toUnits = (value: bigint) => Number(value) / 1e18;
/**
 * APR = active stream's weekly rewards (USD) ÷ RF everyone paid to activate (USD)
 * × (365 ÷ 7) × 100. The cycle rewards are the running allocation's per-second rates times a week, zero once the
 * cycle has finished. Pending fees are excluded.
 */
export function rewardApyPercent(rates: { rateRf: bigint; rateWeth: bigint; pendingRf: bigint; pendingWeth: bigint }, activationPaid: bigint, prices: { rfUsd: number; ethUsd: number }): number {
  const paid = toUnits(activationPaid) * prices.rfUsd;
  if (!(paid > 0)) return 0;
  const weekly = toUnits(rates.rateRf) * REWARD_WEEK_SECONDS * prices.rfUsd
    + toUnits(rates.rateWeth) * REWARD_WEEK_SECONDS * prices.ethUsd;
  return weekly / paid * (365 / 7) * 100;
}

export function publicMetricValues(totals: PublicMetricTotals,
  inputs: { initialSupply: bigint; currentSupply: bigint; inventory: bigint; prices: ProtocolData["prices"];
    streamRemainingRf: bigint; streamRemainingWeth: bigint; weekRewardsRf: bigint; weekRewardsWeth: bigint; rewardRateRf: bigint; rewardRateWeth: bigint; pendingRf: bigint; pendingWeth: bigint },
  addresses: Record<string, Address>): ProtocolData["metrics"] {
  const { initialSupply, currentSupply, inventory, prices, streamRemainingRf, streamRemainingWeth, weekRewardsRf, weekRewardsWeth, rewardRateRf, rewardRateWeth, pendingRf, pendingWeth } = inputs;
  if (currentSupply > initialSupply || initialSupply < 0n || currentSupply < 0n || inventory < 0n) throw new Error("Invalid protocol supply.");
  if ([streamRemainingRf, streamRemainingWeth, weekRewardsRf, weekRewardsWeth, rewardRateRf, rewardRateWeth, pendingRf, pendingWeth].some(value => value < 0n)) throw new Error("Invalid reward stream totals.");
  let genesisWeight = 0n, generationsWeight = 0n, activatedGenesis = 0;
  for (const position of totals.positions.values()) {
    if (position.collection === addresses.Genesis.toLowerCase()) { activatedGenesis++; genesisWeight += position.weight; }
    else generationsWeight += position.weight;
  }
  const units = (value: bigint) => Number(value) / 1e18;
  const metrics = { initialSupply: units(initialSupply), supplyBurned: units(initialSupply - currentSupply), vaultInventory: Number(inventory),
    ammVolumeEth: units(totals.ammVolume), ammVolumeUsd: units(totals.ammVolume) * prices.ethUsd, activatedGenesis,
    genesisWeight: units(genesisWeight), generationsWeight: units(generationsWeight), distributedRf: units(totals.claimedRf), distributedWeth: units(totals.claimedWeth),
    distributedUsd: units(totals.claimedRf) * prices.rfUsd + units(totals.claimedWeth) * prices.ethUsd,
    streamRemainingRf: units(streamRemainingRf), streamRemainingWeth: units(streamRemainingWeth),
    streamRemainingUsd: units(streamRemainingRf) * prices.rfUsd + units(streamRemainingWeth) * prices.ethUsd,
    weekRewardsRf: units(weekRewardsRf), weekRewardsWeth: units(weekRewardsWeth),
    weekRewardsUsd: units(weekRewardsRf) * prices.rfUsd + units(weekRewardsWeth) * prices.ethUsd,
    rewardApy: rewardApyPercent({ rateRf: rewardRateRf, rateWeth: rewardRateWeth, pendingRf, pendingWeth }, totals.activationPaid, prices),
    friendsPlaying: totals.positions.size };
  if (!Object.values(metrics).every(value => Number.isFinite(value) && value >= 0) || !Number.isSafeInteger(metrics.vaultInventory)) throw new Error("Protocol metrics exceed supported display bounds.");
  return metrics;
}
