import assert from "node:assert/strict";
import test from "node:test";
import {
  buyBait, cast, createFishingState, equipHat, keepCatch, purchaseHat,
  selectBait, sellCatch, sellFish,
} from "../src/features/create/fishing/model.ts";

test("fishing consumes the selected bait and resolves each catch only once", () => {
  const initial = createFishingState();
  const caught = cast(selectBait(initial, "worm"), 99);
  assert.equal(caught.baitCounts.worm, initial.baitCounts.worm - 1);
  assert.equal(caught.balanceCents, initial.balanceCents);
  assert.equal(caught.pendingCatch?.fish.id, "legend");
  assert.throws(() => cast(caught, 0), /current catch/);

  const sold = sellCatch(caught);
  assert.equal(sold.balanceCents, initial.balanceCents + 1000n);
  assert.throws(() => sellCatch(sold), /no catch/);
  assert.throws(() => keepCatch(sold), /no catch/);

  const kept = keepCatch(caught);
  assert.equal(kept.inventory.length, 1);
  assert.equal(kept.balanceCents, initial.balanceCents);
  const soldFromBag = sellFish(kept, kept.inventory[0].id);
  assert.equal(soldFromBag.balanceCents, sold.balanceCents);
  assert.equal(soldFromBag.inventory.length, 0);
  assert.throws(() => sellFish(soldFromBag, kept.inventory[0].id), /no longer/);
});

test("bait and hats debit exact demo funds and reject purchases without funds", () => {
  const initial = createFishingState();
  const bait = buyBait(initial, "grub");
  assert.equal(bait.balanceCents, 4200n);
  assert.equal(bait.baitCounts.grub, 2);
  const hat = purchaseHat(bait, "bucket");
  assert.equal(hat.balanceCents, 4000n);
  assert.equal(hat.equippedHatId, "bucket");
  assert.deepEqual(hat.ownedHatIds, ["bucket"]);
  assert.equal(equipHat(hat, null).equippedHatId, null);
  assert.throws(() => purchaseHat(hat, "bucket"), /already own/);
  assert.throws(() => equipHat(hat, "cap"), /Buy/);
  const empty = { ...initial, balanceCents: 0n };
  assert.throws(() => buyBait(empty, "bread"), /need/);
  assert.throws(() => purchaseHat(empty, "cap"), /need/);
  assert.equal(empty.balanceCents, 0n);
  assert.equal(initial.balanceCents, 5000n);
});

test("special hats consume the required kept fish and cannot reuse it", () => {
  const initial = createFishingState();
  assert.throws(() => purchaseHat(initial, "party"), /Keep a Legend/);
  const kept = keepCatch(cast(initial, 99));
  const hat = purchaseHat(kept, "party");
  assert.equal(hat.inventory.length, 0);
  assert.equal(hat.balanceCents, kept.balanceCents);
  assert.equal(hat.equippedHatId, "party");
  assert.throws(() => sellFish(hat, kept.inventory[0].id), /no longer/);
});

test("invalid rolls and exhausted bait preserve the original game state", () => {
  let game = createFishingState();
  for (const roll of [-1, 100, 1.5, NaN]) assert.throws(() => cast(game, roll), /whole number/);
  for (let index = 0; index < 3; index++) game = keepCatch(cast(game, 10));
  assert.equal(game.baitCounts.bread, 0);
  assert.throws(() => cast(game, 10), /no Bread/);
  assert.equal(game.casts, 3);
  assert.equal(game.balanceCents, 5000n);
  assert.equal(game.inventory.length, 3);
});
