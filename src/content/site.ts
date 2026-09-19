/** Shared brand, navigation, metadata, and application shell copy. */
export const siteContent = {
  name: "Rare Friends",
  wordmark: "rare friends",
  description: "Trade $RAREFRIENDS, manage your Rare Friends portfolio, and explore the protocol economy.",
  url: "https://rarefriends.com",
  pages: {
    home: { title: "Digital Friends with Crypto" },
    auction: { title: "Settle and claim $RAREFRIENDS" },
    portfolio: { title: "Your portfolio" },
    vibeathon: { title: "Rare Friends Vibeathon", description: "Build anything with one prompt and one Rare Friend. Join the Rare Friends Vibeathon, September 20–30, with $40,000 in prizes." },
  },
  links: { genesisMarket: "https://opensea.io/collection/rare-friends-genesis/" },
  navigation: [
    { href: "/", label: "swap" },
    { href: "/portfolio", label: "portfolio" },
    { href: "/vibeathon", label: "vibeathon" },
    { href: "/docs", label: "docs" },
  ],
  footerNavigation: [{ href: "/docs/terms", label: "Terms" }],
  marketLink: { label: "OpenSea ↗", ariaLabel: "Genesis collection on OpenSea" },
  theme: { label: "dark mode", light: "Switch to light mode", dark: "Switch to dark mode" },
  wallet: { title: "your wallet", connect: "connect wallet", connecting: "connecting" },
  skipLink: "skip to content",
  errors: {
    title: "This page is temporarily unavailable.",
    description: "Please try again.",
    retry: "try again",
    notFoundTitle: "Nothing at that address.",
    notFoundDescription: "the page does not exist · check the link or start again",
    home: "go home",
  },
} as const;
