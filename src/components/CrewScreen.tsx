import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  Loader2,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X as XIcon,
} from "lucide-react";
import {
  acceptFriendRequest,
  callSignError,
  loadCrew,
  loadMyProfile,
  normalizeCallSign,
  removeFriendship,
  saveCallSign,
  searchCallSigns,
  sendFriendRequest,
  type Crew,
  type Profile,
} from "@/lib/friends";

type Tab = "crew" | "add" | "requests";

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
}

export default function CrewScreen({ user, onClose }: { user: User; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("crew");
  const [callSign, setCallSign] = useState("");
  const [savedCallSign, setSavedCallSign] = useState<string | null>(null);
  const [savingSign, setSavingSign] = useState(false);
  const [crew, setCrew] = useState<Crew>({ friends: [], incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCrew(await loadCrew(user.id));
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [profile] = await Promise.all([loadMyProfile(user.id), refresh()]);
        if (cancelled) return;
        setSavedCallSign(profile.call_sign);
        setCallSign(profile.call_sign ?? "");
      } catch (cause) {
        if (!cancelled) setError(message(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, refresh]);

  // ── live call-sign search ──────────────────────────────────────
  useEffect(() => {
    const term = normalizeCallSign(query);
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchCallSigns(term, user.id)
        .then(setResults)
        .catch((cause) => setError(message(cause)))
        .finally(() => setSearching(false));
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query, user.id]);

  const relationship = useMemo(() => {
    const map = new Map<string, "friend" | "incoming" | "outgoing">();
    crew.friends.forEach((entry) => map.set(entry.userId, "friend"));
    crew.incoming.forEach((entry) => map.set(entry.userId, "incoming"));
    crew.outgoing.forEach((entry) => map.set(entry.userId, "outgoing"));
    return map;
  }, [crew]);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 2600);
  };

  const handleSaveCallSign = async () => {
    const problem = callSignError(callSign);
    if (problem) {
      setError(problem);
      return;
    }
    setSavingSign(true);
    setError(null);
    try {
      const profile = await saveCallSign(user.id, callSign);
      setSavedCallSign(profile.call_sign);
      setCallSign(profile.call_sign ?? "");
      flash("Call sign saved. Other explorers can find you now.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSavingSign(false);
    }
  };

  const runAction = async (key: string, action: () => Promise<void>, done: string) => {
    setBusyId(key);
    setError(null);
    try {
      await action();
      await refresh();
      flash(done);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  };

  const invite = (targetId: string) =>
    runAction(targetId, () => sendFriendRequest(user.id, targetId), "Invite sent.");

  const dirty = normalizeCallSign(callSign) !== (savedCallSign ?? "");

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-background px-5 py-6 text-foreground">
      <GridBackdrop />
      <section className="relative z-10 mx-auto w-full max-w-md pb-10">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 text-[10px] tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> BACK TO BASE
          </button>
        </div>

        <p className="mt-6 inline-flex items-center gap-2 text-[10px] tracking-[0.3em] text-accent">
          <Users className="h-3.5 w-3.5" /> EXPEDITION CREW
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Find your next co-explorer.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Build a trusted crew for multiplayer hunts. Friend requests and your call sign are saved to your account.
        </p>

        {/* call sign */}
        <div className="panel mt-7 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-sm font-bold text-accent">
              {(savedCallSign ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="call-sign" className="block text-[9px] tracking-[0.28em] text-muted-foreground">
                YOUR CALL SIGN
              </label>
              <input
                id="call-sign"
                value={callSign}
                onChange={(event) => setCallSign(normalizeCallSign(event.target.value))}
                onKeyDown={(event) => event.key === "Enter" && void handleSaveCallSign()}
                placeholder="pick a call sign"
                maxLength={20}
                className="mt-1 w-full border-b border-border bg-transparent pb-1 text-base outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={handleSaveCallSign}
              disabled={savingSign || !dirty}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[10px] font-bold tracking-[0.2em] text-primary-foreground transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-40"
            >
              {savingSign ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "SAVE"}
            </button>
          </div>
          {!savedCallSign && (
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              Set a call sign so other explorers can search for you.
            </p>
          )}
        </div>

        {/* tabs */}
        <div className="panel mt-5 grid grid-cols-3 gap-1 rounded-2xl p-1">
          {([
            ["crew", "CREW"],
            ["add", "ADD FRIEND"],
            ["requests", "REQUESTS"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`relative rounded-xl px-3 py-3 text-[10px] font-bold tracking-[0.18em] transition-colors ${
                tab === value ? "bg-accent text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {value === "requests" && crew.incoming.length > 0 && (
                <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                  {crew.incoming.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-xs leading-relaxed text-destructive">{error}</p>}
        {notice && <p className="mt-4 text-xs leading-relaxed text-accent">{notice}</p>}

        {loading ? (
          <div className="panel mt-6 grid place-items-center rounded-2xl py-16">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : tab === "crew" ? (
          <>
            <div className="mt-7 flex items-center justify-between">
              <span className="text-[10px] tracking-[0.25em] text-accent">ACTIVE CREW</span>
              <ShieldCheck className="h-4 w-4 text-accent/70" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {crew.friends.length ? `${crew.friends.length} on your roster` : "No one on your roster yet"}
            </p>
            {crew.friends.length === 0 ? (
              <EmptyState
                icon={<UserPlus className="h-5 w-5" />}
                title="Your crew is waiting."
                detail="Search for a call sign to send your first invite."
              />
            ) : (
              <div className="panel mt-4 overflow-hidden rounded-2xl">
                {crew.friends.map((entry, index) => (
                  <Row
                    key={entry.friendshipId}
                    first={index === 0}
                    callSign={entry.callSign}
                    action={
                      <button
                        onClick={() =>
                          void runAction(entry.friendshipId, () => removeFriendship(entry.friendshipId), "Removed from your crew.")
                        }
                        disabled={busyId === entry.friendshipId}
                        className="rounded-lg border border-border px-3 py-1.5 text-[9px] tracking-[0.18em] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                      >
                        REMOVE
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </>
        ) : tab === "add" ? (
          <>
            <div className="panel mt-6 flex items-center gap-3 rounded-2xl px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a call sign…"
                aria-label="Search a call sign"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {searching && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
              Search finds explorers who have set a call sign. Your email stays private.
            </p>

            {normalizeCallSign(query).length < 2 ? (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="Start with two letters."
                detail="Call signs are easier to find than email addresses."
              />
            ) : results.length === 0 && !searching ? (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No call sign matches."
                detail="Check the spelling, or ask them to set a call sign."
              />
            ) : (
              <div className="panel mt-4 overflow-hidden rounded-2xl">
                {results.map((profile, index) => {
                  const state = relationship.get(profile.user_id);
                  return (
                    <Row
                      key={profile.user_id}
                      first={index === 0}
                      callSign={profile.call_sign ?? "explorer"}
                      action={
                        state === "friend" ? (
                          <span className="inline-flex items-center gap-1.5 text-[9px] tracking-[0.18em] text-accent">
                            <Check className="h-3.5 w-3.5" /> IN CREW
                          </span>
                        ) : state === "outgoing" ? (
                          <span className="text-[9px] tracking-[0.18em] text-muted-foreground">INVITED</span>
                        ) : state === "incoming" ? (
                          <span className="text-[9px] tracking-[0.18em] text-accent">ASKED YOU</span>
                        ) : (
                          <button
                            onClick={() => void invite(profile.user_id)}
                            disabled={busyId === profile.user_id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[9px] font-bold tracking-[0.18em] text-primary-foreground transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-50"
                          >
                            {busyId === profile.user_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="h-3.5 w-3.5" />
                            )}
                            ADD
                          </button>
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-7 text-[10px] tracking-[0.25em] text-accent">INCOMING</p>
            <p className="mt-1 text-sm text-muted-foreground">Explorers asking to join your crew</p>
            {crew.incoming.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="panel mt-4 overflow-hidden rounded-2xl">
                {crew.incoming.map((entry, index) => (
                  <Row
                    key={entry.friendshipId}
                    first={index === 0}
                    callSign={entry.callSign}
                    action={
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            void runAction(entry.friendshipId, () => acceptFriendRequest(entry.friendshipId), "Added to your crew.")
                          }
                          disabled={busyId === entry.friendshipId}
                          aria-label={`Accept ${entry.callSign}`}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            void runAction(entry.friendshipId, () => removeFriendship(entry.friendshipId), "Request declined.")
                          }
                          disabled={busyId === entry.friendshipId}
                          aria-label={`Decline ${entry.callSign}`}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </span>
                    }
                  />
                ))}
              </div>
            )}

            <p className="mt-8 text-[10px] tracking-[0.25em] text-accent">OUTGOING</p>
            <p className="mt-1 text-sm text-muted-foreground">Invites waiting for a response</p>
            {crew.outgoing.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="panel mt-4 overflow-hidden rounded-2xl">
                {crew.outgoing.map((entry, index) => (
                  <Row
                    key={entry.friendshipId}
                    first={index === 0}
                    callSign={entry.callSign}
                    action={
                      <button
                        onClick={() =>
                          void runAction(entry.friendshipId, () => removeFriendship(entry.friendshipId), "Invite cancelled.")
                        }
                        disabled={busyId === entry.friendshipId}
                        className="rounded-lg border border-border px-3 py-1.5 text-[9px] tracking-[0.18em] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                      >
                        CANCEL
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Row({ callSign, action, first }: { callSign: string; action: React.ReactNode; first: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3.5 ${first ? "" : "border-t border-border/60"}`}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-[10px] font-bold text-accent">
          {callSign.slice(0, 2).toUpperCase()}
        </span>
        <span className="truncate text-sm font-medium">{callSign}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="panel mt-4 rounded-2xl px-4 py-5 text-center text-[10px] tracking-[0.2em] text-muted-foreground">
      NONE RIGHT NOW
    </div>
  );
}

function EmptyState({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="panel mt-4 grid place-items-center gap-2 rounded-2xl px-6 py-12 text-center">
      <span className="text-accent">{icon}</span>
      <p className="text-base font-bold">{title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-50"
      style={{
        backgroundImage:
          "linear-gradient(oklch(0.8 0.15 78 / .12) 1px, transparent 1px), linear-gradient(90deg, oklch(0.8 0.15 78 / .12) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        maskImage: "radial-gradient(circle at 50% 36%, black, transparent 78%)",
      }}
    />
  );
}
