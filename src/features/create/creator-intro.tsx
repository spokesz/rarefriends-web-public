"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/src/components/ui/button";
import { Icon } from "@/src/components/ui/icon";
import { createContent as copy, createLinks } from "@/src/content/create";
import { FishingPreview } from "./fishing/fishing-preview";

export function CreatorIntro({ onCopyPrompt, copied }: { onCopyPrompt: () => void; copied: boolean }) {
  const intro = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = intro.current;
    const page = node?.closest<HTMLElement>(".create-page");
    if (!node || !page) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let request = 0;

    function update() {
      request = 0;
      if (!node || !page) return;
      const start = node.getBoundingClientRect().top + window.scrollY;
      const mobile = window.innerWidth <= 800;
      const distance = mobile ? 160 : 540;
      const raw = Math.max(0, Math.min(1, (window.scrollY - Math.max(0, start - 150)) / distance));
      const progress = motion.matches ? 1 : raw * raw * (3 - 2 * raw);
      page.style.setProperty("--creator-color", progress.toFixed(4));
      page.style.setProperty("--creator-motion", motion.matches ? "0" : progress.toFixed(4));
      page.dataset.colorPhase = progress > 0.48 ? "color" : "ink";
    }

    function schedule() {
      if (!request) request = window.requestAnimationFrame(update);
    }

    const resize = new ResizeObserver(schedule);
    resize.observe(node);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    update();
    return () => {
      window.cancelAnimationFrame(request);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      page.style.removeProperty("--creator-color");
      page.style.removeProperty("--creator-motion");
      delete page.dataset.colorPhase;
    };
  }, []);

  return <section ref={intro} className="create-intro" aria-labelledby="create-title">
    <div className="create-intro-sticky">
      <div className="create-hero create-container">
        <div className="create-hero-copy">
          <p className="create-eyebrow create-vibeathon-date"><time dateTime="2026-09-20">{copy.vibeathon.starts}</time>–<time dateTime="2026-09-30">{copy.vibeathon.ends}</time></p>
          <h1 id="create-title" aria-label={copy.hero.headline.join(" ")}>
            <span className="create-title-ink" aria-hidden="true">{copy.hero.headline.map(line => <span key={line}>{line}</span>)}</span>
            <span className="create-title-color" aria-hidden="true">{copy.hero.headline.map(line => <span key={line}>{line}</span>)}</span>
          </h1>
          <p className="create-hero-prize"><strong>{copy.vibeathon.prize}</strong><span>{copy.vibeathon.prizeLabel}</span></p>
          <p className="create-hero-description">{copy.hero.description}</p>
          <p className="create-hero-detail">{copy.hero.detail}</p>
          <div className="create-actions"><Button onClick={onCopyPrompt} variant="primary" size="lg" icon={copied ? "check" : "copy"}>{copied ? copy.start.copied : copy.hero.action}</Button><Button href={createLinks.vibeathon} variant="ghost" iconRight="external-link">{copy.vibeathon.action}</Button></div>
          <p className="create-hero-note">{copy.hero.note}</p>
        </div>
        <figure className="create-hero-stage">
          <div className="create-world-orbit" aria-hidden="true" />
          {(["flower", "crystal", "tree"] as const).map(prop => <Image key={prop} className={`create-world-prop create-world-prop-${prop}`} src={`/create/${prop}.svg`} width={240} height={240} alt="" aria-hidden="true" />)}
          <div className="create-hero-preview"><FishingPreview color /></div>
        </figure>
      </div>
      <div className="create-scroll-cue" aria-hidden="true"><span>{copy.hero.scroll}</span><Icon name="arrow-down" size={16} /></div>
    </div>
  </section>;
}
