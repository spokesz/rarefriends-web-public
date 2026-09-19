export const homeContent = {
  metricsLink: "protocol metrics",
  howItWorks: "How it works",
  portfolioLink: "open portfolio",
  detailsHeading: "Protocol details",
  contractUnavailable: "unavailable",
  collections: {
    genesis: { title: "Genesis", description: "Activation · RF + WETH rewards · individual NFT wallets", action: "manage Genesis" },
    generations: { title: "Generations", description: "Hardwiring · generation promotion · tier upgrades", action: "manage Generations" },
  },
  headline: ["$RAREFRIENDS", "IS LIVE"],
  steps: [
    { title: "Hold", body: "A balance of at least 1 $RAREFRIENDS qualifies for a temporary Generation.", label: "balance-dependent", specimen: 1 },
    { title: "Hardwire", body: "Spend $RAREFRIENDS to create a permanent Generations NFT and activate its reward weight.", label: "permanent NFT · individual wallet", specimen: 4 },
    { title: "Promote or upgrade", body: "Spend $RAREFRIENDS to increase reward weight. Promotion resets the tier to 0.", label: "RF + WETH rewards", specimen: 7 },
  ],
  faq: [
    { question: "Temporary vs. permanent", answer: "Temporary Generations depend on your RF balance. Hardwiring spends RF to create a permanent, transferable NFT with its own wallet and an active reward position." },
    { question: "Promotion vs. tier upgrade", answer: "Promotion moves a Generation one level earlier and charges the difference between the two token denominations. It resets the tier to 0. A tier upgrade increases reward weight within the same generation." },
    { question: "Genesis activation and conversion", answer: "Activation costs 100,000 RF. When conversion is enabled and the market is open, conversion requires 100,000 RF upfront and returns 1,000,000 RF. Genesis moves to the reserve, including control of its wallet, wallet assets, unclaimed rewards and future rewards." },
    { question: "Reward sources and claims", answer: "RF rewards come from protocol action fees; WETH rewards come from AMM fees. Allocated rewards stream over seven days to active reward positions by weight. Claim each NFT’s accrued rewards into its own wallet, then withdraw from that wallet in portfolio." },
  ],
};


export const swapContent = {
  buy: "buy",
  sell: "sell",
  settings: "Swap settings",
  slippage: "max. slippage",
  slippageDescription: "Applied to the minimum tokens received by the swap.",
  pay: "you pay",
  receive: "you receive",
  balance: "balance",
  max: "max",
  estimate: "estimated",
  minimum: "minimum received",
  review: "review swap",
  connect: "connect wallet",
  switchNetwork: "switch wallet network",
  unavailable: "market data unavailable",
  poolUnavailable: "pool unavailable",
  enterAmount: "enter an amount",
  quoting: "getting quote…",
  insufficient: "insufficient balance",
  priceUnavailable: " · price updates unavailable",
  cachedPrice: " · cached USD price",
  portfolioLink: "open portfolio →",
} as const;

export const metricsContent = {
  title: "protocol metrics",
  friends: { label: "Total Friends Playing", detail: "activated friends" },
  reserve: { label: "vault inventory", detail: "Genesis NFTs in the reserve" },
  weight: { label: "activated weight", detail: "total reward weight · RF-denominated" },
  paid: { label: "total rewards paid for this week", detail: "Monday–Sunday UTC" },
  pending: { label: "total rewards to pay", detail: "streaming + awaiting allocation" },
  apy: { label: "APR", detail: "current active stream ÷ RF paid to activate · annualized" },
  cached: "updates unavailable · cached",
  onchain: "onchain",
  cachedPrice: " · cached USD price",
  loading: "loading chain data…",
  unavailable: "chain data unavailable",
} as const;
