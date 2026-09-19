import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as creatorContent from "../src/content/create.ts";

const require = createRequire(import.meta.url);
const sharedDependencies = { react: React, "react/jsx-runtime": jsxRuntime };

async function loadComponent<T>(path: string, dependencies: Record<string, unknown> = {}): Promise<T> {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = transpileModule(source, { compilerOptions: {
    module: ModuleKind.CommonJS, target: ScriptTarget.ES2020, jsx: JsxEmit.ReactJSX,
  } }).outputText;
  const available = { ...sharedDependencies, ...dependencies };
  const component = { exports: {} };
  new Function("require", "exports", compiled)((name: string) => {
    assert.ok(name in available, `Unexpected creator-page dependency: ${name}`);
    return available[name as keyof typeof available];
  }, component.exports);
  return component.exports as T;
}

const icons = await loadComponent<typeof import("../src/components/ui/icon.tsx")>("../src/components/ui/icon.tsx");
const buttons = await loadComponent<typeof import("../src/components/ui/button.tsx")>("../src/components/ui/button.tsx", {
  "next/link": require("next/link"), "./icon": icons,
});
const dependencies = {
  "@/src/components/ui/button": buttons,
  "@/src/components/ui/icon": icons,
  "@/src/content/create": creatorContent,
};
const intro = await loadComponent<typeof import("../src/features/create/creator-intro.tsx")>("../src/features/create/creator-intro.tsx", {
  ...dependencies,
  "next/image": require("next/image"),
  // Browser checks cover the interactive canvas. Marketing must render without a connected game or wallet.
  "./fishing/fishing-preview": { FishingPreview: () => null },
});
const portraits = await loadComponent<typeof import("../src/components/art/hero-face.tsx")>("../src/components/art/hero-face.tsx", {
  "./genesis-public-art.json": require("../src/components/art/genesis-public-art.json"),
});
const tokenArt = await loadComponent<typeof import("../src/components/art/token-art.tsx")>("../src/components/art/token-art.tsx", {
  "next/image": require("next/image"),
});
const sprites = await loadComponent<typeof import("../src/components/art/friend-sprite.tsx")>("../src/components/art/friend-sprite.tsx", {
  "@/src/components/art/homepage-public-art.json": require("../src/components/art/homepage-public-art.json"),
  "@/src/components/art/token-art": tokenArt,
});
const leaderboard = await loadComponent<typeof import("../src/features/create/builder-leaderboard.tsx")>("../src/features/create/builder-leaderboard.tsx", {
  ...dependencies,
  "@/src/components/art/hero-face": portraits,
  "@/src/components/art/friend-sprite": sprites,
});
const { CreatePage } = await loadComponent<typeof import("../src/features/create/create-page.tsx")>("../src/features/create/create-page.tsx", {
  ...dependencies, "./creator-intro": intro, "./builder-leaderboard": leaderboard,
});

test("vibeathon page renders event details and supplied stats without wallet or protocol providers", () => {
  const html = renderToStaticMarkup(React.createElement(CreatePage));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(html, /aria-label="Rare Friends Vibeathon"/);
  assert.match(text, /10,000\+/);
  assert.match(text, /\$250,000\+/);
  assert.match(text, /pending rewards/i);
  assert.match(text, /1 \$RAREFRIENDS/);
  assert.match(text, /1 prompt/i);
  assert.match(text, /1 Rare Friend/i);
  assert.match(text, /\$40,000/);
  assert.match(text, /in prizes/i);
  assert.match(html, /<time dateTime="2026-09-20">/);
  assert.match(html, /<time dateTime="2026-09-30">/);
  assert.match(text, /submit early/i);
  assert.match(text, /Build with 1 prompt/);
  assert.doesNotMatch(text, /Try it: a little fishing world|simulated balances|Play for a place|Build anything with 1 prompt|Your vibeathon entry starts here|Read the full prompt/i);
  assert.doesNotMatch(html, /<h[1-6][^>]*>\s*(?:FriendSDK|Worlds)\s*<\/h[1-6]>/i);
});

test("builder leaderboard shows category tabs and prize tiers without invented winners", () => {
  const html = renderToStaticMarkup(React.createElement(CreatePage));
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0];
  assert.ok(table, "Builders can find a leaderboard table.");
  for (const label of ["Rank", "Builder", "Points", "Prize"]) {
    assert.match(table, new RegExp(`<th[^>]*scope="col"[^>]*>${label}<`, "i"));
  }
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  for (const name of ["Character Spotlight", "Token Activity", "Economy Potential"]) assert.ok(html.includes(name));
  const text = table.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /\$1,000.*1 Genesis NFT/);
  assert.match(text, /\$500.*10 Gen-1 NFT/);
  assert.match(text, /\$250.*9 Gen-1 NFT/);
  assert.equal((text.match(/To be announced/g) ?? []).length, 3);
  assert.match(html, /\+7 more spots paid/);
  assert.match(html, /href="https:\/\/github.com\/spokesz\/rarefriends-vibeathon\/"/);
});

test("starter prompt uses the supplied concise text and repository links", () => {
  const { EXPERIENCE_STARTER_PROMPT: prompt, createLinks } = creatorContent;
  assert.equal(prompt, "Help me build an experience for the Rare Friends vibeathon.\n\nI want to build [MY_IDEA]\n\nUse FriendSDK: https://github.com/spokesz/friendsdk and handle the coding so I can test it on my phone or computer. Once I'm happy, submit it to the vibeathon: https://github.com/spokesz/rarefriends-vibeathon/");
  assert.deepEqual(Object.values(createLinks), ["https://github.com/spokesz/friendsdk", "https://github.com/spokesz/rarefriends-vibeathon/"]);

  const html = renderToStaticMarkup(React.createElement(CreatePage));
  assert.doesNotMatch(html, /<details|<textarea/);
  assert.doesNotMatch(html, /FriendSDK on GitHub/);
  assert.match(html, /Basic toolkit to play with Friends/);
  assert.match(html, /Launch Token Economies/);
});
