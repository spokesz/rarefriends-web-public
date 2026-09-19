"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/src/components/ui/button";
import { IconButton } from "@/src/components/ui/icon-button";
import { FishingDialog } from "./fishing-dialog";
import { FishingBobber, FishingFishArt, FishingReveal, type FishingRevealCompletion, type FishingRevealPhase } from "./fishing-reveal";
import { FishingWorld, HOTSPOTS, WORLD_SIZE, type FishingTarget, type FishingWorldHandle } from "./fishing-world";
import { HatArt } from "./hat-art";
import { createFishingSounds } from "./sounds";
import {
  BAITS, FISH, HATS, buyBait, cast, createFishingState, equipHat, keepCatch,
  purchaseHat, selectBait, sellCatch, sellFish, type Fish, type FishingState,
} from "./model";

type Stage = "explore" | "pond" | "fishing" | "caught" | "vendor" | "hats" | "collection";
const titles: Record<Stage, string> = {
  explore: "Explore the garden", pond: "Go fishing", fishing: "Gone fishing",
  caught: "You caught something!", vendor: "Bait & tackle", hats: "Matt’s Hats", collection: "Your catches",
};
const amount = (cents: bigint) => (Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Hotspot({ target, active, onVisit }: { target: FishingTarget; active: boolean; onVisit(target: FishingTarget): void }) {
  const { screen } = HOTSPOTS[target];
  return <button type="button" className="create-fishing-hotspot" data-active={active} style={{ left: `${screen.x / WORLD_SIZE.width * 100}%`, top: `${(screen.y - (target === "hats" ? 150 : 45)) / WORLD_SIZE.height * 100}%` }} onClick={() => onVisit(target)}>{titles[target]}</button>;
}

/** A playable local example. The demo never connects a wallet or submits a transaction. */
export function FishingPreview({ color = false }: { color?: boolean } = {}) {
  const world = useRef<FishingWorldHandle>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const sounds = useRef<ReturnType<typeof createFishingSounds> | null>(null);
  const [muted, setMuted] = useState(false);
  const [game, setGame] = useState(createFishingState);
  const gameRef = useRef(game);
  const [stage, setStage] = useState<Stage>("explore");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [near, setNear] = useState<FishingTarget | null>(null);
  const [biteReady, setBiteReady] = useState(false);
  const [revealPhase, setRevealPhase] = useState<FishingRevealPhase>("tension");
  const [skipSignal, setSkipSignal] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const wasExpanded = useRef(false);
  const modal = stage !== "explore";
  const hadModal = useRef(false);
  const modalRef = useRef(modal);
  useEffect(() => { modalRef.current = modal; }, [modal]);
  const selectedBait = BAITS.find(bait => bait.id === game.selectedBaitId)!;
  const currentCatch = game.pendingCatch;
  const revealed = revealPhase === "reveal" || revealPhase === "complete";

  useEffect(() => {
    const kit = createFishingSounds();
    sounds.current = kit;
    return () => { kit.dispose(); sounds.current = null; };
  }, []);

  function unlockSound() { void sounds.current?.unlock(); }

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    sounds.current?.setMuted(next);
    if (!next) void sounds.current?.unlock().then(ready => { if (ready) sounds.current?.play("select"); });
  }

  const onRevealPhase = useCallback((phase: FishingRevealPhase, fish: Fish) => {
    setRevealPhase(phase);
    if (phase === "tension") sounds.current?.play("anticipation");
    else if (phase === "splash") sounds.current?.play("impact");
    else if (phase === "reveal") sounds.current?.play(["legendary", "mythic"].includes(fish.rarity) ? "reveal-legendary" : ["rare", "epic"].includes(fish.rarity) ? "reveal-rare" : "reveal-common");
  }, []);
  const onRevealComplete = useCallback((_fish: Fish, reason: FishingRevealCompletion) => {
    if (reason === "finished") return;
    sounds.current?.stop();
    sounds.current?.play("reward");
  }, []);

  const update = useCallback((action: (state: FishingState) => FishingState) => {
    try {
      const next = action(gameRef.current);
      gameRef.current = next;
      setGame(next);
      setError("");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Try again.");
      return false;
    }
  }, []);

  const arrive = useCallback((destination: FishingTarget) => {
    setError(""); setNotice(""); setStage(destination);
  }, []);
  const onReady = useCallback((ready: boolean) => setStatus(ready ? "ready" : "loading"), []);
  const onError = useCallback(() => setStatus("error"), []);

  function closePanel() {
    if (stage === "fishing") return;
    sounds.current?.stop();
    if (gameRef.current.pendingCatch) update(keepCatch);
    setStage("explore");
    setNotice(""); setError("");
  }

  const visit = useCallback((destination: FishingTarget) => {
    if (status !== "ready") return;
    sounds.current?.stop();
    if (gameRef.current.pendingCatch) update(keepCatch);
    setStage("explore");
    setError(""); setNotice("");
    if (near === destination) arrive(destination);
    else world.current?.walkTo(destination);
  }, [status, near, arrive, update]);

  function startCast() {
    if (gameRef.current.pendingCatch) return;
    const bytes = new Uint32Array(1);
    // Local randomness only; rejection sampling gives each percentage an equal chance.
    do { crypto.getRandomValues(bytes); } while (bytes[0] >= 4_294_967_200);
    if (update(state => cast(state, bytes[0] % 100))) {
      setBiteReady(false);
      setRevealPhase("tension");
      setStage("fishing");
    }
  }

  function resolveCatch(sell: boolean) {
    if (update(sell ? sellCatch : keepCatch)) {
      sounds.current?.play("reward");
      setStage("pond");
    }
  }

  useEffect(() => {
    if (stage !== "fishing") return;
    sounds.current?.play("action-start");
    const timer = window.setTimeout(() => { setBiteReady(true); sounds.current?.play("action-ready"); }, 1800);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    const closed = hadModal.current && !modal;
    hadModal.current = modal;
    if (!closed) return;
    const frame = requestAnimationFrame(() => world.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [modal]);

  useEffect(() => {
    if (!expanded) {
      if (!wasExpanded.current) return;
      wasExpanded.current = false;
      const frame = requestAnimationFrame(() => world.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    wasExpanded.current = true;
    world.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (modalRef.current) return;
      if (event.key === "Escape") setExpanded(false);
      if (event.key !== "Tab") return;
      const controls = [...(wrapper.current?.querySelectorAll<HTMLElement>('button:not(:disabled), canvas[tabindex="0"]') ?? [])];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const soundControl = <IconButton icon={muted ? "volume-x" : "volume-3"} label={muted ? "Enable sounds" : "Mute sounds"} size="sm" variant="ghost" onClick={toggleSound} />;
  const panelTitle = stage === "caught" && !revealed ? revealPhase === "tension" ? "Reeling in" : "Coming up" : titles[stage];
  const catchActions = stage === "caught" && currentCatch && (revealed ? <>
    <Button variant="primary" onClick={() => resolveCatch(false)}>Keep catch</Button>
    <Button preserveCase onClick={() => resolveCatch(true)}>Sell for {currentCatch.fish.sellValue} $RAREFRIENDS</Button>
  </> : <Button variant="primary" onClick={() => setSkipSignal(value => value + 1)}>Reveal catch</Button>);

  const dialog = modal && <FishingDialog title={panelTitle} expanded={expanded} busy={stage === "fishing"} actions={soundControl} footer={catchActions} onClose={closePanel}>
    <div className="create-fishing-panel" data-stage={stage}>
      {stage !== "caught" && <p className="create-fishing-balance">{amount(game.balanceCents)} $RAREFRIENDS</p>}

      {stage === "pond" && <>
        <p>Pick your bait. See what bites.</p>
        <div className="create-fishing-options">
          {BAITS.map(bait => <button key={bait.id} type="button" className="create-fishing-choice" aria-pressed={game.selectedBaitId === bait.id} disabled={!game.baitCounts[bait.id]} onClick={() => { if (update(state => selectBait(state, bait.id))) sounds.current?.play("select"); }}>
            <strong>{bait.name}</strong><span>{game.baitCounts[bait.id]} left</span>
          </button>)}
        </div>
        <p className="create-fishing-hint">{selectedBait.description} One bait per cast.</p>
        <div className="create-fishing-actions"><Button variant="primary" disabled={!game.baitCounts[game.selectedBaitId]} onClick={startCast}>Cast a line</Button><Button onClick={() => visit("vendor")}>Buy bait</Button></div>
      </>}

      {stage === "fishing" && <div className="create-fishing-wait">
        <FishingBobber waiting={!biteReady} bite={biteReady} />
        <p role="status">{biteReady ? "A bite! Reel it in." : "Waiting for a bite…"}</p>
        <Button variant="primary" disabled={!biteReady} onClick={() => setStage("caught")}>Reel in</Button>
      </div>}

      {stage === "caught" && currentCatch && <div className="create-fishing-catch">
        <FishingReveal fish={currentCatch.fish} revealKey={currentCatch.id} skipSignal={skipSignal} showSkipControl={false} onPhase={onRevealPhase} onComplete={onRevealComplete} />
        {revealed && <>
          <span className="create-fishing-rarity">{currentCatch.fish.rarity}</span>
          <h3>{currentCatch.fish.name}</h3>
          <p>{currentCatch.fish.sellValue} $RAREFRIENDS</p>
          {["sturgeon", "legend"].includes(currentCatch.fish.id) && <p>Keep it to trade for a {currentCatch.fish.id === "legend" ? "Party" : "Santa"} hat.</p>}
        </>}
      </div>}

      {stage === "vendor" && <>
        <p>Better bait gives you a better chance of rare fish.</p>
        <div className="create-fishing-shop">
          {BAITS.map(bait => <div key={bait.id}><div><strong>{bait.name}</strong><span>{bait.description} · {game.baitCounts[bait.id]} left</span></div><Button size="sm" preserveCase disabled={game.balanceCents < BigInt(bait.price) * 100n} onClick={() => {
            if (update(state => buyBait(state, bait.id))) { setNotice(`Bought ${bait.name}.`); sounds.current?.play("reward"); }
          }}>Buy · {bait.price} $RAREFRIENDS</Button></div>)}
        </div>
        <Button variant="primary" onClick={() => visit("pond")}>Go fishing</Button>
      </>}

      {stage === "hats" && <div className="create-fishing-hats">
        {HATS.map(hat => {
          const owned = game.ownedHatIds.includes(hat.id), wearing = game.equippedHatId === hat.id;
          const fish = FISH.find(item => item.id === hat.fishId);
          const canBuy = fish ? game.inventory.some(item => item.fish.id === fish.id) : game.balanceCents >= hat.priceCents;
          return <div key={hat.id}><HatArt hatId={hat.id} color={color} /><strong>{hat.name}</strong><span>{owned ? wearing ? "Wearing" : "Owned" : fish ? `Trade 1 ${fish.name}` : `${amount(hat.priceCents)} $RAREFRIENDS`}</span>
            <Button size="sm" disabled={!owned && !canBuy} onClick={() => {
              if (update(state => owned ? equipHat(state, wearing ? null : hat.id) : purchaseHat(state, hat.id))) {
                setNotice(wearing ? "Hat off." : `Wearing ${hat.name}.`);
                sounds.current?.play(owned ? "select" : "reward");
              }
            }}>{owned ? wearing ? "Take off" : "Wear" : fish ? "Trade" : "Buy"}</Button>
          </div>;
        })}
      </div>}

      {stage === "collection" && <>
        {game.inventory.length ? <div className="create-fishing-shop">
          {game.inventory.map(item => <div key={item.id}><FishingFishArt fish={item.fish} /><div><strong>{item.fish.name}</strong><span>{item.fish.rarity}</span></div><Button size="sm" preserveCase onClick={event => {
            if (update(state => sellFish(state, item.id))) {
              sounds.current?.play("reward");
              event.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
            }
          }}>Sell · {item.fish.sellValue} $RAREFRIENDS</Button></div>)}
        </div> : <p>Your bag is empty. There’s a whole lake to discover.</p>}
        <div className="create-fishing-actions"><Button variant="primary" onClick={() => visit("pond")}>Go fishing</Button><Button onClick={() => visit("hats")}>Matt’s Hats</Button></div>
      </>}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </FishingDialog>;

  const scene = <div ref={wrapper} className={`create-fishing${expanded ? " create-fishing-expanded" : ""}`} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={expanded ? "Fishing game" : undefined} data-color={color} data-stage={stage} data-balance={amount(game.balanceCents)} data-plays={game.casts} data-hat={game.equippedHatId ?? ""} data-muted={muted} onPointerDownCapture={unlockSound} onKeyDownCapture={unlockSound}>
    <div className="create-fishing-toolbar" inert={modal || undefined}>
      <span>{amount(game.balanceCents)} $RAREFRIENDS</span>
      {!modal && soundControl}
      <Button size="sm" disabled={status !== "ready" || modal} onClick={() => setStage("collection")}>Bag ({game.inventory.length})</Button>
      <Button size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? "Close fullscreen" : "Fullscreen"}</Button>
    </div>
    <div className="create-fishing-scene" inert={modal || undefined}>
      <FishingWorld ref={world} color={color} equippedHatId={game.equippedHatId} paused={modal} fishing={stage === "fishing"} onReady={onReady} onError={onError} onNearChange={setNear} onInteract={arrive} onArrival={arrive} />
      {status === "ready" && !modal && (["pond", "vendor", "hats"] as const).map(target => <Hotspot key={target} target={target} active={near === target} onVisit={visit} />)}
      {status !== "ready" && <div className="create-fishing-status" role="status">{status === "loading" ? "Loading the garden…" : <><p>The garden couldn’t load.</p><Button onClick={() => world.current?.reset()}>Try again</Button></>}</div>}
    </div>
    {dialog}
  </div>;

  return expanded ? createPortal(scene, document.body) : scene;
}
