"use client";

import { useState } from "react";
import { transactionContent as copy } from "@/src/content/transactions";
import { TransactionSteps } from "./transaction-steps";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/src/components/ui/button";
import { usePublicWallet } from "@/src/wallet/wallet-provider";
import { RF_SYMBOL, type PortfolioAction, type ProtocolAccount } from "./model";
import { useProtocol } from "./protocol-provider";
import { prepareTransaction } from "./transaction-client";
import { walletRpcScope } from "../../wallet/wallet-rpc";

/** Uses the portfolio's existing inline review for every required contract step. */
export function ActionReview({ action, account, onBack, onDone }: {
  action: PortfolioAction; account: ProtocolAccount; onBack(): void; onDone(): void;
}) {
  const { executeAction, busy, progress, config } = useProtocol();
  const wallet = usePublicWallet();
  const { address } = wallet;
  const [accepted, setAccepted] = useState(false);
  const query = useQuery({ queryKey: ["protocol-action-review", walletRpcScope(wallet), config?.chainId, address, action],
    queryFn: ({ signal }) => prepareTransaction({ address: address!, action }, config!, wallet, signal),
    enabled: Boolean(address && config), staleTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false });
  const quote = query.data?.quote;
  const symbol = quote?.asset === "ETH" ? "ETH" : quote?.asset === "WETH" ? "WETH" : RF_SYMBOL;
  const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: quote?.asset === "RF" ? 4 : 6 });
  const balance = quote?.asset === "ETH" ? account.eth : quote?.asset === "WETH" ? account.weth : account.tokenBalance;
  const convert = action.kind === "convert";
  return <div className="app-fp-review app-live-review" aria-label="Review transaction">
    <span className="app-fp-label">{copy.review}</span>
    <h3>{quote?.title ?? copy.loadingQuote}</h3>
    {quote && <><p>{quote.description}</p><dl>
      <div><dt>cost</dt><dd>{number(quote.cost)} {symbol}</dd></div>
      {quote.receive > 0 && <div><dt>receive</dt><dd>{number(quote.receive)} {symbol}</dd></div>}
      <div><dt>{quote.asset === "ETH" ? "connected wallet after · before gas" : "balance after · estimated"}</dt><dd>{number(balance - quote.cost + quote.receive)} {symbol}</dd></div>
      <div><dt>{copy.networkFee}</dt><dd>{copy.walletFee}</dd></div>
    </dl></>}
    {!query.error && <TransactionSteps plan={query.data} progress={progress} />}
    {convert && <label className="app-fp-acknowledge"><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /><span>{copy.conversionAcknowledgment}</span></label>}
    {query.error && <p className="app-fp-action-error" role="alert">{query.error.message}</p>}
    {quote && !quote.enabled && <p className="app-fp-action-error" role="alert">{quote.reason}</p>}
    <div className="app-fp-review-buttons"><Button size="sm" disabled={busy} onClick={onBack}>{copy.back}</Button>
      {query.error && <Button size="sm" disabled={busy} onClick={() => void query.refetch()}>{copy.refresh}</Button>}
      <Button size="sm" variant="primary" preserveCase disabled={busy || !quote?.enabled || query.isFetching || (convert && !accepted)} onClick={async () => {
        if ((await executeAction(action, query.data)).ok) onDone();
        else await query.refetch();
      }}>{busy ? copy.confirming : `confirm ${action.kind}`}</Button>
    </div>
    <p className="app-fp-note">{copy.confirmationNote}</p>
  </div>;
}
