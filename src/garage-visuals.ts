export const GARAGE_VISUAL_KEYS = [
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
] as const;

export type GarageVisualKey = (typeof GARAGE_VISUAL_KEYS)[number];

export interface VisualUpgradeSpec {
  visible: boolean;
  label: string;
  accent: number;
  scale: number;
}

const labels: Record<GarageVisualKey, string> = {
  exhaust: "Exhaust hardware",
  exhaustSound: "Resonator system",
  enginePreset: "Engine package",
  engineSound: "Intake system",
  fuel: "Fuel system",
  springLevel: "Coil suspension",
  springMetal: "Strut hardware",
  springStrength: "Roll reinforcement",
  liftKit: "Lift frame",
  rims: "Wheel rims",
  tires: "Performance tires",
  brakes: "Brake rotors",
  brakeStrength: "Bumper bracing",
};

const accents: Record<GarageVisualKey, number> = {
  exhaust: 0xd9e0e2,
  exhaustSound: 0x8d55ff,
  enginePreset: 0xff3b2f,
  engineSound: 0x42d7ff,
  fuel: 0xe5b52f,
  springLevel: 0xffd43b,
  springMetal: 0xc3d1d8,
  springStrength: 0xff653b,
  liftKit: 0x55d985,
  rims: 0xf1f4f5,
  tires: 0x24282a,
  brakes: 0xff4938,
  brakeStrength: 0xf0bc42,
};

export function visualUpgradeSpec(key: GarageVisualKey | string, level: number): VisualUpgradeSpec {
  const visualKey = key as GarageVisualKey;
  const safeLevel = Math.max(0, Math.floor(level));
  return {
    visible: safeLevel > 0,
    label: safeLevel > 0 ? `${labels[visualKey] ?? visualKey} L${safeLevel}` : "Stock",
    accent: accents[visualKey] ?? 0xffffff,
    scale: 1 + Math.min(safeLevel, 10) * 0.075,
  };
}
