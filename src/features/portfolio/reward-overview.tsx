"use client";

import { portfolioContent as copy } from "@/src/content/portfolio";
import { Button } from "@/src/components/ui/button";
import { useUsdFormat } from "../protocol/use-usd-format";
import { formatAmount, getRewardOutlook, holderApyPercent } from "./analytics-data";
import { useProtocol } from "../protocol/protocol-provider";
import { friendWeight, type ProtocolAccount } from "../protocol/model";

export function PortfolioSummary({ account, earningFilter, onFilter }: {
  account: ProtocolAccount | null;
  earningFilter: "all" | "not-earning" | "earning";
  onFilter: (value: "all" | "not-earning" | "earning") => void;
}) {
  const { snapshot, loading } = useProtocol();
  const usd = useUsdFormat();
  const protocol = snapshot?.protocol;
  const outlook = account && protocol ? getRewardOutlook(account, protocol) : null;
  const apy = account && protocol ? holderApyPercent(account, protocol) : null;
  const friends = account?.friends ?? [];
  const earningCount = friends.filter(friend => friendWeight(friend) > 0).length;
  const emptyRewards = loading ? copy.summary.loading : account ? copy.summary.unavailable : copy.disconnected;

  return <section className="app-pf-summary" aria-label="Portfolio summary">
    <div className="app-pf-earning-summary">
      <button type="button" aria-pressed={earningFilter === "not-earning"} onClick={() => onFilter(earningFilter === "not-earning" ? "all" : "not-earning")}><span><i className="app-pf-status-square" />{copy.summary.inactive}</span><strong>{account ? friends.length - earningCount : "—"}</strong></button>
      <button type="button" aria-pressed={earningFilter === "earning"} onClick={() => onFilter(earningFilter === "earning" ? "all" : "earning")}><span><i className="app-pf-status-square" data-earning />{copy.summary.earning}</span><strong>{account ? earningCount : "—"}</strong></button>
      <div className="app-pf-summary-reward">
        <span>{copy.summary.claimable}</span>
        <strong>{outlook ? usd(outlook.claimableUsd) : "—"}</strong>
        <small>{outlook ? outlook.assets.map(asset => `${formatAmount(asset.claimable, asset.asset === "WETH" ? 5 : 2)} ${asset.asset}`).join(" + ") : emptyRewards}</small>
      </div>
      <div className="app-pf-summary-reward">
        <span>{copy.summary.pending}</span>
        <strong>{outlook ? usd(outlook.nextUsd) : "—"}</strong>
        <small>{outlook ? copy.summary.estimate : emptyRewards}</small>
      </div>
      <div className="app-pf-summary-reward app-pf-summary-apy">
        <span>{copy.summary.apy}</span>
        <strong>{apy !== null ? `${formatAmount(apy, 2)}%` : "—"}</strong>
        <small>{apy !== null ? copy.summary.apyAnnualized : account && protocol ? copy.summary.apyBasis : emptyRewards}</small>
        {account?.address && <Button size="sm" href={`https://rare-friends-cards.vercel.app/card/${account.address}`} target="_blank" rel="noopener noreferrer">{copy.summary.share}</Button>}
      </div>
    </div>
  </section>;
}
