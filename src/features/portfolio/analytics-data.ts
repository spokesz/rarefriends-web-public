import type { ProtocolData } from "../protocol/types";
import { claimableRewards, claimableWeth, friendWeight, type ProtocolAccount } from "../protocol/model";

export function formatAmount(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

export function getRewardOutlook(account: ProtocolAccount, protocol: ProtocolData) {
  const weight = account.friends.reduce((sum, friend) => sum + friendWeight(friend), 0);
  const totalWeight = protocol.metrics.genesisWeight + protocol.metrics.generationsWeight;
  const share = totalWeight > 0 ? Math.min(1, weight / totalWeight) : 0;
  const claimableRf = claimableRewards(account);
  const claimableWethAmount = claimableWeth(account);
  const assets = protocol.streams.map(stream => ({
    asset: stream.asset,
    claimable: stream.asset === "RF" ? claimableRf : claimableWethAmount,
    // This wallet's share of the unreleased allocation plus fees awaiting the next one.
    next: (Math.max(0, stream.remaining ?? stream.budget - stream.dripped) + stream.pending) * share,
  }));
  const value = (key: "claimable" | "next") => assets.reduce((sum, asset) => sum + asset[key] * (asset.asset === "RF" ? protocol.prices.rfUsd : protocol.prices.ethUsd), 0);
  return { assets, claimableUsd: value("claimable"), nextUsd: value("next") };
}

/**
 * This wallet's APR: its share (by activated weight) of the active stream's weekly rewards,
 * in USD, ÷ the RF it paid to activate (USD) × (365 ÷ 7) × 100. Null until the snapshot, prices and a
 * payment total are all known.
 */
export function holderApyPercent(account: ProtocolAccount, protocol?: ProtocolData, now = Date.now()): number | null {
  const paid = account.activationPaid;
  if (!protocol || paid === undefined || !(paid > 0)) return null;
  const { rfUsd, ethUsd } = protocol.prices;
  const totalWeight = protocol.metrics.genesisWeight + protocol.metrics.generationsWeight;
  if (!(rfUsd > 0) || !(ethUsd > 0) || !(totalWeight > 0)) return null;
  const weight = account.friends.reduce((sum, friend) => sum + friendWeight(friend), 0);
  const weekly = protocol.streams.reduce((sum, stream) => sum + (stream.end > now ? stream.budget : 0) * weight / totalWeight * (stream.asset === "RF" ? rfUsd : ethUsd), 0);
  return weekly / (paid * rfUsd) * (365 / 7) * 100;
}
