import type { Abi, Address, Hex } from "viem";
import type { ActionQuote, PortfolioAction, ProtocolAccount, RewardAsset, SwapQuote } from "./model";

export interface ProtocolConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  contracts: Record<string, Address>;
  /** Sanitized public addresses/ABIs; contains no server RPC, keys or wallet accounts. */
  deployment?: { deploymentBlock: string; contracts: Record<string, { address: Address; abi: Abi; deploymentBlock?: string }> };
  launch: { chainId: number; chainName: string; rpcUrl: string; explorerUrl?: string; auctionAddress: Address; auctionDeploymentBlock: string; tokenAddress: Address; wethAddress?: Address } | null;
  localAccounts?: Address[];
}

export interface ProtocolData {
  reserve: ReserveStatus;
  metrics: { initialSupply: number; supplyBurned: number; vaultInventory: number; ammVolumeEth: number; ammVolumeUsd: number; activatedGenesis: number; genesisWeight: number; generationsWeight: number; distributedRf: number; distributedWeth: number; distributedUsd: number;
    /** Unreleased reward-stream balance still to pay, and this UTC week's dripped rewards; when available in the current snapshot. */
    streamRemainingRf?: number; streamRemainingWeth?: number; streamRemainingUsd?: number; weekRewardsRf?: number; weekRewardsWeth?: number; weekRewardsUsd?: number;
    /** Annualized active stream rewards over cumulative RF activation payments, in percent. */
    rewardApy?: number;
    /** Friends (Genesis + Generations) currently holding an active reward position. */
    friendsPlaying?: number };
  streams: { asset: RewardAsset; start: number; end: number; budget: number; dripped: number; pending: number; remaining?: number }[];
  weekly: { start: number; rf: number; weth: number; partial: boolean }[];
  holderWeekly: { start: number; rf: number; weth: number; partial: boolean }[];
  prices: { ethUsd: number; rfUsd: number; label: string; usdAvailable?: boolean; usdSource?: "coingecko" | null;
    /** Price observation time in Unix milliseconds; independent of the chain snapshot. */
    usdUpdatedAt?: number | null; usdStale?: boolean };
  /** Historical totals may trail live contract views by the service's five-minute schedule. */
  coverage: { metricsBlockNumber?: string; metricsTimestamp?: number; fromBlock: string; toBlock: string; rewards: "since-deployment"; portfolio: "current-snapshot"; nfts: "known-collections" };
  marketReady: boolean;
}

/** Public display fields; account histories and reward schedules keep their own scope. */
export interface PublicProtocolSnapshot {
  protocol: Pick<ProtocolData, "metrics" | "reserve" | "prices" | "marketReady" | "coverage">;
  blockNumber: string;
  updatedAt: number;
}

export interface ReserveStatus {
  chainId: number;
  address: Address;
  blockNumber: string;
  marketAddress: Address;
  marketSeeded: boolean;
  conversionEnabled: boolean;
  retired: boolean;
  rfBalance: string;
  rfDecimals: number;
  inventoryCount: string;
  conversionFee: string;
  conversionPayout: string;
  conversionAvailable: boolean;
  conversionReasons: string[];
  swapsAvailable: boolean;
  plannedBacking: string | null;
  liquidityAllocation: string | null;
}

export interface ProtocolState {
  account: ProtocolAccount | null;
  protocol: ProtocolData;
  blockNumber: string;
  timestamp: number;
}

export interface PrepareRequest {
  address: Address;
  action?: PortfolioAction & { collection?: "Genesis" | "Generations" };
  swap?: { buy: boolean; amount: string; slippageBps: number; payWith?: "ETH" | "WETH" };
}

export interface PreparedPlan {
  quote: ActionQuote;
  steps: { label: string; transaction: { from: Address; to: Address; data: Hex; value?: Hex; chainId?: Hex } }[];
  swapQuote?: SwapQuote;
  /** Sell output settles in WETH. Unwrap only the net amount decoded from the swap receipt. */
  unwrap?: { wethAddress: Address };
  blockNumber: string;
  chainId: number;
  address: Address;
  request: PrepareRequest;
  exact: { cost: string; receive: string; amountIn?: string; amountOut?: string; minimumReceived?: string; expectedGeneration?: number; deadline?: string };
  quoteMethod?: "eth_call";
}
