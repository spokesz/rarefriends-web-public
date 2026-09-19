"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { transactionContent as copy } from "@/src/content/transactions";
import { TransactionSteps } from "./transaction-steps";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { usePublicWallet } from "@/src/wallet/wallet-provider";
import { RF_SYMBOL, type ProtocolAccount, type PortfolioAction } from "./model";
import type { ProtocolState, ProtocolConfig, PreparedPlan, PublicProtocolSnapshot } from "./types";
import { isUserCancellation, portfolioTransferPlan, prepareTransaction, submitPlan, transactionError, type TransactionProgress } from "./transaction-client";
import { readWalletBalances, readServerProtocolState, type WalletBalances } from "../../wallet/wallet-chain";
import { walletRpcScope } from "../../wallet/wallet-rpc";
import { protocolDisplayQueryKeys, protocolReadPolicy, sessionDisplayCache } from "./query-policy";
import { useProtocolConfig } from "./use-config";
import type { Address } from "viem";

type Context = {
  account: ProtocolAccount | null;
  walletBalances: WalletBalances | null;
  config: ProtocolConfig | null;
  snapshot: ProtocolState | null;
  publicSnapshot: PublicProtocolSnapshot | null;
  publicError: string;
  publicLoading: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string;
  busy: boolean;
  progress: TransactionProgress | null;
  refresh(): Promise<void>;
  executeAction(action: PortfolioAction, plan?: PreparedPlan): Promise<{ ok: boolean; cancelled: boolean }>;
  swap(buy: boolean, amount: string | number, slippageBps?: number, payWith?: "ETH" | "WETH"): void;
};
const ProtocolContext = createContext<Context | null>(null);
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 6 });

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const wallet = usePublicWallet();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [pendingSwap, setPendingSwap] = useState<{ buy: boolean; amount: string; slippageBps: number; payWith?: "ETH" | "WETH" } | null>(null);
  const [swapResume, setSwapResume] = useState<{ key: string; plan: PreparedPlan } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const refreshVisible = useRef<() => Promise<void>>(async () => {});
  const [progress, setProgress] = useState<TransactionProgress | null>(null);
  const configQuery = useProtocolConfig();
  const config = configQuery.data ?? null;
  const scope = walletRpcScope(wallet);
  const walletReady = Boolean(wallet.address && config && wallet.chainId && BigInt(wallet.chainId) === BigInt(config.chainId));
  const routePolicy = protocolReadPolicy(pathname, walletReady);
  const publicEnabled = pathname === "/" || pathname === "/launch" || routePolicy.includeAccount;
  const readPolicy = { ...routePolicy, enabled: routePolicy.enabled && Boolean(config) };
  const stateQuery = useQuery<ProtocolState>({ queryKey: ["protocol-state", scope, config?.chainId, config?.contracts, wallet.address?.toLowerCase(), readPolicy.kind],
    queryFn: () => readServerProtocolState(readPolicy.includeAccount ? wallet.address as Address : undefined),
    ...readPolicy });
  const balancesQuery = useQuery({ queryKey: ["protocol-wallet-balances", scope, config?.chainId, config?.contracts.RF, wallet.address?.toLowerCase()],
    queryFn: () => readWalletBalances(config!, wallet, wallet.address as Address),
    ...sessionDisplayCache, staleTime: 60_000, refetchOnWindowFocus: false,
    enabled: walletReady && pathname === "/" && Boolean(config?.contracts.RF) });
  // Account data requires the matching wallet; public figures use the server state route.
  const snapshot = (walletReady || !routePolicy.includeAccount) ? stateQuery.data ?? null : null;
  const account = snapshot?.account ?? null;
  const walletBalances = walletReady ? balancesQuery.data ?? null : null;
  const walletPublic = snapshot && !stateQuery.error ? snapshot : null;
  const publicSnapshot: PublicProtocolSnapshot | null = !walletPublic ? null
    : { protocol: { metrics: walletPublic.protocol.metrics, reserve: walletPublic.protocol.reserve,
      prices: walletPublic.protocol.prices, marketReady: walletPublic.protocol.marketReady, coverage: walletPublic.protocol.coverage },
      blockNumber: walletPublic.blockNumber, updatedAt: stateQuery.dataUpdatedAt };
  const publicLoading = publicEnabled && (configQuery.isPending || readPolicy.enabled && stateQuery.isPending);
  const publicError = !publicEnabled ? "" : configQuery.error?.message
    || (readPolicy.enabled ? stateQuery.error?.message : undefined) || "";
  const swapQuery = useQuery({ queryKey: ["protocol-swap-review", scope, config?.chainId, wallet.address, pendingSwap],
    queryFn: ({ signal }) => prepareTransaction({ address: wallet.address!, swap: pendingSwap! }, config!, wallet, signal),
    enabled: walletReady && Boolean(pendingSwap), staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false });
  const swapKey = JSON.stringify([scope, wallet.address?.toLowerCase(), pendingSwap]);
  const reviewedSwap = swapResume?.key === swapKey ? swapResume.plan : swapQuery.data;
  const swapQuote = reviewedSwap?.swapQuote;

  async function invalidateDisplays() {
    // Mark other visited pages stale without waking their inactive observers.
    await Promise.all(protocolDisplayQueryKeys.map(queryKey => queryClient.invalidateQueries({ queryKey, refetchType: "none" })));
  }

  // A transaction may finish after navigation. Its callbacks always refresh the
  // currently visible route, never the portfolio that started the transaction.
  useEffect(() => {
    refreshVisible.current = async () => {
      if (!walletReady || walletRpcScope(wallet) !== scope) return;
      const reads: Promise<unknown>[] = [
        ...(readPolicy.enabled ? [stateQuery.refetch()] : []),
        ...(pathname === "/" && config?.contracts.RF ? [balancesQuery.refetch()] : []),
      ];
      await Promise.all(reads);
    };
  });

  async function refreshVisibleDisplays() {
    if (!walletReady || walletRpcScope(wallet) !== scope) return;
    await refreshVisible.current();
  }

  async function refresh() {
    if (!walletReady || walletRpcScope(wallet) !== scope) return;
    await invalidateDisplays();
    await refreshVisibleDisplays();
  }

  async function executeAction(value: PortfolioAction, reviewedPlan?: PreparedPlan): Promise<{ ok: boolean; cancelled: boolean }> {
    if (locked.current) return { ok: false, cancelled: false };
    locked.current = true;
    setBusy(true);
    setMessage("");
    let received = false;
    try {
      if (!wallet.address || !config) throw new Error(copy.connect);
      const input = { address: wallet.address, action: value };
      const immediate = value.kind === "claim" || value.kind === "withdraw";
      if (immediate && !snapshot) throw new Error("Refresh your portfolio before continuing.");
      const plan = immediate ? portfolioTransferPlan(wallet.address as Address, value, config, snapshot!)
        : reviewedPlan ?? await prepareTransaction(input, config, wallet);
      await submitPlan({ wallet, config, input, plan, onProgress: setProgress,
        onReceipt: async () => { received = true;
          await invalidateDisplays(); } });
      setMessage(`${plan.quote.title} · confirmed`);
      return { ok: true, cancelled: false };
    } catch (error) {
      setMessage(transactionError(error));
      return { ok: false, cancelled: isUserCancellation(error) };
    } finally {
      // Approvals and wrapping can confirm before the final action. Refresh once
      // after completion or partial failure, never between transaction steps.
      try { if (received) await refreshVisibleDisplays(); }
      finally { locked.current = false; setBusy(false); setProgress(null); }
    }
  }

  async function confirmSwap() {
    if (locked.current || !pendingSwap) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    let received = false;
    try {
      if (!wallet.address || !config || !reviewedSwap) throw new Error(copy.waitForQuote);
      const result = await submitPlan({ wallet, config, input: { address: wallet.address, swap: pendingSwap }, plan: reviewedSwap,
        onProgress: setProgress, onReceipt: async () => { received = true;
          await invalidateDisplays(); },
        onStepConfirmed: steps => setSwapResume({ key: swapKey, plan: { ...reviewedSwap, steps } }) });
      setMessage(result.notice ?? copy.swapConfirmed);
      setPendingSwap(null);
    } catch (error) { setMessage(transactionError(error)); }
    finally {
      try { if (received) await refreshVisibleDisplays(); }
      finally { locked.current = false; setBusy(false); setProgress(null); }
    }
  }

  return <ProtocolContext.Provider value={{ account, walletBalances, config, snapshot,
    publicSnapshot, publicError, publicLoading,
    loading: configQuery.isPending || readPolicy.enabled && stateQuery.isPending,
    refreshing: readPolicy.enabled && stateQuery.isFetching,
    error: (readPolicy.enabled ? stateQuery.error?.message : undefined) ?? configQuery.error?.message ?? "", busy, progress, refresh, executeAction,
    swap: (buy, amount, slippageBps = 100, payWith) => { if (!locked.current && wallet.address) { setMessage(""); setSwapResume(null); setPendingSwap({ buy, amount: String(amount), slippageBps, ...(buy && payWith === "WETH" ? { payWith } : {}) }); } } }}>
    {children}
    {(message || progress) && <div className="app-notice" role="status"><span>{progress ? `${progress.step ? `${progress.step}/${progress.total} · ` : ""}${progress.label}` : message}</span>{!progress && <button type="button" aria-label="Dismiss notification" onClick={() => setMessage("")}>[ close ]</button>}</div>}
    <Dialog open={Boolean(pendingSwap)} title={copy.swap.title} onClose={() => { if (!busy) setPendingSwap(null); }}
      actions={<><Button disabled={busy} onClick={() => setPendingSwap(null)}>{copy.cancel}</Button><Button variant="primary" disabled={busy || !swapQuote?.enabled || swapQuery.isFetching} onClick={confirmSwap}>{busy ? copy.confirming : copy.swap.confirm}</Button></>}>
      {pendingSwap && <div className="stack-md"><span className="app-eyebrow">{copy.swap.quote}</span>
        <dl className="app-review"><div><dt>{copy.swap.pay}</dt><dd>{pendingSwap.amount} {pendingSwap.buy ? pendingSwap.payWith ?? "ETH" : RF_SYMBOL}</dd></div>
          <div><dt>{copy.swap.receive}</dt><dd>{swapQuote ? number(swapQuote.output) : "…"} {pendingSwap.buy ? RF_SYMBOL : "ETH"}</dd></div>
          <div><dt>{copy.swap.minimum}</dt><dd>{swapQuote ? number(swapQuote.minimumReceived) : "…"} {pendingSwap.buy ? RF_SYMBOL : "ETH"}</dd></div>
          <div><dt>{copy.swap.fee}</dt><dd>{swapQuote ? number(swapQuote.fee) : "…"} ETH</dd></div></dl>
        <TransactionSteps plan={reviewedSwap} progress={progress} selling={!pendingSwap.buy} />
        {swapQuery.error && <p role="alert">{swapQuery.error.message}</p>}
        {swapQuote && !swapQuote.enabled && <p role="alert">{swapQuote.reason}</p>}
        <p className="app-muted">{pendingSwap.buy ? pendingSwap.payWith === "WETH" ? copy.swap.weth : copy.swap.eth : copy.swap.sell}</p>
      </div>}
    </Dialog>
  </ProtocolContext.Provider>;
}

export function useProtocol() {
  const value = useContext(ProtocolContext);
  if (!value) throw new Error("Protocol provider is missing.");
  return value;
}
