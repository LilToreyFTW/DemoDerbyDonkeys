import assert from "node:assert/strict";
import test from "node:test";

import { GARAGE_VISUAL_KEYS, visualUpgradeSpec } from "../src/garage-visuals.ts";

const expectedKeys = [
  "exhaust",
  "exhaustSound",
  "enginePreset",
  "engineSound",
  "fuel",
  "springLevel",
  "springMetal",
  "springStrength",
  "liftKit",
  "rims",
  "tires",
  "brakes",
  "brakeStrength",
];

test("every garage category has a visible equipped model specification", () => {
  assert.deepEqual(GARAGE_VISUAL_KEYS, expectedKeys);
  for (const key of expectedKeys) {
    const stock = visualUpgradeSpec(key, 0);
    const upgraded = visualUpgradeSpec(key, 1);
    assert.equal(stock.visible, false, `${key} stock should not add an upgrade model`);
    assert.equal(upgraded.visible, true, `${key} should create a visible upgrade model`);
    assert.ok(upgraded.label.length > 0, `${key} needs a visible label`);
    assert.ok(upgraded.accent >= 0, `${key} needs an accent color`);
    assert.ok(upgraded.scale > 0, `${key} needs a positive model scale`);
  }
});

test("higher levels produce a stronger visual treatment", () => {
  for (const key of expectedKeys) {
    const levelOne = visualUpgradeSpec(key, 1);
    const levelSeven = visualUpgradeSpec(key, 7);
    assert.ok(levelSeven.scale >= levelOne.scale, `${key} should not shrink at higher levels`);
    assert.notEqual(levelSeven.label, "Stock");
  }
});
