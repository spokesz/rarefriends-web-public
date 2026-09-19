export type Fish = Readonly<{
  id: string;
  name: string;
  rarity: string;
  sellValue: number;
  weight: number;
  rows: readonly string[];
}>;

const pixels = (lines: readonly string[]) => lines.map(line => line.padEnd(24, "."));
export const FISH: readonly Fish[] = [
    { id: "old-boot", name: "Old Boot", rarity: "junk", sellValue: 0, weight: 15,
      rows: pixels(["", "......########", "......#......#", "......#.#.##.#", "......#......#", "......#.##.#.#", "......#......#", "......#.#.##.#", "......#......#", "......#......#####", "......#..........##", ".....##...........#", ".....##############", ".....##############", "", ""]) },
    { id: "sardine", name: "Sardine", rarity: "common", sellValue: 0.25, weight: 30,
      rows: pixels(["", "", "", "", "...........##", "..........####", "..##....##########", "..#####.########.###", "..###################", "..#####.############", "..##....##########", "..........####", "...........##", "", "", ""]) },
    { id: "sunfish", name: "Sunfish", rarity: "common", sellValue: 0.5, weight: 22,
      rows: pixels(["", "..........###", "........#######", ".......#########", "......###########", "..##..########.###", "..###.#############", "..##################", "..##################", "..###.#############", "..##..############", "......###########", ".......#########", "........#######", "..........###", ""]) },
    { id: "bream", name: "Bream", rarity: "uncommon", sellValue: 0.75, weight: 14,
      rows: pixels(["", "", ".........#.#.#", "........########", ".......##########", ".##...############", ".####.#########.###", ".########.##.#######", ".########.##.########", ".####.###.##.#######", ".##...############", ".......##########", ".........#####", "..........###", "", ""]) },
    { id: "rainbow-trout", name: "Rainbow Trout", rarity: "rare", sellValue: 1.5, weight: 9,
      rows: pixels(["", "", "............###", "..........#####", "..#.....############", "..##..####.##.#######", "..######.##.##.###.###", "..#####################", "..###................##", "..####################", "..##..##.##.##.######", "..#.....############", "..........#####", "............###", "", ""]) },
    { id: "catfish", name: "Catfish", rarity: "epic", sellValue: 2.5, weight: 5,
      rows: pixels(["", "", "...........###", "..........####", ".##....############", ".####.###############", ".################.####", ".######################", ".#####################", ".####.#############.#.#", ".##....###########..#.#", ".........######.....#.#", "..........####.......#", "...........##", "", ""]) },
    { id: "sturgeon", name: "Sturgeon", rarity: "legendary", sellValue: 5, weight: 3,
      rows: pixels(["", "", ".........#...#", "........###.###", ".#....############", ".##..###.###.#######", ".######.###.###.#######", ".#######################", ".######.###.###.###.###", ".##..###.###.########", ".#....############", "........####..##", ".........##....#", "", "", ""]) },
    { id: "legend", name: "Legend", rarity: "mythic", sellValue: 10, weight: 2,
      rows: pixels(["..........#..#", ".........######", "...#....########", "...##..###########", "..#######..#########", ".########....#####.###", "..########..###########", "...####################", "..########..###########", ".########....#########", "..#######..#########", "...##..###########", "...#....########", ".........######", "..........#..#", ""]) },
];

/** Local hero game only. No wallet, contracts, clock, or random source. */
export type BaitId = "bread" | "worm" | "grub";
export type HatId = "cap" | "bucket" | "sun" | "santa" | "party";
export type Bait = Readonly<{
  id: BaitId; name: string; price: number; quantity: 1; description: string; weights: readonly number[];
}>;
export type Hat = Readonly<{
  id: HatId; name: string; priceCents: bigint; fishId: string | null;
}>;
export type Catch = Readonly<{ id: string; fish: Fish }>;
export type FishingState = Readonly<{
  balanceCents: bigint;
  baitCounts: Readonly<Record<BaitId, number>>;
  selectedBaitId: BaitId;
  inventory: readonly Catch[];
  pendingCatch: Catch | null;
  ownedHatIds: readonly HatId[];
  equippedHatId: HatId | null;
  casts: number;
}>;

export const BAITS: readonly Bait[] = [
  { id: "bread", name: "Bread", price: 1, quantity: 1, description: "Basic bait", weights: [15, 30, 22, 14, 9, 5, 3, 2] },
  { id: "worm", name: "Worm", price: 3, quantity: 1, description: "Better chance of rare fish.", weights: [7, 20, 22, 18, 15, 9, 6, 3] },
  { id: "grub", name: "Golden grub", price: 8, quantity: 1, description: "Best chance of rare fish.", weights: [0, 8, 14, 18, 22, 18, 12, 8] },
];

export const HATS: readonly Hat[] = [
  { id: "cap", name: "Everyday cap", priceCents: 100n, fishId: null },
  { id: "bucket", name: "Bucket hat", priceCents: 200n, fishId: null },
  { id: "sun", name: "Sun hat", priceCents: 400n, fishId: null },
  { id: "santa", name: "Santa hat", priceCents: 0n, fishId: "sturgeon" },
  { id: "party", name: "Party hat", priceCents: 0n, fishId: "legend" },
];

function baitFor(id: string): Bait {
  const bait = BAITS.find(item => item.id === id);
  if (!bait) throw new Error("Choose Bread, Worm, or Golden grub.");
  return bait;
}

function hatFor(id: string): Hat {
  const hat = HATS.find(item => item.id === id);
  if (!hat) throw new Error("That hat is not available.");
  return hat;
}

const saleCents = (fish: Fish) => BigInt(Math.round(fish.sellValue * 100));

export function createFishingState(): FishingState {
  return { balanceCents: 5000n, baitCounts: { bread: 3, worm: 2, grub: 1 }, selectedBaitId: "bread",
    inventory: [], pendingCatch: null, ownedHatIds: [], equippedHatId: null, casts: 0 };
}

export function selectBait(state: FishingState, id: string): FishingState {
  const bait = baitFor(id);
  if (state.baitCounts[bait.id] < 1) throw new Error(`You have no ${bait.name} left. Buy more bait at the shop.`);
  return { ...state, selectedBaitId: bait.id };
}

export function buyBait(state: FishingState, id: string): FishingState {
  const bait = baitFor(id), cost = BigInt(bait.price) * 100n;
  if (state.balanceCents < cost) throw new Error(`You need ${bait.price} $RAREFRIENDS to buy ${bait.name}.`);
  if (!Number.isSafeInteger(state.baitCounts[bait.id] + bait.quantity)) throw new Error("Your bait bag is full.");
  return { ...state, balanceCents: state.balanceCents - cost,
    baitCounts: { ...state.baitCounts, [bait.id]: state.baitCounts[bait.id] + bait.quantity } };
}

/** Consume one bait and lock the result before any casting or reveal animation. */
export function cast(state: FishingState, roll: number): FishingState {
  if (state.pendingCatch) throw new Error("Keep or sell your current catch before casting again.");
  if (!Number.isInteger(roll) || roll < 0 || roll > 99) throw new Error("The fishing roll must be a whole number from 0 to 99.");
  const bait = baitFor(state.selectedBaitId);
  if (state.baitCounts[bait.id] < 1) throw new Error(`You have no ${bait.name} left. Buy more bait at the shop.`);
  if (!Number.isSafeInteger(state.casts + 1)) throw new Error("Start a new game before casting again.");
  let boundary = 0;
  const index = bait.weights.findIndex(weight => { boundary += weight; return roll < boundary; });
  const fish = FISH[index];
  if (!fish) throw new Error("The fishing results are unavailable.");
  const casts = state.casts + 1;
  return { ...state, casts, baitCounts: { ...state.baitCounts, [bait.id]: state.baitCounts[bait.id] - 1 },
    pendingCatch: { id: `catch-${casts}`, fish } };
}

export function keepCatch(state: FishingState): FishingState {
  if (!state.pendingCatch) throw new Error("There is no catch to keep.");
  return { ...state, inventory: [...state.inventory, state.pendingCatch], pendingCatch: null };
}

export function sellCatch(state: FishingState): FishingState {
  if (!state.pendingCatch) throw new Error("There is no catch to sell.");
  return { ...state, balanceCents: state.balanceCents + saleCents(state.pendingCatch.fish), pendingCatch: null };
}

export function sellFish(state: FishingState, id: string): FishingState {
  const item = state.inventory.find(item => item.id === id);
  if (!item) throw new Error("That catch is no longer in your bag.");
  return { ...state, balanceCents: state.balanceCents + saleCents(item.fish),
    inventory: state.inventory.filter(value => value.id !== id) };
}

export function purchaseHat(state: FishingState, id: string): FishingState {
  const hat = hatFor(id);
  if (state.ownedHatIds.includes(hat.id)) throw new Error(`You already own the ${hat.name}.`);
  let inventory = state.inventory;
  if (hat.fishId) {
    const item = inventory.find(item => item.fish.id === hat.fishId);
    if (!item) {
      const name = FISH.find(fish => fish.id === hat.fishId)?.name ?? "required fish";
      throw new Error(`Keep a ${name} in your bag to trade for the ${hat.name}.`);
    }
    inventory = inventory.filter(value => value.id !== item.id);
  } else if (state.balanceCents < hat.priceCents) {
    throw new Error(`You need ${hat.priceCents / 100n} $RAREFRIENDS to buy the ${hat.name}.`);
  }
  return { ...state, balanceCents: state.balanceCents - hat.priceCents, inventory,
    ownedHatIds: [...state.ownedHatIds, hat.id], equippedHatId: hat.id };
}

export function equipHat(state: FishingState, id: string | null): FishingState {
  if (id === null) return { ...state, equippedHatId: null };
  const hat = hatFor(id);
  if (!state.ownedHatIds.includes(hat.id)) throw new Error(`Buy the ${hat.name} before putting it on.`);
  return { ...state, equippedHatId: hat.id };
}
