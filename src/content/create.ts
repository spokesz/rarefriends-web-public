/** Vibeathon copy and the external resources used by its AI starter prompt. */
export const createLinks = {
  friendSdk: "https://github.com/spokesz/friendsdk",
  vibeathon: "https://github.com/spokesz/rarefriends-vibeathon/",
} as const;

export const EXPERIENCE_STARTER_PROMPT = `Help me build an experience for the Rare Friends vibeathon.

I want to build [MY_IDEA]

Use FriendSDK: ${createLinks.friendSdk} and handle the coding so I can test it on my phone or computer. Once I'm happy, submit it to the vibeathon: ${createLinks.vibeathon}`;

export const createContent = {
  hero: {
    headline: ["Rare Friends", "Vibeathon"],
    description: "1 prompt. 1 Rare Friend.",
    detail: "Bring an idea. Your AI handles the code. We handle the distribution.",
    action: "Copy the prompt",
    note: "Minigames, Gachas, Tamas, Virtual-pet, Idles, Familiar Care, Launchpad, Anything.",
    scroll: "See more",
  },
  stats: [
    { value: "10,000+", label: "Rare Friends collecting crypto" },
    { value: "$250,000+", label: "in pending rewards" },
    { value: "1 $RAREFRIENDS", label: "to get started" },
    { value: "1 prompt", label: "to build anything" },
  ],
  vibeathon: {
    prize: "$40,000",
    prizeLabel: "in prizes",
    starts: "September 20",
    ends: "30, 2026",
    action: "Enter the vibeathon",
  },
  leaderboard: {
    title: "Builder leaderboard",
    description: "Build experiences. Rally players. Submit your entries.",
    poolLabel: "Total vibeathon prize pool",
    columns: ["Rank", "Builder", "Points", "Prize"],
    tabsLabel: "Vibeathon categories",
    categories: [
      { id: "characters", name: "Character Spotlight", description: "Best use of a Generations NFT as the main character." },
      { id: "activity", name: "Token Activity", description: "Most successful at burning or spending $RAREFRIENDS." },
      { id: "economy", name: "Economy Potential", description: "Best potential for a token economy paired with $RAREFRIENDS." },
    ],
    prizes: [
      { rank: 1, cash: "$1,000", nft: "1 Genesis NFT", collection: "genesis" },
      { rank: 2, cash: "$500", nft: "10 Gen-1 NFT", collection: "generations" },
      { rank: 3, cash: "$250", nft: "9 Gen-1 NFT", collection: "generations" },
    ],
    pendingBuilder: "To be announced",
    morePrizes: "+7 more spots paid",
    prizeDetails: "Prize details will be added to Github.",
  },
  start: {
    title: "Build with 1 prompt",
    steps: ["Copy the prompt and add your idea.", "Build and play with your Rare Friend.", "Submit early to get in front of players and improve"],
    filename: "rare-friends-vibeathon.txt",
    copy: "Copy the prompt",
    copied: "Copied",
    copyStatus: "Prompt copied. Paste it into your AI agent and add your idea.",
    errorStatus: "Couldn’t copy the prompt. Please try again.",
  },
  sdk: {
    title: "Build now and make Friends.",
    current: {
      label: "v0.1 · Now",
      title: "Basic toolkit to play with Friends",
      description: "With 1 prompt and 1 Rare Friend, build, explore, and share your creation with the Rare Friends community and compete.",
    },
    future: {
      label: "Potential",
      title: "Launch Token Economies",
      items: [
        "Deploy any asset type for your experience.",
        "Pair it with $RAREFRIENDS to get a market.",
        "Introduce chance with randomness.",
        "Tap into Rare Friends distribution.",
      ],
      note: "Earn fees as your assets trade, beyond your own sales.",
    },
  },
} as const;
