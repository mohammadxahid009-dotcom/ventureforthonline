// Pure zombie-survival rules. Positions are metres east/north of a fixed session origin.
import type { LatLng } from "@/lib/expedition";

export type ZombieKind = "shambler" | "walker" | "runner" | "sprinter" | "lurker" | "heavy";
export type WeaponId = "pistol" | "shotgun" | "rifle";

export interface Vec { x: number; y: number }
export interface Zombie { id: number; kind: ZombieKind; pos: Vec; hp: number; hitAt?: number }

export const ZOMBIE_TYPES: Record<ZombieKind, { speed: number; hp: number; label: string; weight: number; minTime: number }> = {
  shambler: { speed: 0.6, hp: 1, label: "Shambler", weight: 5, minTime: 0 },
  walker: { speed: 1.35, hp: 1, label: "Walker", weight: 5, minTime: 0 },
  runner: { speed: 2.6, hp: 1, label: "Runner", weight: 2, minTime: 45 },
  lurker: { speed: 0.4, hp: 2, label: "Lurker", weight: 2, minTime: 30 },
  heavy: { speed: 0.8, hp: 4, label: "Heavy", weight: 1.5, minTime: 90 },
  sprinter: { speed: 4.2, hp: 1, label: "Sprinter", weight: 0.6, minTime: 150 },
};

/** a lurker creeps until you are close, then lunges */
export const LURKER_TRIGGER_M = 35;
export const LURKER_LUNGE_SPEED = 3.4;
export const ATTACK_RANGE_M = 6;
export const BITE_DPS = 9;
export const LOOT_RANGE_M = 15;
export const AIRDROP_EVERY_S = 120;

export const WEAPONS: Record<WeaponId, { label: string; range: number; cone: number; damage: number; cooldown: number }> = {
  pistol: { label: "Pistol", range: 40, cone: 22, damage: 1, cooldown: 0.45 },
  shotgun: { label: "Shotgun", range: 25, cone: 45, damage: 2, cooldown: 1 },
  rifle: { label: "Assault Rifle", range: 75, cone: 12, damage: 2, cooldown: 0.2 },
};

export function zombieSpeed(z: Zombie, distToPlayer: number) {
  if (z.kind === "lurker" && distToPlayer < LURKER_TRIGGER_M) return LURKER_LUNGE_SPEED;
  return ZOMBIE_TYPES[z.kind].speed;
}

export function pickKind(survivedS: number, rand: () => number): ZombieKind {
  const pool = (Object.keys(ZOMBIE_TYPES) as ZombieKind[]).filter((k) => survivedS >= ZOMBIE_TYPES[k].minTime);
  const total = pool.reduce((s, k) => s + ZOMBIE_TYPES[k].weight, 0);
  let r = rand() * total;
  for (const k of pool) {
    r -= ZOMBIE_TYPES[k].weight;
    if (r <= 0) return k;
  }
  return pool[0] ?? "walker";
}

/** more zombies the longer you last */
export function targetHorde(survivedS: number) {
  return Math.min(40, 8 + Math.floor(survivedS / 20));
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** compass bearing (0 = north, clockwise) from a to b */
export function bearingTo(a: Vec, b: Vec) {
  return ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
}

export function angleDiff(a: number, b: number) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** zombies hit by a shot fired from `from` toward `heading` */
export function shotHits(zombies: Zombie[], from: Vec, heading: number, weapon: WeaponId) {
  const w = WEAPONS[weapon];
  return zombies.filter((z) => dist(z.pos, from) <= w.range && angleDiff(bearingTo(from, z.pos), heading) <= w.cone / 2);
}

const M_PER_DEG = 111_320;
export function toVec(origin: LatLng, p: LatLng): Vec {
  return { x: (p.lng - origin.lng) * M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180), y: (p.lat - origin.lat) * M_PER_DEG };
}
export function toLatLng(origin: LatLng, v: Vec): LatLng {
  return { lat: origin.lat + v.y / M_PER_DEG, lng: origin.lng + v.x / (M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180)) };
}
