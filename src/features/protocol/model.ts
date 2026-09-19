/**
 * Protocol account types and display projections. Display amounts use UI units;
 * wallet tokens also retain exact balances for withdrawal calldata.
 */
export const RF_SYMBOL = "$RAREFRIENDS";
export type RewardAsset = "RF" | "WETH";
export type WalletAsset = RewardAsset | "ETH";
export const DENOMINATIONS: Record<number, number> = { 1: 100_000, 2: 10_000, 3: 1_000, 4: 100, 5: 10, 6: 1 };
export const GENESIS_DENOMINATION = 1_000_000;
export const GENESIS_ACTIVATION_COST = 100_000;
export const GENESIS_CONVERSION_FEE = 100_000;
export const GENESIS_CONVERSION_RECEIVE = 1_000_000;
export const TIER_MULTIPLIERS = [1, 1.33, 1.66, 2, 3.33] as const;
export const TIER_CUMULATIVE_BPS = [1000, 2500, 5500, 10_000, 25_000] as const;
const FRIEND_TIER_CUMULATIVE_BPS = [10_000, 15_000, 22_500, 33_750, 50_625] as const;
const GENERATION_WEIGHT_BPS = [0, 17_500, 16_000, 14_500, 13_000, 12_000, 11_000] as const;

export interface PortfolioFriend {
  id: number;
  collection: "Genesis" | "Generations";
  generation: number;
  tier: number;
  activated: boolean;
  hardwired: boolean;
  /** Accrued RF credit for this NFT under per-Friend reward accounting. */
  earnings: number;
  /** Accrued WETH credit, separate from claimed assets in the NFT wallet. */
  earningsWeth?: number;
  portrait: number;
  /** Authoritative on-chain artwork for wallet holdings. */
  imageUrl?: string;
  /** Wallet contents, when available in the chain snapshot. */
  wallet?: FriendWallet | null;
  weight?: number;
}

/** ERC-6551 contents, including rewards already claimed into this wallet. */
export interface FriendWallet {
  address: string;
  tokens: { symbol: string; name: string; balance: number; rawBalance?: string; usd: number }[];
  nfts: { collection: string; name: string; id: number; portrait: number; imageUrl?: string }[];
  totalUsd: number;
}

/** Wallet contents are supplied by the chain snapshot. */
export function friendWallet(friend: PortfolioFriend): FriendWallet | null {
  return friend.wallet ?? null;
}

export interface PortfolioEvent { id: string; title: string; at: number; amount?: string }
export interface ProtocolAccount {
  live?: boolean;
  /** Deployed reward architecture; each snapshot specifies its accounting model. */
  rewardAccounting?: "friend" | "holder";
  /** Liquid balances valued at the snapshot price; live NFT marks are excluded. */
  valueUsd?: number;
  address?: string;
  eth: number;
  weth: number;
  tokenBalance: number;
  friends: PortfolioFriend[];
  activity: PortfolioEvent[];
  /** Snapshot history: value in USD; cumulative earnings tracked per asset. */
  history: { at: number; value: number; earnings: number; earningsWeth?: number }[];
  claimed: number;
  claimedWeth: number;
  /** RF this wallet paid to activate or upgrade friends; present on server reads. */
  activationPaid?: number;
  /** Aggregate NFT credits for Friend accounting; separate credits for holder accounting. */
  rewardCredit?: number;
  rewardCreditWeth: number;
}

export interface PortfolioAction {
  kind: "hardwire" | "promote" | "upgrade" | "activate" | "convert" | "claim" | "withdraw";
  friendId?: number;
  collection?: PortfolioFriend["collection"];
  /** Claims use RF/WETH; withdrawals also support native ETH. */
  asset?: WalletAsset;
}
export interface ActionQuote {
  title: string;
  cost: number;
  receive: number;
  asset: WalletAsset;
  rewardDestination?: "friend-wallet" | "connected-wallet";
  description: string;
  enabled: boolean;
  reason?: string;
}

export function friendDenomination(friend: PortfolioFriend): number {
  return friend.collection === "Genesis" ? GENESIS_DENOMINATION : DENOMINATIONS[friend.generation] ?? 0;
}

export function friendWeight(friend: PortfolioFriend): number {
  if (!friend.activated || !friend.hardwired) return 0;
  if (friend.weight !== undefined) return friend.weight;
  return scheduledFriendWeight(friend);
}

/** Project contract-defined weight without reusing an earlier onchain position. */
export function scheduledFriendWeight(friend: PortfolioFriend, accounting: ProtocolAccount["rewardAccounting"] = "friend"): number {
  if (!friend.activated || !friend.hardwired) return 0;
  if (accounting === "friend") {
    if (friend.collection === "Genesis") return GENESIS_DENOMINATION * 2;
    const cumulative = FRIEND_TIER_CUMULATIVE_BPS[friend.tier];
    const base = GENERATION_WEIGHT_BPS[friend.generation];
    if (cumulative === undefined || !base) return 0;
    const multiplier = base + friend.tier * (friend.generation === 1 ? 500 : 250);
    return friendDenomination(friend) * cumulative * multiplier / 100_000_000;
  }
  const multiplier = friend.collection === "Genesis" ? 2 : 1.85 - friend.generation * 0.1;
  return friendDenomination(friend) * multiplier * (TIER_MULTIPLIERS[friend.tier] ?? 0);
}

export function hardwireGeneration(balance: number): number | null {
  for (let generation = 1; generation <= 6; generation++) {
    if (balance >= DENOMINATIONS[generation]) return generation;
  }
  return null;
}

export function claimableRewards(account: ProtocolAccount): number {
  const friends = account.friends.reduce((sum, friend) => sum + friend.earnings, 0);
  return account.rewardAccounting === "friend" ? friends : (account.rewardCredit ?? 0) + friends;
}

export function claimableWeth(account: ProtocolAccount): number {
  const friends = account.friends.reduce((sum, friend) => sum + (friend.earningsWeth ?? 0), 0);
  return account.rewardAccounting === "friend" ? friends : (account.rewardCreditWeth ?? 0) + friends;
}

/**
 * Every outstanding claim with a nonzero balance, for a single "claim all" action.
 * Friend accounting claims per-(friend, asset); holder accounting claims a single
 * wallet-level balance per asset instead, with no friendId.
 */
export function claimTargets(account: ProtocolAccount): PortfolioAction[] {
  if (account.rewardAccounting === "friend") {
    return account.friends.flatMap(friend => [
      ...(friend.earnings > 0 ? [{ kind: "claim" as const, friendId: friend.id, collection: friend.collection, asset: "RF" as const }] : []),
      ...((friend.earningsWeth ?? 0) > 0 ? [{ kind: "claim" as const, friendId: friend.id, collection: friend.collection, asset: "WETH" as const }] : []),
    ]);
  }
  return [
    ...(claimableRewards(account) > 0 ? [{ kind: "claim" as const, asset: "RF" as const }] : []),
    ...(claimableWeth(account) > 0 ? [{ kind: "claim" as const, asset: "WETH" as const }] : []),
  ];
}

function selectedFriend(account: ProtocolAccount, action: PortfolioAction): PortfolioFriend | undefined {
  return action.kind === "hardwire" && action.friendId === undefined
    ? account.friends.find(friend => friend.collection === "Generations" && !friend.hardwired)
    : account.friends.find(friend => friend.id === action.friendId && (!action.collection || friend.collection === action.collection));
}

export function actionQuote(account: ProtocolAccount, action: PortfolioAction): ActionQuote {
  const disabled = (title: string, reason: string): ActionQuote => ({ title, cost: 0, receive: 0, asset: "RF", description: reason, enabled: false, reason });
  if (action.kind === "claim") {
    const asset = action.asset ?? "RF";
    if (asset === "ETH") return disabled("Claim rewards", "Rewards are RF or WETH");
    const symbol = asset === "WETH" ? "WETH" : RF_SYMBOL;
    const friendRewards = account.rewardAccounting === "friend";
    const friend = selectedFriend(account, action);
    if (action.friendId !== undefined && (!friendRewards || !friend?.hardwired)) return disabled("Claim rewards", "Individual NFT rewards unavailable");
    const receive = friendRewards && action.friendId !== undefined
      ? asset === "WETH" ? friend?.earningsWeth ?? 0 : friend?.earnings ?? 0
      : asset === "WETH" ? claimableWeth(account) : claimableRewards(account);
    return { title: `Claim ${symbol} rewards`, cost: 0, receive, asset,
      rewardDestination: friendRewards ? "friend-wallet" : "connected-wallet",
      description: friendRewards ? `Recipient: ${friend ? `${friend.collection} #${friend.id} wallet` : "each NFT’s wallet"} · ${symbol} rewards` : `Recipient: connected wallet · ${symbol} holder rewards only`,
      enabled: receive > 0, ...(receive > 0 ? {} : { reason: `No claimable ${symbol}` }) };
  }
  const friend = selectedFriend(account, action);
  if (!friend) return disabled("Friend unavailable", "NFT no longer in this portfolio");
  if (action.kind === "withdraw") {
    const asset = action.asset;
    if (!asset) return disabled("Withdraw", "Select an asset");
    const wallet = friendWallet(friend);
    if (!friend.hardwired || !wallet) return disabled("Withdraw", "NFT wallet unavailable");
    const symbol = asset === "RF" ? RF_SYMBOL : asset;
    const receive = wallet.tokens.filter(token => token.symbol === symbol || asset === "RF" && token.symbol === "RF").reduce((sum, token) => sum + token.balance, 0);
    const enabled = Number.isFinite(receive) && receive > 0;
    return { title: `Withdraw ${symbol}`, cost: 0, receive, asset, enabled,
      description: `${friend.collection} #${friend.id} wallet → connected wallet · full ${symbol} balance`,
      ...(!enabled ? { reason: `No ${symbol} in this NFT wallet` } : {}) };
  }
  let title = "";
  let description = "";
  let cost = 0;
  let receive = 0;
  const denomination = friendDenomination(friend);

  switch (action.kind) {
    case "hardwire": {
      if (friend.collection !== "Generations" || friend.hardwired) return disabled("Already hardwired", "Permanent NFT");
      const generation = hardwireGeneration(account.tokenBalance);
      if (generation === null) return disabled("Hardwire friend", "Minimum balance: 1 $RAREFRIENDS");
      cost = DENOMINATIONS[generation];
      title = `Hardwire Generation ${generation}`;
      description = `Permanent Generation ${generation} · transferable NFT + wallet · tier 0 · generation selected by balance · 50% burned · 50% rewards`;
      break;
    }
    case "promote":
      if (friend.collection !== "Generations" || !friend.hardwired) return disabled("Promote friend", "Hardwire required");
      if (friend.generation <= 1) return disabled("Highest generation", "Generation 1 · maximum");
      cost = DENOMINATIONS[friend.generation - 1] - denomination;
      title = `Promote to Generation ${friend.generation - 1}`;
      description = `Generation ${friend.generation} → ${friend.generation - 1} · tier reset → 0 · previous upgrades nonrefundable · 50% burned · 50% rewards`;
      break;
    case "upgrade":
      if (!friend.hardwired || !friend.activated) return disabled("Upgrade friend", "Activation required");
      if (account.rewardAccounting === "friend" && friend.collection === "Genesis") return disabled("Fixed reward weight", "Genesis reward weight is fixed");
      if (friend.tier >= 4) return disabled("Fully upgraded", "Tier 4 · maximum");
      const cumulative = account.rewardAccounting === "friend" ? FRIEND_TIER_CUMULATIVE_BPS : TIER_CUMULATIVE_BPS;
      cost = denomination * (cumulative[friend.tier + 1] - cumulative[friend.tier]) / 10_000;
      title = `Upgrade to tier ${friend.tier + 1}`;
      description = account.rewardAccounting === "friend" ? "Higher reward weight · tier difference charged · 50% burned · 50% rewards" : `Reward multiplier: ${TIER_MULTIPLIERS[friend.tier]}× → ${TIER_MULTIPLIERS[friend.tier + 1]}× · tier difference charged · 50% burned · 50% rewards`;
      break;
    case "activate":
      if (!friend.hardwired) return disabled("Activate friend", "Hardwire required");
      if (friend.activated) return disabled("Already activated", "Active reward position");
      cost = denomination / 10;
      title = friend.collection === "Genesis" ? "Activate Genesis" : "Activate friend";
      description = "Tier 0 · $RAREFRIENDS + WETH rewards · 50% burned · 50% rewards · activation cleared on transfer";
      break;
    case "convert":
      if (friend.collection !== "Genesis") return disabled("Convert Genesis", "Genesis required");
      cost = GENESIS_CONVERSION_FEE;
      receive = GENESIS_CONVERSION_RECEIVE;
      title = "Convert Genesis";
      description = `Genesis, wallet control and contents → reserve · upfront fee · net receive: 900,000 $RAREFRIENDS · future rewards surrendered · ${account.rewardAccounting === "friend" ? "accrued rewards remain with Genesis" : "accrued holder rewards retained"}`;
      break;
  }
  const enough = Number.isFinite(account.tokenBalance) && account.tokenBalance >= cost;
  return { title, cost, receive, asset: "RF", description, enabled: enough,
    ...(enough ? {} : { reason: `Shortfall: ${(cost - account.tokenBalance).toLocaleString("en-US", { maximumFractionDigits: 4 })} $RAREFRIENDS` }) };
}

export interface SwapQuote {
  buy: boolean;
  amountIn: number;
  amountOut: number;
  output: number;
  /** WETH-side pool fee, displayed in ETH. */
  fee: number;
  minimumReceived: number;
  enabled: boolean;
  reason?: string;
}
