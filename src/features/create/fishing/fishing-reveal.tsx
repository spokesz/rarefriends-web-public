"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Button } from "@/src/components/ui/button";
import type { Fish } from "./model";

export type FishingRevealPhase = "tension" | "splash" | "reveal" | "complete";
export type FishingRevealCompletion = "finished" | "skipped" | "reduced-motion";
type FishingRevealProps = {
  fish: Fish;
  revealKey: string | number;
  reducedMotion?: boolean;
  onPhase?: (phase: FishingRevealPhase, fish: Fish) => void;
  onComplete?: (fish: Fish, reason: FishingRevealCompletion) => void;
  skipSignal?: number;
  showSkipControl?: boolean;
};

export const FISHING_REVEAL_TIMING = Object.freeze({ splash: 720, reveal: 1320, complete: 2400 });

const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const readMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => false;

export function FishingFishArt({ fish, className = "" }: { fish: Fish; className?: string }) {
  const path = fish.rows.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === "#" ? [`M${x} ${y}h1v1h-1z`] : [])).join("");
  return <svg className={`create-fishing-fish ${className}`.trim()} viewBox={`0 0 ${Math.max(...fish.rows.map(row => row.length))} ${fish.rows.length}`} fill="currentColor" shapeRendering="crispEdges" role="img" aria-label={fish.name}><path d={path} /></svg>;
}

export function FishingBobber({ waiting = false, bite = false }: { waiting?: boolean; bite?: boolean }) {
  return <div className="create-fishing-float-art" data-waiting={waiting || undefined} data-bite={bite || undefined} aria-hidden="true">
    <svg viewBox="0 0 96 80" fill="none" shapeRendering="crispEdges">
      <g className="create-fishing-float-water"><path d="M10 62h19m-4 7h13m23-7h25M56 72h15M3 72h14m58-18h13" stroke="currentColor" strokeWidth="2" /></g>
      <g className="create-fishing-float"><path d="M49 4v26M44 29h10v9H44zM38 38h22v20H38z" stroke="currentColor" strokeWidth="2" /><path d="M39 48h20v9H39zM44 59h10v7H44z" fill="currentColor" /><path d="M49 66v7" stroke="currentColor" strokeWidth="2" /></g>
      <g className="create-fishing-bite-marks"><path d="m19 19 8 8m45-11-8 10M15 40h12m43-3h12M49 9V0" stroke="currentColor" strokeWidth="3" /></g>
    </svg>
  </div>;
}

function Water() {
  return <svg className="create-catch-water" viewBox="0 0 320 180" fill="none" stroke="currentColor" strokeWidth="2" shapeRendering="crispEdges"><g className="create-catch-waterline"><path d="M76 136h28m8 4h30m32-3h28m12-3h30M100 150h18m80-1h22" /></g><g className="create-catch-rings"><ellipse cx="160" cy="138" rx="28" ry="9" /><ellipse cx="160" cy="138" rx="28" ry="9" /><ellipse cx="160" cy="138" rx="28" ry="9" /></g></svg>;
}

function Rig() {
  return <div className="create-catch-rig"><svg viewBox="0 0 320 180" fill="none" stroke="currentColor" strokeWidth="2" shapeRendering="crispEdges"><g className="create-catch-line"><path d="M160 0v113" /><path d="M155 111h10v6h6v15h-22v-15h6z" fill="var(--paper)" /><path d="M150 125h20v6h-20zM156 133h8v7h-8z" fill="currentColor" /></g></svg></div>;
}

/** Original fishing presentation, driven only by the already selected local catch. */
export function FishingReveal(props: FishingRevealProps) {
  return <FishingRevealSequence key={props.revealKey} {...props} />;
}

function FishingRevealSequence({ fish, reducedMotion, onPhase, onComplete, skipSignal = 0, showSkipControl = true }: FishingRevealProps) {
  const systemReducedMotion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const reduceMotion = reducedMotion ?? systemReducedMotion;
  const [phase, setPhase] = useState<FishingRevealPhase>(reduceMotion ? "complete" : "tension");
  const callbacks = useRef({ fish, onPhase, onComplete });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completed = useRef(false);
  const lastPhase = useRef<FishingRevealPhase | null>(null);
  const previousSkipSignal = useRef(skipSignal);

  useEffect(() => { callbacks.current = { fish, onPhase, onComplete }; }, [fish, onPhase, onComplete]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const announcePhase = useCallback((next: FishingRevealPhase) => {
    if (lastPhase.current === next) return;
    lastPhase.current = next;
    callbacks.current.onPhase?.(next, callbacks.current.fish);
  }, []);
  const finish = useCallback((reason: FishingRevealCompletion) => {
    if (completed.current) return;
    completed.current = true;
    clearTimers();
    setPhase("complete");
    announcePhase("complete");
    callbacks.current.onComplete?.(callbacks.current.fish, reason);
  }, [announcePhase, clearTimers]);

  useEffect(() => {
    if (completed.current) return;
    if (reduceMotion) {
      // Queue completion so Strict Mode can cancel its initial effect probe.
      timers.current = [setTimeout(() => finish("reduced-motion"), 0)];
    } else {
      announcePhase("tension");
      const advance = (next: FishingRevealPhase) => {
        if (completed.current) return;
        setPhase(next);
        announcePhase(next);
      };
      timers.current = [
        setTimeout(() => advance("splash"), FISHING_REVEAL_TIMING.splash),
        setTimeout(() => advance("reveal"), FISHING_REVEAL_TIMING.reveal),
        setTimeout(() => finish("finished"), FISHING_REVEAL_TIMING.complete),
      ];
    }
    return clearTimers;
  }, [announcePhase, clearTimers, finish, reduceMotion]);

  useEffect(() => {
    if (previousSkipSignal.current === skipSignal) return;
    previousSkipSignal.current = skipSignal;
    finish("skipped");
  }, [finish, skipSignal]);

  const special = ["rare", "epic", "legendary", "mythic"].includes(fish.rarity);
  const revealed = phase === "reveal" || phase === "complete";
  const particleCount = fish.rarity === "mythic" ? 18 : fish.rarity === "legendary" ? 14 : special ? 10 : fish.rarity === "uncommon" ? 6 : 4;

  return <div className="create-fishing-reveal" data-reveal-phase={phase} data-rarity={fish.rarity} data-reduced-motion={reduceMotion || undefined} data-skip-control={showSkipControl || undefined}>
    <div className="create-catch-scene" aria-hidden="true" inert>
      {phase === "tension" && <div className="create-catch-tension"><Water /><Rig /></div>}
      {phase === "splash" && <div className="create-catch-splash"><Water /><Rig /><div className="create-catch-silhouette"><div><FishingFishArt fish={fish} /></div></div><div className="create-catch-spray">{Array.from({ length: 6 }, (_, index) => <i key={index} style={{ "--particle-index": index } as CSSProperties} />)}</div></div>}
      <div className="create-catch-halo" />
      {revealed && <div className="create-catch-item"><FishingFishArt fish={fish} /></div>}
      <div className="create-catch-particles">{Array.from({ length: particleCount }, (_, index) => <i key={index} style={{ "--particle-index": index, "--particle-count": particleCount } as CSSProperties} />)}</div>
    </div>
    <span className="create-catch-announcement" role="status" aria-live="polite">{revealed ? `${fish.name}, ${fish.rarity}` : phase === "tension" ? "Reeling in" : "Coming up"}</span>
    {showSkipControl && <Button size="sm" className="create-catch-skip" onClick={() => finish("skipped")} disabled={phase === "complete"}>{phase === "complete" ? "Catch revealed" : "Reveal catch"}</Button>}
  </div>;
}
