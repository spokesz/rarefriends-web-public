# Rare Friends web

The Rare Friends website, auction and portfolio interface, built with Next.js, React and TypeScript. One application serves every route. It connects to either production (Robinhood Chain, `4663`) or Anvil (`31337`); there are no deployment stages or alternate builds.

## Run locally

Use Node.js 22.23.1 or newer and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Configure a deployed protocol and connect a wallet to use live auction, portfolio and transaction features. This repository does not deploy contracts or provision funded accounts.

## Configure

See [.env.example](.env.example) for the complete example. Keep each setting in one local environment file to avoid conflicting overrides. Set hosted environment variables through your hosting platform.

| Setting | Purpose |
| --- | --- |
| `WALLETCONNECT_PROJECT_ID` | Your Reown project ID. Allow your application origins in its dashboard. |
| `PROTOCOL_DEPLOYMENT_GZIP_BASE64` | Compressed deployment manifest, suitable for hosted environment settings. |
| `PROTOCOL_DEPLOYMENT_JSON` | Alternative inline JSON manifest. Use only one inline format. |
| `PROTOCOL_DEPLOYMENT_FILE` | Local manifest path when neither inline format is set; defaults to `.local/protocol/deployment.json`. |
| `PROTOCOL_RPC_URL` | Server RPC endpoint. Production portfolio NFT discovery requires an Alchemy Robinhood endpoint. |
| `PROTOCOL_SNAPSHOT_URL` | Public protocol metrics endpoint, fetched by the server. Defaults to the Rare Friends Cloudflare service shown in `.env.example`. |
| `PROTOCOL_PUBLIC_RPC_URL` | Required for Anvil: a local/LAN wallet RPC URL reachable from the browser, such as `http://127.0.0.1:8545`. Leave empty for production, which uses the canonical public endpoint. |
| `GOOGLE_ANALYTICS_ID` | Optional Google Analytics measurement ID (`G-…`). Analytics loads only when a valid ID is configured. |
| `DEV_ALLOWED_ORIGINS` | Optional comma-separated hostnames/IPs allowed to load local development assets. |

The manifest identifies the network through `chainId` and supplies deployed contract addresses and ABIs. Its chain must match the RPC endpoint. Anvil uses the same application with an Anvil deployment manifest and local RPC. Live protocol requests return a configuration error until a valid deployment is provided.

The export tool accepts an existing deployment manifest and emits compressed public deployment metadata, excluding RPC URLs, local accounts, signing keys and deployment bytecode:

```sh
npm run export:deployment -- --manifest /path/to/deployment.json --out /path/to/deployment.base64
```

Set `PROTOCOL_DEPLOYMENT_GZIP_BASE64` to the output file's contents, and configure `PROTOCOL_RPC_URL` separately. Auction reads and bid preparation use the connected wallet; protocol metrics use the server routes. Production history totals come from the external metrics service and update every five minutes. Prices, reward streams and wallet balances still use current contract reads; APR annualizes active stream rewards against the service's cumulative activation payments. Missing, invalid or more than 15-minute-old service data returns an availability error; the app does not fall back to old deployment totals or rescan global history. User transactions are signed in the wallet. Private environment files and `.local/` are ignored by Git; the web server does not need deployer keys or seed phrases.

## Build and check

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Self-hosted builds generate Next.js standalone output. Vercel uses the included framework configuration. Build, lint, tests and type checks should pass before submitting a change; exercise affected wallet flows against your configured deployment as well.

## Layout

```text
app/                    Next.js pages, metadata and API route handlers
  api/protocol/         Protocol HTTP endpoints
  api/wallet/           Wallet network and connection configuration
  create/               Redirect to the vibeathon
  hackathon/            Redirect to the vibeathon
  vibeathon/            Vibeathon page and local fishing demo
  docs/                 Documentation routes
  launch/               Auction route
  portfolio/            Portfolio route
src/
  components/
    art/                Shared artwork and pre-rendered SVG data
    layout/             Application frame and provider composition
    ui/                 Shared buttons, dialogs, icons and other primitives
  config/               Network definitions and public auction metadata
  content/              Editable page copy, navigation and documentation
  features/
    auction/            Auction components, reads and bidding behavior
    create/             Vibeathon page, AI starter prompt, and local demo
    docs/               Documentation rendering and illustrations
    home/               Homepage and swap interface
    portfolio/          Holdings, friends and rewards
    protocol/           Shared protocol state and transaction interaction
  lib/                  Shared formatting and route helpers
    protocol/           Shared chain reads, indexing and transaction preparation
  server/protocol/      Server deployment, RPC, portfolio reads and price caching
  styles/               Application styles and design tokens
  wallet/               Wallet providers, controls and network support
public/                 Publicly served static assets
scripts/                Deployment manifest export
tests/                  Network, configuration and deployment regression checks
```

Keep route files small, put feature-specific components alongside their feature, and share UI components only when there is real reuse. Follow [AGENTS.md](AGENTS.md): make the smallest complete change that solves the current problem.

Browser components use `src/lib/protocol/` for shared chain operations and call API routes for server data. Keep private RPC configuration, filesystem access and upstream price caching in `src/server/`.

## Edit content and appearance

| Change | Location |
| --- | --- |
| Brand, page metadata, navigation, footer and external links | `src/content/site.ts` |
| Homepage and swap copy | `src/content/home.ts` |
| Auction copy | `src/content/auction.ts` |
| Portfolio copy | `src/content/portfolio.ts` |
| Vibeathon page, starter prompt, and leaderboard copy | `src/content/create.ts` |
| Transaction reviews and wallet confirmations | `src/content/transactions.ts` |
| Wallet connection and network details | `src/content/wallet.ts` |
| Documentation chapters | `src/content/docs.ts` |
| Terms of use | `src/content/terms.json` |
| Colors, typography, spacing and motion | `src/styles/tokens/` |
| Supported networks | `src/config/networks.ts` |

Keep editorial content in these modules and rendering behavior in the corresponding feature components. Shared character artwork lives in `src/components/art/`; documentation artwork lives in `src/features/docs/`. The checked-in SVG data is ready to render and does not require art-generation tooling.
