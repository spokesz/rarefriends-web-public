import { GAME_PALETTE } from "./navigation";

export type HatId = "cap" | "bucket" | "sun" | "santa" | "party";
type Paint = keyof typeof GAME_PALETTE | "white" | "black" | "none";
type HatShape = Readonly<{ d: string; fill: Paint; stroke?: boolean }>;

// Shared vector shapes keep shop previews, display hats and equipped accessories identical.
const HATS: Readonly<Record<HatId, readonly HatShape[]>> = Object.freeze({
  cap: [
    { d: "M16 42V29H20V23H27V20H36V23H42V29H46V42Z", fill: "pond" },
    { d: "M11 41H45L57 47V50H9V45Z", fill: "coral" },
    { d: "M30 23V38M19 36H27", fill: "none" },
    { d: "M28 17H35V21H28Z", fill: "sun" },
  ],
  bucket: [
    { d: "M20 22H44L49 43H15Z", fill: "lilac" },
    { d: "M17 34H47L49 41H15Z", fill: "coral" },
    { d: "M13 42H51L56 50H8Z", fill: "lilac" },
    { d: "M30 26H35V31H30Z", fill: "sun" },
  ],
  sun: [
    { d: "M18 42L22 24H42L46 42Z", fill: "sun" },
    { d: "M19 34H45L47 41H17Z", fill: "meadow" },
    { d: "M12 41H51L61 47V51H3V47Z", fill: "sun" },
    { d: "M9 47H56", fill: "none" },
  ],
  santa: [
    { d: "M15 44L19 28L27 17L39 15L47 25L44 30L36 24L39 43Z", fill: "coral" },
    { d: "M12 40H43V51H12Z", fill: "white" },
    { d: "M41 25H49V29H52V37H48V40H41V37H38V30H41Z", fill: "white" },
    { d: "M17 44V48M25 44V48M33 44V48", fill: "none" },
  ],
  party: [
    { d: "M16 47L31 11L48 47Z", fill: "lilac" },
    { d: "M25 26H37L41 34H21Z", fill: "sun" },
    { d: "M12 46H51V52H12Z", fill: "coral" },
    { d: "M28 5H35V13H28Z", fill: "sun" },
    { d: "M28 39H33V44H28Z", fill: "white" },
  ],
});

function shapes(hatId: string | null | undefined) {
  return hatId && Object.hasOwn(HATS, hatId) ? HATS[hatId as HatId] : [];
}
function paint(value: Paint, color: boolean) {
  return value === "none" ? "none" : value === "black" ? "#000000" : value === "white" || !color ? "#FFFFFF" : GAME_PALETTE[value];
}

export function HatArt({ hatId, className, color = true }: { hatId: string; className?: string; color?: boolean }) {
  return <svg viewBox="0 0 64 64" className={className} role="img" aria-label={`${hatId} hat`}>
    <g stroke="#000000" strokeWidth="2" strokeLinejoin="miter">
      {shapes(hatId).map((shape, index) => <path key={index} d={shape.d} fill={paint(shape.fill, color)} stroke={shape.stroke === false ? "none" : undefined} />)}
    </g>
  </svg>;
}

/** x/y is the center of the brim's lower edge, above the unchanged Friend bitmap. */
export function drawHat(context: CanvasRenderingContext2D, hatId: string | null | undefined, x: number, y: number, size = 56, color = true) {
  const artwork = shapes(hatId);
  if (!artwork.length) return;
  context.save();
  context.translate(Math.round(x - size / 2), Math.round(y - size * 52 / 64));
  context.scale(size / 64, size / 64);
  context.lineWidth = 2; context.lineJoin = "miter"; context.strokeStyle = "#000000";
  for (const shape of artwork) {
    const path = new Path2D(shape.d);
    if (shape.fill !== "none") { context.fillStyle = paint(shape.fill, color); context.fill(path); }
    if (shape.stroke !== false) context.stroke(path);
  }
  context.restore();
}
