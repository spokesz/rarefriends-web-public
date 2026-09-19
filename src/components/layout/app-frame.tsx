"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { Icon } from "@/src/components/ui/icon";
import { PublicWalletControls } from "@/src/wallet/wallet-controls";
import { usePublicWallet } from "@/src/wallet/wallet-provider";
import { WalletDialogContext } from "@/src/wallet/wallet-dialog-context";
import { shortAddress } from "@/src/lib/format";
import { siteContent } from "@/src/content/site";
import { useProtocol } from "../../features/protocol/protocol-provider";
import { FriendSprite } from "../art/friend-sprite";

type Theme = "paper" | "invert";
const THEME_KEY = "rarefriends.protocol.theme";
let theme: Theme = "paper";
let themeLoaded = false;
const themeListeners = new Set<() => void>();

function applyTheme(value: Theme) {
  theme = value;
  const root = document.documentElement;
  if (value === "invert") root.setAttribute("data-theme", "invert");
  else root.removeAttribute("data-theme");
  root.style.colorScheme = value === "invert" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "invert" ? "#111111" : "#eeeeee");
  themeListeners.forEach(listener => listener());
}

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  if (!themeLoaded) {
    themeLoaded = true;
    try { theme = localStorage.getItem(THEME_KEY) === "invert" ? "invert" : "paper"; } catch { /* Keep the in-memory preference when storage is unavailable. */ }
    applyTheme(theme);
  }
  const storage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) applyTheme(event.newValue === "invert" ? "invert" : "paper");
  };
  window.addEventListener("storage", storage);
  return () => { themeListeners.delete(listener); window.removeEventListener("storage", storage); };
}

const readTheme = () => theme;
const serverTheme = (): Theme => "paper";

function toggleTheme() {
  const next = theme === "invert" ? "paper" : "invert";
  try { localStorage.setItem(THEME_KEY, next); } catch { /* Theme changes still work without persistence. */ }
  applyTheme(next);
}

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const isContentPage = path === "/vibeathon" || path === "/hackathon" || path === "/create" || path === "/docs" || path.startsWith("/docs/");
  const wallet = usePublicWallet();
  const { config, error, busy } = useProtocol();
  const [walletOpen, setWalletOpen] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, readTheme, serverTheme) === "invert";
  const openWallet = () => setWalletOpen(true);
  return <div className="app-root">
    <header className="app-header">
      <Link href="/" className="app-brand" aria-label={`${siteContent.name} homepage`}><FriendSprite specimen={4} size={32} /><span>{siteContent.wordmark}</span></Link>
      <nav className="app-nav" aria-label="Main navigation">
        {siteContent.navigation.map(item => <Link key={item.href} href={item.href} aria-current={path === item.href || item.href !== "/" && path.startsWith(`${item.href}/`) ? "page" : undefined}>{item.label}</Link>)}
        <a href={siteContent.links.genesisMarket} target="_blank" rel="noreferrer" aria-label={siteContent.marketLink.ariaLabel}>{siteContent.marketLink.label}</a>
      </nav>
      <div className="app-header-wallet"><button className="app-theme-toggle" type="button" aria-label={siteContent.theme.label} aria-pressed={dark} title={dark ? siteContent.theme.light : siteContent.theme.dark} onClick={toggleTheme}><Icon name="moon" size={16} /><span>{siteContent.theme.label}</span></button><Button size="lg" variant="primary" icon="wallet" preserveCase={Boolean(wallet.address)} disabled={busy} onClick={openWallet}>{wallet.connecting ? siteContent.wallet.connecting : wallet.address ? shortAddress(wallet.address) : siteContent.wallet.connect}</Button></div>
    </header>
    {!isContentPage && !config && error && <div className="app-chain-status" role="status">{error}</div>}
    <WalletDialogContext.Provider value={openWallet}><main id="main">{children}</main></WalletDialogContext.Provider>
    <footer className="app-footer">
      <Link href="/" className="app-brand"><FriendSprite specimen={4} size={24} /><span>{siteContent.wordmark}</span></Link>
      <nav aria-label="Footer navigation">
        {siteContent.footerNavigation.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}
      </nav>
    </footer>
    <Dialog open={walletOpen && !wallet.pickerOpen} title={siteContent.wallet.title} onClose={() => setWalletOpen(false)}><PublicWalletControls /></Dialog>
  </div>;
}
