import { supabase } from "@/integrations/supabase/client";
import type { LatLng } from "@/lib/expedition";

export type Progress = {
  level: number;
  completed: number;
  trail: LatLng[];
  destination: LatLng | null;
  expeditionActive: boolean;
};

export const EMPTY_PROGRESS: Progress = {
  level: 1,
  completed: 0,
  trail: [],
  destination: null,
  expeditionActive: false,
};

function isLatLng(v: unknown): v is LatLng {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as LatLng).lat === "number" &&
    typeof (v as LatLng).lng === "number"
  );
}

/** Local-only player used when nobody is signed in; progress lives on this device. */
export const GUEST_ID = "guest";
const GUEST_KEY = "expedition-guest-progress";

export async function loadProgress(userId: string): Promise<Progress> {
  if (userId === GUEST_ID) {
    try {
      const raw = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
      if (!raw) return EMPTY_PROGRESS;
      return {
        level: Number(raw.level) || 1,
        completed: Number(raw.completed) || 0,
        trail: Array.isArray(raw.trail) ? raw.trail.filter(isLatLng) : [],
        destination: isLatLng(raw.destination) ? raw.destination : null,
        expeditionActive: !!raw.expeditionActive,
      };
    } catch {
      return EMPTY_PROGRESS;
    }
  }
  const { data, error } = await supabase
    .from("game_progress")
    .select("level, completed, trail, destination, expedition_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return EMPTY_PROGRESS;

  const trail = Array.isArray(data.trail) ? (data.trail as unknown[]).filter(isLatLng) : [];
  return {
    level: data.level ?? 1,
    completed: data.completed ?? 0,
    trail,
    destination: isLatLng(data.destination) ? data.destination : null,
    expeditionActive: !!data.expedition_active,
  };
}

/** Cap stored trail so long-term play stays cheap while keeping the whole map. */
function compactTrail(trail: LatLng[]): LatLng[] {
  const MAX = 4000;
  if (trail.length <= MAX) return trail;
  const stride = Math.ceil(trail.length / MAX);
  const out = trail.filter((_, i) => i % stride === 0);
  const last = trail[trail.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

export async function saveProgress(userId: string, p: Progress) {
  if (userId === GUEST_ID) {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify({ ...p, trail: compactTrail(p.trail) }));
    } catch {
      /* storage full or blocked */
    }
    return;
  }
  await supabase.from("game_progress").upsert(
    {
      user_id: userId,
      level: p.level,
      completed: p.completed,
      trail: compactTrail(p.trail),
      destination: p.destination,
      expedition_active: p.expeditionActive,
    },
    { onConflict: "user_id" },
  );
}
