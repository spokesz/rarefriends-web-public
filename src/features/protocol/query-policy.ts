/**
 * The browser cancels in-flight reads when a wallet app or deep link takes over the tab.
 * That is not a failed read, so it is read again; every other error still surfaces at once.
 */
export const retryCancelledRead = (failures: number, error: Error) => error.name === "AbortError" && failures < 3;

/** Display snapshots live in the QueryClient for this browser session, not a timer. */
export const sessionDisplayCache = {
  gcTime: Infinity,
  refetchInterval: false,
  refetchOnReconnect: false,
  retry: retryCancelledRead,
} as const;

export const metadataReadPolicy = {
  ...sessionDisplayCache,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
} as const;

export function protocolReadPolicy(pathname: string | null, walletReady: boolean) {
  const portfolio = pathname === "/portfolio" || Boolean(pathname?.startsWith("/portfolio/"));
  const homepage = pathname === "/";
  return {
    ...sessionDisplayCache,
    kind: portfolio ? "portfolio" : "protocol",
    includeAccount: portfolio,
    // The homepage reads protocol figures for every visitor; portfolios need a ready wallet.
    enabled: homepage || portfolio && walletReady,
    staleTime: portfolio ? 60_000 : 5 * 60_000,
    refetchOnWindowFocus: portfolio,
  } as const;
}

/** Confirmed actions invalidate displays; transaction checks never use this cache. */
export const protocolDisplayQueryKeys = [["protocol-state"], ["protocol-wallet-balances"]] as const;
