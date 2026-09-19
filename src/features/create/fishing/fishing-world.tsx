"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import art from "@/src/components/art/homepage-public-art.json";
import { GAME_PALETTE, isWalkable, project, unproject, createNavigator, type WorldPoint } from "./navigation";
import { drawHat } from "./hat-art";

type SpriteFacing = "up" | "down" | "left" | "right";
type Sprites = typeof art.specimens["cast-01"];

export type FishingTarget = "pond" | "vendor" | "hats";
export type FishingWorldHandle = { walkTo(target: FishingTarget): void; focus(): void; reset(): void };
export type FishingWorldProps = {
  color?: boolean;
  equippedHatId?: string | null;
  paused: boolean;
  fishing: boolean;
  onReady(ready: boolean): void;
  onNearChange(target: FishingTarget | null): void;
  onInteract(target: FishingTarget): void;
  onArrival?(target: FishingTarget): void;
  onError?(message: string): void;
};

export const WORLD_SIZE = Object.freeze({ width: 960, height: 640 });
const CROP = { x: 320, y: 330 };
const SPAWN: WorldPoint = [288, 192];
const INTERACTION_RADIUS = 85;
function hotspot(x: number, y: number, approachX: number, approachY: number) {
  const [screenX, screenY] = project(x, y);
  return Object.freeze({ world: Object.freeze({ x, y }), screen: Object.freeze({ x: screenX - CROP.x, y: screenY - CROP.y }), approach: Object.freeze({ x: approachX, y: approachY }) });
}
export const HOTSPOTS = Object.freeze({
  pond: hotspot(150, 285, 214, 268),
  vendor: hotspot(420, 250, 420, 292),
  hats: hotspot(390, 118, 390, 162),
});
const directions: Record<string, SpriteFacing> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
const vectors: Record<SpriteFacing, readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function loadImage(path: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The garden artwork could not load."));
    image.src = path;
  });
}

function drawFriend(context: CanvasRenderingContext2D, sprites: Sprites, x: number, y: number, facing: SpriteFacing, walking: boolean, frame: number, pixel = 5) {
  const rows = walking ? sprites.walk[facing].frames[frame % sprites.walk[facing].frames.length] : sprites.walk[facing].rest.rows;
  const left = Math.round(x) - 8 * pixel, top = Math.round(y) - 15 * pixel;
  context.fillStyle = "#ffffff";
  rows.forEach((row, py) => {
    for (let px = 0; px < 16; px++) if (row[px] === "#") {
      const x0 = Math.max(0, px - 1), y0 = Math.max(0, py - 1);
      context.fillRect(left + x0 * pixel, top + y0 * pixel, (Math.min(15, px + 1) - x0 + 1) * pixel, (Math.min(15, py + 1) - y0 + 1) * pixel);
    }
  });
  context.fillStyle = "#000000";
  rows.forEach((row, py) => {
    for (let px = 0; px < 16; px++) if (row[px] === "#") context.fillRect(left + px * pixel, top + py * pixel, pixel, pixel);
  });
  const headRow = rows.findIndex(row => row.includes("#"));
  const head = rows[Math.max(0, headRow)];
  return { x: left + (head.indexOf("#") + head.lastIndexOf("#") + 1) * pixel / 2, y: top + Math.max(0, headRow) * pixel - 1 };
}

/** A local bait stand, drawn with the world's original shallow ground projection. */
function drawVendor(context: CanvasRenderingContext2D, vendor: Sprites | null, color = false) {
  const { x, y } = HOTSPOTS.vendor.screen;
  context.save(); context.translate(Math.round(x), Math.round(y));
  context.lineJoin = "miter"; context.lineWidth = 2;
  const polygon = (points: readonly WorldPoint[], fill = "#ffffff") => {
    context.beginPath(); context.moveTo(points[0][0], points[0][1]);
    for (const [px, py] of points.slice(1)) context.lineTo(px, py);
    context.closePath(); context.fillStyle = fill; context.fill(); context.strokeStyle = "#000000"; context.stroke();
  };
  context.fillStyle = "#000000";
  context.fillRect(-42, -105, 4, 103); context.fillRect(40, -105, 4, 116);
  if (vendor) drawFriend(context, vendor, 2, -23, "down", false, 0, 4);
  polygon([[-48, -19], [5, -35], [48, -21], [-5, -4]], color ? GAME_PALETTE.sun : "#ffffff");
  polygon([[-48, -19], [-5, -4], [-5, 24], [-48, 9]], "#000000");
  polygon([[-5, -4], [48, -21], [48, 8], [-5, 24]], color ? GAME_PALETTE.lilac : "#ffffff");
  polygon([[-55, -109], [7, -129], [59, -112], [-3, -92]], color ? GAME_PALETTE.coral : "#ffffff");
  polygon([[-55, -109], [-3, -92], [-3, -82], [-55, -99]], "#000000");
  polygon([[-3, -92], [59, -112], [59, -102], [-3, -82]], color ? GAME_PALETTE.sun : "#ffffff");
  for (let index = 0; index < 4; index++) {
    polygon([[-48 + index * 13, -111 + index * 4], [-38 + index * 13, -108 + index * 4], [24 + index * 9, -120 + index * 3], [15 + index * 9, -123 + index * 3]], color ? index % 2 ? GAME_PALETTE.sun : GAME_PALETTE.coral : index % 2 ? "#ffffff" : "#000000");
  }
  // A rod and line beside the counter make the shop's purpose legible without UI text.
  context.strokeStyle = "#ffffff"; context.lineWidth = 5;
  context.beginPath(); context.moveTo(-61, 9); context.lineTo(-69, -61); context.lineTo(-78, -72); context.stroke();
  context.strokeStyle = "#000000"; context.lineWidth = 2; context.stroke();
  context.beginPath(); context.moveTo(-78, -72); context.lineTo(-78, -24); context.lineTo(-74, -20); context.stroke();
  context.restore();
}

/** A separate cosmetic shop; all hats reuse the same paths as their inventory icons. */
function drawHatVendor(context: CanvasRenderingContext2D, vendor: Sprites | null, color = false) {
  const { x, y } = HOTSPOTS.hats.screen;
  context.save(); context.translate(Math.round(x), Math.round(y));
  context.lineJoin = "miter"; context.lineWidth = 2;
  const polygon = (points: readonly WorldPoint[], fill: string) => {
    context.beginPath(); context.moveTo(points[0][0], points[0][1]);
    for (const [px, py] of points.slice(1)) context.lineTo(px, py);
    context.closePath(); context.fillStyle = fill; context.fill(); context.strokeStyle = "#000000"; context.stroke();
  };
  context.fillStyle = "#000000";
  context.fillRect(-43, -104, 4, 108); context.fillRect(40, -104, 4, 117);
  if (vendor) {
    const head = drawFriend(context, vendor, 2, -25, "down", false, 0, 4);
    drawHat(context, "bucket", head.x, head.y, 38, color);
  }
  polygon([[-49, -19], [5, -36], [49, -21], [-5, -4]], color ? GAME_PALETTE.sun : "#FFFFFF");
  polygon([[-49, -19], [-5, -4], [-5, 24], [-49, 9]], color ? GAME_PALETTE.lilac : "#FFFFFF");
  polygon([[-5, -4], [49, -21], [49, 8], [-5, 24]], color ? GAME_PALETTE.coral : "#FFFFFF");
  context.strokeStyle = "#000000"; context.lineWidth = 1;
  context.beginPath(); context.moveTo(-40, -4); context.lineTo(-14, 4); context.moveTo(5, 7); context.lineTo(40, -4); context.stroke();
  drawHat(context, "cap", -29, -14, 27, color);
  drawHat(context, "sun", 0, -23, 29, color);
  drawHat(context, "party", 27, -30, 27, color);
  polygon([[-56, -115], [7, -135], [59, -118], [-4, -98]], color ? GAME_PALETTE.lilac : "#FFFFFF");
  polygon([[-56, -115], [-4, -98], [-4, -89], [-56, -106]], color ? GAME_PALETTE.coral : "#000000");
  polygon([[-4, -98], [59, -118], [59, -108], [-4, -89]], color ? GAME_PALETTE.sun : "#FFFFFF");
  context.restore();
}

type WorldController = FishingWorldHandle & { sync(paused: boolean, fishing: boolean, color: boolean, equippedHatId?: string | null): void };

export const FishingWorld = forwardRef<FishingWorldHandle, FishingWorldProps>(function FishingWorld(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controller = useRef<WorldController | null>(null);
  const callbacks = useRef(props);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { callbacks.current = props; }, [props]);
  useImperativeHandle(ref, () => ({
    walkTo: target => controller.current?.walkTo(target),
    focus: () => canvasRef.current?.focus({ preventScroll: true }),
    reset: () => controller.current?.reset(),
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const navigation = createNavigator();
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const held = new Map<string, SpriteFacing>();
    let sprites: Sprites | null = null, vendor: Sprites | null = null;
    let terrain: HTMLImageElement | null = null;
    let layers: { image: HTMLImageElement; depth: number }[] = [];
    let alive = true, visible = true, ready = false, loading = false;
    let paused = callbacks.current.paused, fishing = callbacks.current.fishing;
    let color = callbacks.current.color ?? false;
    let equippedHatId = callbacks.current.equippedHatId;
    let paper = "#eeeeee", worldX = SPAWN[0], worldY = SPAWN[1];
    let frameRequest = 0, previousTime = 0, elapsed = 0, loadVersion = 0, artworkVersion = 0;
    let facing: SpriteFacing = "down";
    let near: FishingTarget | null = null, destination: FishingTarget | null = null;
    let route: WorldPoint[] = [];

    function updateNear() {
      let next: FishingTarget | null = null;
      let nearestDistance = INTERACTION_RADIUS;
      for (const target of Object.keys(HOTSPOTS) as FishingTarget[]) {
        const point = HOTSPOTS[target].approach;
        const distance = Math.hypot(point.x - worldX, point.y - worldY);
        if (distance <= nearestDistance) { next = target; nearestDistance = distance; }
      }
      if (next !== near) { near = next; callbacks.current.onNearChange(next); }
    }

    function drawCast() {
      if (!fishing || !context) return;
      const [sx, sy] = project(worldX, worldY);
      const x = sx - CROP.x, y = sy - CROP.y;
      const bobber = HOTSPOTS.pond.screen;
      const bob = motion.matches ? 0 : Math.round(Math.sin(elapsed / 280) * 2);
      context.strokeStyle = "#000000"; context.lineWidth = 3;
      context.beginPath(); context.moveTo(x - 15, y - 30); context.lineTo(x - 47, y - 69); context.stroke();
      context.lineWidth = 1;
      context.beginPath(); context.moveTo(x - 47, y - 69); context.lineTo(bobber.x, bobber.y - 3 + bob); context.stroke();
      context.strokeStyle = color ? GAME_PALETTE.sun : "#ffffff";
      const size = motion.matches ? 9 : 7 + (elapsed / 130 % 9);
      context.beginPath(); context.ellipse(bobber.x, bobber.y + 3, size, size * 0.28, 0, 0, Math.PI * 2); context.stroke();
      context.fillStyle = color ? GAME_PALETTE.sun : "#ffffff"; context.fillRect(Math.round(bobber.x) - 3, Math.round(bobber.y) - 3 + bob, 6, 6);
      context.fillStyle = color ? GAME_PALETTE.coral : "#000000"; context.fillRect(Math.round(bobber.x) - 1, Math.round(bobber.y) - 4 + bob, 2, 4);
    }

    function draw(walking = false) {
      if (!context || !canvas) return;
      context.imageSmoothingEnabled = false; context.fillStyle = paper;
      context.fillRect(0, 0, WORLD_SIZE.width, WORLD_SIZE.height);
      if (terrain) context.drawImage(terrain, -CROP.x, -CROP.y);
      const [screenX, screenY] = project(worldX, worldY);
      const gait = motion.matches ? 0 : Math.floor(elapsed / 110) % 8;
      if (route.length) {
        const [x, y] = project(...route[route.length - 1]);
        context.strokeStyle = "#000000"; context.lineWidth = 1;
        context.beginPath(); context.ellipse(x - CROP.x, y - CROP.y, 9, 3, 0, 0, Math.PI * 2); context.stroke();
      }
      drawCast();
      const items = layers.map(layer => ({ depth: layer.depth, draw: () => context.drawImage(layer.image, -CROP.x, -CROP.y) }));
      items.push({ depth: 670, draw: () => drawVendor(context, vendor, color) });
      items.push({ depth: 508, draw: () => drawHatVendor(context, vendor, color) });
      if (sprites) items.push({ depth: worldX + worldY, draw: () => {
        const head = drawFriend(context, sprites!, screenX - CROP.x, screenY - CROP.y, fishing ? "left" : facing, walking, gait);
        drawHat(context, equippedHatId, head.x, head.y, 55, color);
      } });
      items.sort((a, b) => a.depth - b.depth).forEach(item => item.draw());
      Object.assign(canvas.dataset, {
        x: String(Math.round(screenX - CROP.x)), y: String(Math.round(screenY - CROP.y)), worldX: worldX.toFixed(2), worldY: worldY.toFixed(2),
         facing: fishing ? "left" : facing,
        walking: String(walking), fishing: String(fishing), frame: String(gait), near: near ?? "", target: destination ?? "", routeLength: String(route.length),
        equippedHatId: equippedHatId ?? "", artworkSource: "homepage-public-art",
      });
    }

    function stop(clearRoute = true) {
      held.clear();
      if (clearRoute) { route = []; destination = null; }
      cancelAnimationFrame(frameRequest); frameRequest = 0; previousTime = 0; elapsed = 0;
      draw();
    }
    function finish() {
      const arrived = destination;
      destination = null; route = []; previousTime = 0;
      if (arrived === "pond") facing = "left";
      if (arrived === "vendor" || arrived === "hats") facing = "up";
      updateNear(); draw();
      if (arrived) callbacks.current.onArrival?.(arrived);
    }
    function tick(now: number) {
      frameRequest = 0;
      if (!alive || !ready || !visible || document.hidden) { stop(); return; }
      const dt = previousTime ? Math.min(40, now - previousTime) : 16;
      previousTime = now; elapsed += dt;
      let walking = false;
      if (!paused && !fishing) {
        const heldDirections = [...new Set(held.values())];
        const [sx, sy] = project(worldX, worldY);
        let dx = 0, dy = 0, step = dt * 0.17;
        if (heldDirections.length) {
          // Arrow keys and WASD can be mixed. Duplicate bindings do not add speed,
          // and opposing inputs cancel before the diagonal vector is normalized.
          for (const direction of heldDirections) { dx += vectors[direction][0]; dy += vectors[direction][1]; }
          const magnitude = Math.hypot(dx, dy);
          if (magnitude) {
            dx /= magnitude; dy /= magnitude;
            // The art only has four facings: keep the most recently held direction
            // whose axis survives opposing input, without inventing diagonal frames.
            facing = [...heldDirections].reverse().find(direction => vectors[direction][0] * dx + vectors[direction][1] * dy > 0)!;
          }
        }
        else if (route.length) {
          const [tx, ty] = project(...route[0]);
          const distance = Math.hypot(tx - sx, ty - sy);
          if (distance < 0.1) { worldX = route[0][0]; worldY = route[0][1]; route.shift(); }
          else { dx = (tx - sx) / distance; dy = (ty - sy) / distance; step = Math.min(step, distance); }
          if (!route.length) { finish(); return; }
          if (dx || dy) facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? "left" : "right" : dy < 0 ? "up" : "down";
        }
        if (dx || dy) {
          const next = unproject(sx + dx * step, sy + dy * step);
          if (navigation.segmentClear([worldX, worldY], next)) { worldX = next[0]; worldY = next[1]; walking = true; }
          else if (route.length) { stop(); return; }
          else if (dx && dy) {
            // Slide along a clear screen axis instead of sticking at a shoreline or
            // prop corner. Each candidate checks the same complete collision segment.
            const candidates = [unproject(sx + dx * step, sy), unproject(sx, sy + dy * step)];
            const slide = candidates.find(point => navigation.segmentClear([worldX, worldY], point));
            if (slide) { worldX = slide[0]; worldY = slide[1]; walking = true; }
          }
        }
        updateNear();
      }
      draw(walking);
      if ((!paused && !fishing && (held.size || route.length)) || (fishing && !motion.matches)) frameRequest = requestAnimationFrame(tick);
      else previousTime = 0;
    }
    function start() {
      if (!frameRequest && ready && visible && !document.hidden && ((!paused && !fishing && (route.length || held.size)) || (fishing && !motion.matches))) frameRequest = requestAnimationFrame(tick);
    }
    function navigate(point: WorldPoint, target: FishingTarget | null) {
      if (!ready || fishing) return;
      const path = navigation.route([worldX, worldY], point);
      if (!path) return;
      stop(); route = path; destination = target;
      canvas!.focus({ preventScroll: true });
      draw(); start();
    }
    function walkTo(target: FishingTarget) {
      const point = HOTSPOTS[target].approach;
      navigate([point.x, point.y], target);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (paused || fishing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === "e" && near && !event.repeat) { event.preventDefault(); callbacks.current.onInteract(near); return; }
      const direction = directions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!direction) return;
      event.preventDefault(); route = []; destination = null; held.set(event.code, direction); start();
    }
    function onKeyUp(event: KeyboardEvent) {
      if (!directions[event.key.length === 1 ? event.key.toLowerCase() : event.key]) return;
      held.delete(event.code);
      if (!held.size && !route.length) stop();
    }
    function onPointerDown(event: PointerEvent) {
      if (paused || fishing || !ready || (event.pointerType === "mouse" && event.button !== 0)) return;
      const bounds = canvas!.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width * WORLD_SIZE.width;
      const y = (event.clientY - bounds.top) / bounds.height * WORLD_SIZE.height;
      for (const target of ["vendor", "hats"] as const) {
        const shop = HOTSPOTS[target].screen;
        if (Math.abs(x - shop.x) < 65 && y > shop.y - 135 && y < shop.y + 25) { walkTo(target); return; }
      }
      const point = unproject(x + CROP.x, y + CROP.y);
      if (point[0] >= 70 && point[0] <= 198 && point[1] >= 258 && point[1] <= 322) { walkTo("pond"); return; }
      if (isWalkable(point)) navigate(point, null);
    }
    function repaint() { paper = getComputedStyle(canvas!).getPropertyValue("--paper").trim() || "#eeeeee"; draw(); }
    function blur() { stop(); }
    function visibility() { if (document.hidden) stop(); else start(); }
    function reducedMotion() { stop(false); draw(); start(); }
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) stop(); else start(); });
    const theme = new MutationObserver(repaint);
    intersection.observe(canvas);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    canvas.addEventListener("keydown", onKeyDown); canvas.addEventListener("keyup", onKeyUp); canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("blur", blur);
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility); motion.addEventListener("change", reducedMotion);

    // Palette changes affect local scenery only. Keep the actor, navigation,
    // and immutable sprite reads independent of any presentation transition.
    async function loadArtwork() {
      const version = ++artworkVersion;
      const prefix = `/create/fishing/${color ? "color" : "mono"}`;
      const depths = [225, 234, 280, 398, 408, 562, 585, 686];
      const [ground, props] = await Promise.all([
        loadImage(`${prefix}-terrain.svg`),
        Promise.all(depths.map(async (depth, index) => ({ image: await loadImage(`${prefix}-${index}.svg`), depth }))),
      ]);
      if (!alive || version !== artworkVersion) return;
      terrain = ground; layers = props; draw();
    }

    async function load() {
      if (loading) return;
      loading = true; ready = false; callbacks.current.onReady(false);
      const version = ++loadVersion;
      try {
        await loadArtwork();
        const player = art.specimens["cast-03"];
        const shopkeeper = art.specimens["cast-03"];
        if (!alive || version !== loadVersion) return;
        sprites = player; vendor = shopkeeper; ready = true;
        setStatus("ready"); callbacks.current.onReady(true); updateNear(); draw(); start();
      } catch {
        if (!alive || version !== loadVersion) return;
        setStatus("error"); callbacks.current.onReady(false); callbacks.current.onError?.("Our Friends couldn’t load. Try opening the garden again.");
      } finally { if (version === loadVersion) loading = false; }
    }
    controller.current = {
      walkTo,
      focus: () => canvas.focus({ preventScroll: true }),
      reset: () => {
        stop(); worldX = SPAWN[0]; worldY = SPAWN[1]; facing = "down";
        near = null; callbacks.current.onNearChange(null); draw();
        if (!ready && !loading) { setStatus("loading"); void load(); }
      },
      sync: (nextPaused, nextFishing, nextColor, nextHat) => {
        equippedHatId = nextHat;
        if (nextColor !== color) {
          color = nextColor;
          void loadArtwork().catch(() => { if (alive) callbacks.current.onError?.("The garden artwork could not load."); });
        }
        const becamePaused = nextPaused && !paused;
        paused = nextPaused; fishing = nextFishing;
        if (becamePaused || fishing) stop();
        // A modal can queue navigation while the surrounding scene is inert.
        // Restore keyboard focus after React has removed that inert boundary.
        if (!paused && !fishing && route.length) canvas.focus({ preventScroll: true });
        draw(); start();
      },
    };
    repaint(); void load();
    return () => {
      alive = false; loadVersion++; artworkVersion++; controller.current = null; cancelAnimationFrame(frameRequest);
      intersection.disconnect(); theme.disconnect();
      canvas.removeEventListener("keydown", onKeyDown); canvas.removeEventListener("keyup", onKeyUp); canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("blur", blur);
      window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); motion.removeEventListener("change", reducedMotion);
    };
  }, []);

  useEffect(() => { controller.current?.sync(props.paused, props.fishing, props.color ?? false, props.equippedHatId); }, [props.paused, props.fishing, props.color, props.equippedHatId]);

  return <canvas ref={canvasRef} className="create-fishing-canvas" width={WORLD_SIZE.width} height={WORLD_SIZE.height}
    tabIndex={props.paused ? -1 : 0} data-status={status} data-color={props.color ?? false} aria-busy={status === "loading"}
    aria-label="Fishing game. Click or tap the ground to walk, the pond to fish, the bait stand to buy bait, or Matt’s Hats to buy and equip a hat. Arrow keys or W A S D move your Friend. Press E near a destination to interact.">
    A pond, a bait stand and Matt’s Hats. Use the nearby controls to walk to a destination.
  </canvas>;
});
