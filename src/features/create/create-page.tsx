"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Icon } from "@/src/components/ui/icon";
import { createContent as copy, EXPERIENCE_STARTER_PROMPT } from "@/src/content/create";
import { CreatorIntro } from "./creator-intro";
import { BuilderLeaderboard } from "./builder-leaderboard";

export function CreatePage() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyPrompt() {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EXPERIENCE_STARTER_PROMPT);
        copied = true;
      }
    } catch { /* HTTP previews and clipboard restrictions use the selection fallback below. */ }
    if (!copied) {
      const opener = document.activeElement as HTMLElement | null;
      const buffer = document.createElement("textarea");
      buffer.value = EXPERIENCE_STARTER_PROMPT;
      buffer.className = "create-copy-buffer";
      buffer.tabIndex = -1;
      document.body.append(buffer);
      try {
        buffer.select();
        copied = document.execCommand("copy");
      } catch { /* Report failure without opening a prompt viewer. */ }
      finally {
        buffer.remove();
        opener?.focus({ preventScroll: true });
      }
    }
    setCopyState(copied ? "copied" : "error");
  }

  return <div className="create-page">
    <CreatorIntro onCopyPrompt={copyPrompt} copied={copyState === "copied"} />

    <dl className="create-stats create-container">
      {copy.stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
    </dl>

    <BuilderLeaderboard />

    <section className="create-start create-container create-section" id="starter-prompt" aria-labelledby="create-start-title">
      <div className="create-section-heading">
        <h2 id="create-start-title">{copy.start.title}</h2>
        <ol className="create-start-steps">{copy.start.steps.map(step => <li key={step}>{step}</li>)}</ol>
      </div>
      <div className="create-prompt-window">
        <div className="create-window-bar"><Icon name="terminal" size={16} /><span>{copy.start.filename}</span></div>
        <div className="create-prompt-body">{EXPERIENCE_STARTER_PROMPT.split("\n\n").map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
        <div className="create-prompt-actions"><Button onClick={copyPrompt} variant="primary" icon={copyState === "copied" ? "check" : "copy"}>{copyState === "copied" ? copy.start.copied : copy.start.copy}</Button></div>
        <p className="create-copy-status" role="status" aria-live="polite">{copyState === "copied" ? copy.start.copyStatus : copyState === "error" ? copy.start.errorStatus : ""}</p>
      </div>
    </section>

    <section className="create-sdk create-container create-section" aria-labelledby="create-sdk-title">
      <div className="create-section-heading"><h2 id="create-sdk-title">{copy.sdk.title}</h2></div>
      <div className="create-sdk-stages">
        <article><p className="create-eyebrow">{copy.sdk.current.label}</p><h3>{copy.sdk.current.title}</h3><p>{copy.sdk.current.description}</p></article>
        <article><p className="create-eyebrow">{copy.sdk.future.label}</p><h3>{copy.sdk.future.title}</h3><ul>{copy.sdk.future.items.map(item => <li key={item}>{item}</li>)}</ul><p className="create-sdk-note">{copy.sdk.future.note}</p></article>
      </div>
    </section>
  </div>;
}
