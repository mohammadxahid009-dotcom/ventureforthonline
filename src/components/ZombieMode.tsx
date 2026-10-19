import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import { Biohazard, Crosshair, Heart, Package, Skull, X } from "lucide-react";
import type { LatLng } from "@/lib/expedition";
import {
  AIRDROP_EVERY_S,
  ATTACK_RANGE_M,
  BITE_DPS,
  LOOT_RANGE_M,
  WEAPONS,
  ZOMBIE_TYPES,
  bearingTo,
  dist,
  pickKind,
  shotHits,
  targetHorde,
  toLatLng,
  toVec,
  zombieSpeed,
  type Vec,
  type WeaponId,
  type Zombie,
} from "@/lib/zombies";

type Props = {
  map: L.Map | null;
  player: LatLng;
  heading: number | null;
  rotation: number;
  onExit: () => void;
};

type Airdrop = { pos: Vec; landsAt: number } | null;
type Loot = { lines: string[]; at: number } | null;

// ── tiny synthesized sound kit (no audio files) ──
let audio: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audio;
}
function noiseBurst(duration: number, freq: number, gain: number) {
  const ctx = ac();
  if (!ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}
function groan() {
  const ctx = ac();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sawtooth";
  const t = ctx.currentTime;
  o.frequency.setValueAtTime(90 + Math.random() * 40, t);
  o.frequency.linearRampToValueAtTime(55 + Math.random() * 20, t + 1.1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.25);
  g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 400;
  o.connect(f).connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 1.25);
}
const buzz = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
};

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function ZombieMode({ map, player, heading, rotation, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originRef = useRef<LatLng>(player);
  const playerRef = useRef<Vec>({ x: 0, y: 0 });
  const headingRef = useRef<number | null>(heading);
  const zombiesRef = useRef<Zombie[]>([]);
  const nextId = useRef(1);
  const startRef = useRef(performance.now());
  const dropRef = useRef<Airdrop>(null);
  const nextDropRef = useRef(40); // first drop comes early
  const flashRef = useRef(0);
  const cooldownRef = useRef(0);

  const [hp, setHp] = useState(100);
  const [kills, setKills] = useState(0);
  const [survived, setSurvived] = useState(0);
  const [count, setCount] = useState(0);
  const [weapon, setWeapon] = useState<WeaponId>("pistol");
  const [ammo, setAmmo] = useState<Record<WeaponId, number>>({ pistol: 24, shotgun: 0, rifle: 0 });
  const [loot, setLoot] = useState<Loot>(null);
  const [danger, setDanger] = useState(0);
  const [dropIn, setDropIn] = useState(40);
  const [dropDist, setDropDist] = useState<number | null>(null);
  const [dead, setDead] = useState(false);
  const [run, setRun] = useState(0);
  const hpRef = useRef(100);
  const deadRef = useRef(false);

  useEffect(() => {
    headingRef.current = heading;
  }, [heading]);
  useEffect(() => {
    playerRef.current = toVec(originRef.current, player);
  }, [player]);

  // ── game loop ──
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudTick = 0;
    let groanTick = 3;
    const spawn = (survivedS: number) => {
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 190;
      const kind = pickKind(survivedS, Math.random);
      const p = playerRef.current;
      zombiesRef.current.push({ id: nextId.current++, kind, hp: ZOMBIE_TYPES[kind].hp, pos: { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r } });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = (now - startRef.current) / 1000;
      const me = playerRef.current;

      if (!deadRef.current) {
        while (zombiesRef.current.length < targetHorde(t)) spawn(t);
        cooldownRef.current = Math.max(0, cooldownRef.current - dt);

        let closest = Infinity;
        let biting = 0;
        for (const z of zombiesRef.current) {
          const d = dist(z.pos, me);
          closest = Math.min(closest, d);
          if (d > ATTACK_RANGE_M * 0.6) {
            const sp = zombieSpeed(z, d) * dt;
            // a little lateral wobble keeps the horde organic
            const wob = Math.sin(now / 700 + z.id) * 0.35;
            const ang = Math.atan2(me.y - z.pos.y, me.x - z.pos.x) + wob;
            z.pos.x += Math.cos(ang) * sp;
            z.pos.y += Math.sin(ang) * sp;
          }
          if (d <= ATTACK_RANGE_M) biting++;
          // stragglers left far behind respawn closer
          if (d > 400) {
            const a = Math.random() * Math.PI * 2;
            z.pos = { x: me.x + Math.cos(a) * 200, y: me.y + Math.sin(a) * 200 };
          }
        }
        if (biting) {
          hpRef.current = Math.max(0, hpRef.current - BITE_DPS * biting * dt);
          if (Math.random() < dt * 2) buzz(80);
          if (hpRef.current <= 0) {
            deadRef.current = true;
            setDead(true);
            buzz([300, 100, 600]);
          }
        }

        // airdrops
        nextDropRef.current -= dt;
        if (nextDropRef.current <= 0 && !dropRef.current) {
          const a = Math.random() * Math.PI * 2;
          const r = 80 + Math.random() * 70;
          dropRef.current = { pos: { x: me.x + Math.cos(a) * r, y: me.y + Math.sin(a) * r }, landsAt: t };
          nextDropRef.current = AIRDROP_EVERY_S;
          noiseBurst(1.8, 300, 0.25);
          buzz([60, 60, 60]);
        }
        if (dropRef.current && dist(dropRef.current.pos, me) <= LOOT_RANGE_M) {
          dropRef.current = null;
          const roll = Math.random();
          const lines: string[] = [];
          hpRef.current = Math.min(100, hpRef.current + 35);
          lines.push("+ Health Pack");
          if (roll < 0.4) {
            setAmmo((a) => ({ ...a, shotgun: a.shotgun + 8 }));
            setWeapon("shotgun");
            lines.push("+ Shotgun · 8 shells");
          } else if (roll < 0.7) {
            setAmmo((a) => ({ ...a, rifle: a.rifle + 30 }));
            setWeapon("rifle");
            lines.push("+ Assault Rifle (Rare)");
          } else {
            setAmmo((a) => ({ ...a, pistol: a.pistol + 20 }));
            lines.push("+ 20 Pistol rounds");
          }
          setLoot({ lines, at: now });
          buzz([40, 40, 120]);
        }

        groanTick -= dt;
        if (groanTick <= 0 && closest < 60) {
          groan();
          groanTick = 2 + Math.random() * 4;
        }

        hudTick -= dt;
        if (hudTick <= 0) {
          hudTick = 0.25;
          setHp(Math.round(hpRef.current));
          setSurvived(Math.floor(t));
          setCount(zombiesRef.current.length);
          setDanger(closest < ATTACK_RANGE_M ? 1 : closest < 25 ? 0.5 : 0);
          setDropIn(Math.ceil(nextDropRef.current));
          setDropDist(dropRef.current ? Math.round(dist(dropRef.current.pos, me)) : null);
        }
      }
      draw(now);
    };

    const draw = (now: number) => {
      const cv = canvasRef.current;
      if (!cv || !map) return;
      const size = map.getSize();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (cv.width !== size.x * dpr) {
        cv.width = size.x * dpr;
        cv.height = size.y * dpr;
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const origin = originRef.current;
      const proj = (v: Vec) => {
        try {
          const ll = toLatLng(origin, v);
          return map.latLngToContainerPoint([ll.lat, ll.lng]);
        } catch {
          return null;
        }
      };
      const me = proj(playerRef.current);

      // aim beam
      const h = headingRef.current;
      if (me && h !== null) {
        const w = WEAPONS[weapon];
        const tip = proj({ x: playerRef.current.x, y: playerRef.current.y + w.range });
        const rPx = tip ? Math.abs(me.y - tip.y) : 80;
        const a = ((h - 90) * Math.PI) / 180;
        const half = ((w.cone / 2) * Math.PI) / 180;
        const g = ctx.createRadialGradient(me.x, me.y, 0, me.x, me.y, rPx);
        g.addColorStop(0, "rgba(255,170,40,0.55)");
        g.addColorStop(1, "rgba(255,170,40,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(me.x, me.y);
        ctx.arc(me.x, me.y, rPx, a - half, a + half);
        ctx.closePath();
        ctx.fill();
      }

      // airdrop
      const drop = dropRef.current;
      if (drop) {
        const p = proj(drop.pos);
        if (p) {
          if (me) {
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = "rgba(255,180,40,0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(me.x, me.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          const pulse = 18 + Math.sin(now / 250) * 4;
          ctx.fillStyle = "rgba(255,170,30,0.25)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, pulse + 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1a1208";
          ctx.strokeStyle = "#ffb020";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.font = "16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🪂", p.x, p.y);
        }
      }

      // zombies
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const z of zombiesRef.current) {
        const p = proj(z.pos);
        if (!p || p.x < -30 || p.y < -30 || p.x > size.x + 30 || p.y > size.y + 30) continue;
        const big = z.kind === "heavy" ? 17 : z.kind === "sprinter" || z.kind === "runner" ? 12 : 13;
        const hit = z.hitAt && now - z.hitAt < 150;
        ctx.shadowColor = "rgba(255,30,30,0.9)";
        ctx.shadowBlur = 14;
        ctx.fillStyle = hit ? "#ffffff" : z.kind === "sprinter" ? "#ff3b1f" : z.kind === "heavy" ? "#7a0d0d" : "#c3121b";
        ctx.beginPath();
        ctx.arc(p.x, p.y, big, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ff6a6a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillText(z.kind === "heavy" ? "🧟" : z.kind === "lurker" ? "👁" : "🏃", p.x, p.y + 1);
        // heading arrow toward the player
        if (me) {
          const a = Math.atan2(me.y - p.y, me.x - p.x);
          const ax = p.x + Math.cos(a) * (big + 7);
          const ay = p.y + Math.sin(a) * (big + 7);
          ctx.fillStyle = "#ff2a2a";
          ctx.beginPath();
          ctx.moveTo(ax + Math.cos(a) * 6, ay + Math.sin(a) * 6);
          ctx.lineTo(ax + Math.cos(a + 2.4) * 5, ay + Math.sin(a + 2.4) * 5);
          ctx.lineTo(ax + Math.cos(a - 2.4) * 5, ay + Math.sin(a - 2.4) * 5);
          ctx.fill();
        }
      }

      // muzzle flash
      if (me && now - flashRef.current < 90) {
        ctx.fillStyle = "rgba(255,230,140,0.9)";
        ctx.beginPath();
        ctx.arc(me.x, me.y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [map, weapon, run]);

  function fire() {
    if (deadRef.current || cooldownRef.current > 0) return;
    let w = weapon;
    if (ammo[w] <= 0) {
      const alt = (Object.keys(ammo) as WeaponId[]).find((k) => ammo[k] > 0);
      if (!alt) {
        noiseBurst(0.05, 2000, 0.2); // dry click
        return;
      }
      w = alt;
      setWeapon(alt);
    }
    void ac()?.resume();
    cooldownRef.current = WEAPONS[w].cooldown;
    setAmmo((a) => ({ ...a, [w]: a[w] - 1 }));
    flashRef.current = performance.now();
    noiseBurst(w === "shotgun" ? 0.45 : 0.22, w === "rifle" ? 2500 : 1600, 0.6);
    buzz(w === "shotgun" ? 90 : 35);

    const me = playerRef.current;
    // without a compass (desktop), auto-aim at the closest zombie
    let aim = headingRef.current;
    if (aim === null) {
      const near = [...zombiesRef.current].sort((a, b) => dist(a.pos, me) - dist(b.pos, me))[0];
      if (!near) return;
      aim = bearingTo(me, near.pos);
    }
    let hits = shotHits(zombiesRef.current, me, aim, w);
    if (w !== "shotgun") hits = hits.sort((a, b) => dist(a.pos, me) - dist(b.pos, me)).slice(0, 1);
    let killed = 0;
    const now = performance.now();
    for (const z of hits) {
      z.hp -= WEAPONS[w].damage;
      z.hitAt = now;
      if (z.hp <= 0) killed++;
    }
    if (killed) {
      zombiesRef.current = zombiesRef.current.filter((z) => z.hp > 0);
      setKills((k) => k + killed);
    }
  }

  function restart() {
    zombiesRef.current = [];
    hpRef.current = 100;
    deadRef.current = false;
    dropRef.current = null;
    nextDropRef.current = 40;
    startRef.current = performance.now();
    originRef.current = player;
    playerRef.current = { x: 0, y: 0 };
    setHp(100);
    setKills(0);
    setAmmo({ pistol: 24, shotgun: 0, rifle: 0 });
    setWeapon("pistol");
    setDead(false);
    setRun((r) => r + 1);
  }

  const showLoot = loot && performance.now() - loot.at < 5000;
  useEffect(() => {
    if (!loot) return;
    const id = setTimeout(() => setLoot(null), 5000);
    return () => clearTimeout(id);
  }, [loot]);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[450]" style={{ transform: `rotate(${rotation}deg)` }}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      </div>

      {/* blood vignette when they're close */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-[460] transition-opacity duration-300 ${danger === 1 ? "animate-pulse" : ""}`}
        style={{ opacity: danger, boxShadow: "inset 0 0 140px 40px var(--destructive)" }}
      />

      {/* banner + stats */}
      <div className="pointer-events-none absolute inset-x-3 top-16 z-[520] flex flex-col gap-2">
        <div className="panel pointer-events-auto flex items-center gap-3 rounded-xl border border-destructive/60 px-3 py-2">
          <Biohazard className="h-7 w-7 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-[0.25em] text-destructive">ZOMBIE MODE</p>
            <p className="text-[9px] tracking-[0.25em] text-muted-foreground">SURVIVE · OUTRUN · ELIMINATE</p>
          </div>
          <button onClick={onExit} aria-label="Leave zombie mode" className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="panel pointer-events-auto rounded-xl px-3 py-2 text-[10px] tracking-[0.15em]">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-destructive">
              <Heart className="h-3.5 w-3.5 fill-current" /> HP {hp}%
            </span>
            <span className="text-muted-foreground">
              🧟 {count} · <Skull className="inline h-3 w-3" /> {kills} · {fmt(survived)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-destructive transition-all" style={{ width: `${hp}%` }} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-primary-foreground/80">
            <Package className="h-3.5 w-3.5 text-accent" />
            {dropDist !== null ? `AIRDROP LANDED · ${dropDist} M — GO GET IT` : `NEXT AIRDROP ${fmt(Math.max(0, dropIn))}`}
          </p>
        </div>
        {showLoot && (
          <div className="panel pointer-events-auto rounded-xl border border-accent/50 px-3 py-2 text-[11px]">
            <p className="tracking-[0.25em] text-accent">LOOT DROPPED</p>
            {loot!.lines.map((l) => (
              <p key={l} className="mt-0.5 text-foreground">{l}</p>
            ))}
          </div>
        )}
      </div>

      {/* weapon + fire */}
      <div className="absolute bottom-56 left-3 z-[520] flex flex-col items-center gap-2">
        <div className="panel flex flex-col overflow-hidden rounded-xl text-[9px] tracking-[0.15em]">
          {(Object.keys(WEAPONS) as WeaponId[]).map((w) => (
            <button
              key={w}
              disabled={ammo[w] <= 0}
              onClick={() => setWeapon(w)}
              className={`px-2.5 py-1.5 text-left disabled:opacity-30 ${weapon === w ? "bg-destructive/25 text-destructive" : "text-muted-foreground"}`}
            >
              {WEAPONS[w].label.toUpperCase()} · {ammo[w]}
            </button>
          ))}
        </div>
        <button
          onClick={fire}
          aria-label="Fire"
          className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 border-destructive bg-destructive/20 text-destructive shadow-[0_0_24px_var(--destructive)] active:scale-95"
        >
          <Crosshair className="h-8 w-8" />
          <span className="mt-1 text-[10px] font-bold tracking-[0.25em]">FIRE</span>
        </button>
        {heading === null && <p className="w-24 text-center text-[8px] leading-tight text-muted-foreground">NO COMPASS — AUTO-AIM</p>}
      </div>

      {dead && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-background/85 p-6 text-center">
          <div>
            <Skull className="mx-auto h-14 w-14 text-destructive" />
            <h2 className="mt-3 text-2xl font-bold tracking-[0.3em] text-destructive">YOU WERE BITTEN</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Survived {fmt(survived)} · {kills} zombies down
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <button onClick={restart} className="rounded-xl bg-destructive px-5 py-3 text-xs font-bold tracking-[0.2em] text-destructive-foreground">
                TRY AGAIN
              </button>
              <button onClick={onExit} className="rounded-xl border border-border px-5 py-3 text-xs font-bold tracking-[0.2em]">
                LEAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
