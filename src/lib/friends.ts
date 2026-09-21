import { supabase } from "@/integrations/supabase/client";

/** The friends tables are newer than the generated types, so query untyped. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type Profile = { user_id: string; call_sign: string | null };

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
};

export type CrewEntry = {
  friendshipId: string;
  userId: string;
  callSign: string;
  since: string;
};

export type RequestEntry = {
  friendshipId: string;
  userId: string;
  callSign: string;
  createdAt: string;
};

export type Crew = {
  friends: CrewEntry[];
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function normalizeCallSign(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

export function callSignError(value: string) {
  const clean = normalizeCallSign(value);
  if (clean.length < 3) return "Call signs need at least 3 characters (letters, numbers or _).";
  return null;
}

export async function loadMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await db
    .from("profiles")
    .select("user_id, call_sign")
    .eq("user_id", userId)
    .maybeSingle();
  fail(error);
  return (data as Profile | null) ?? { user_id: userId, call_sign: null };
}

export async function saveCallSign(userId: string, raw: string): Promise<Profile> {
  const call_sign = normalizeCallSign(raw);
  const problem = callSignError(call_sign);
  if (problem) throw new Error(problem);
  const { data, error } = await db
    .from("profiles")
    .upsert({ user_id: userId, call_sign, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("user_id, call_sign")
    .single();
  if (error) {
    if (String(error.code) === "23505" || /duplicate|unique/i.test(error.message)) {
      throw new Error("That call sign is already taken. Try another.");
    }
    throw new Error(error.message);
  }
  return data as Profile;
}

async function callSignsFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await db.from("profiles").select("user_id, call_sign").in("user_id", unique);
  fail(error);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Profile[]) {
    map.set(row.user_id, row.call_sign ?? "explorer");
  }
  return map;
}

export async function loadCrew(userId: string): Promise<Crew> {
  const { data, error } = await db
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  fail(error);
  const rows = (data ?? []) as Friendship[];
  const names = await callSignsFor(rows.flatMap((row) => [row.requester_id, row.addressee_id]));
  const other = (row: Friendship) => (row.requester_id === userId ? row.addressee_id : row.requester_id);
  const label = (id: string) => names.get(id) ?? "explorer";

  return {
    friends: rows
      .filter((row) => row.status === "accepted")
      .map((row) => ({
        friendshipId: row.id,
        userId: other(row),
        callSign: label(other(row)),
        since: row.created_at,
      })),
    incoming: rows
      .filter((row) => row.status === "pending" && row.addressee_id === userId)
      .map((row) => ({
        friendshipId: row.id,
        userId: row.requester_id,
        callSign: label(row.requester_id),
        createdAt: row.created_at,
      })),
    outgoing: rows
      .filter((row) => row.status === "pending" && row.requester_id === userId)
      .map((row) => ({
        friendshipId: row.id,
        userId: row.addressee_id,
        callSign: label(row.addressee_id),
        createdAt: row.created_at,
      })),
  };
}

export async function searchCallSigns(query: string, userId: string): Promise<Profile[]> {
  const term = normalizeCallSign(query);
  if (term.length < 2) return [];
  const { data, error } = await db
    .from("profiles")
    .select("user_id, call_sign")
    .not("call_sign", "is", null)
    .ilike("call_sign", `%${term}%`)
    .neq("user_id", userId)
    .order("call_sign")
    .limit(20);
  fail(error);
  return (data ?? []) as Profile[];
}

export async function sendFriendRequest(userId: string, targetId: string) {
  const { error } = await db
    .from("friendships")
    .insert({ requester_id: userId, addressee_id: targetId, status: "pending" });
  if (error) {
    if (String(error.code) === "23505" || /duplicate|unique/i.test(error.message)) {
      throw new Error("You already have a request with that explorer.");
    }
    throw new Error(error.message);
  }
}

export async function acceptFriendRequest(friendshipId: string) {
  const { error } = await db
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", friendshipId);
  fail(error);
}

/** Declines an incoming request, cancels an outgoing one, or removes a friend. */
export async function removeFriendship(friendshipId: string) {
  const { error } = await db.from("friendships").delete().eq("id", friendshipId);
  fail(error);
}
