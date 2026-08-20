import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as Localization from "expo-localization";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { getLocalUserProfile, getSetting, setSetting, SETTINGS_KEYS } from "../data/tallyRepo";
import type { SQLiteDatabase } from "expo-sqlite";
import { openTallyDatabase } from "./openTallyDatabase";
import type { TallyDb } from "./tallyDb";
import {
  collectLocalOnlyRowIds,
  createTallySupabaseClient,
  markRowsForUpload,
  pullAllFromSupabase,
  pushMergedToSupabase,
  TALLY_SUPABASE_TABLES,
} from "../sync/supabaseSync";
import {
  isCloudSyncDisabledByBuildEnv,
  isSyncConfigured,
} from "../sync/config";
import { usePremium } from "../premium/PremiumContext";
import { useRemoteConfig } from "../premium/RemoteConfigContext";
import { configBool } from "../core/remoteConfig";
import { guardNetworkCall } from "../core/networkGuard";
import { applyPendingAccountDeletionIfAny } from "../core/clearAppStorage";
import {
  fetchAccountCloudSyncPref,
  pushAccountCloudSyncPref,
} from "../sync/profilePrefsSync";
import type {
  EnableSyncResult,
  LocalOnlyCounts,
  MergeChoice,
} from "../sync/postLoginSync";
import { parseLocalSyncPref, resolveSyncPref } from "../sync/postLoginSync";

/** Batch rapid local writes before uploading (lower = snappier sync, more requests). */
const PUSH_DEBOUNCE_MS = 400;
/** Fallback poll when Realtime is slow or unavailable. */
const PULL_INTERVAL_MS = 30_000;
/** Coalesce noisy `postgres_changes` bursts into one pull. */
const REALTIME_PULL_DEBOUNCE_MS = 350;
/** Avoid hammering the network when the app foregrounds repeatedly. */
const FOREGROUND_SYNC_MIN_GAP_MS = 2_500;

export type TallyDataContext = {
  db: TallyDb;
  /** Raw sqlite (for `Supabase` sync helpers that need `expo-sqlite` types). */
  sqlite: SQLiteDatabase;
  /**
   * Incremented after local writes and after a successful `Supabase` pull. Use in `useTallyQuery` deps
   * so lists refresh if the DB change hook misses a batch.
   */
  dataRevision: number;
  /** Latest cloud sync / error state. */
  syncState: { busy: boolean; lastError: string | null; lastOkAt: number | null };
  cloudSyncUserEnabled: boolean;
  cloudSyncUserPrefReady: boolean;
  cloudSyncCanBeUsed: boolean;
  cloudSyncBuildDisabled: boolean;
  /**
   * Saved email on this device (from profile). Cloud sync is only *effective* when this is true
   * and the user has turned the toggle on, even if the preference is still “on” briefly while saving.
   */
  localUserHasProfileEmail: boolean;
  /** Re-read local profile email (e.g. after profile save) so the cloud toggle can turn on. */
  revalidateLocalUserForSync: () => Promise<void>;
  setCloudSyncUserEnabled: (enabled: boolean) => Promise<EnableSyncResult>;
  /** Non-null while the pre-sync merge overlay should be on screen. */
  mergePrompt: { email: string; counts: LocalOnlyCounts } | null;
  /** Answer the merge overlay; resumes the suspended `setCloudSyncUserEnabled`. */
  resolveMergePrompt: (choice: MergeChoice) => void;
  /** Call after auth-linked SQLite id remap so screens reload member lists. */
  bumpDataRevision: () => void;
  /**
   * Called by `AuthSQLiteBinding` once the local SQLite user id is confirmed
   * bound to the authenticated uid. Gates the launch sync: before it, writes
   * would go up under `DEFAULT_LOCAL_USER_ID`. The flag itself stays internal
   * to the provider — nothing outside it needs to read the state, only set it.
   */
  markAuthLinkReady: () => void;
  /**
   * Pull-to-refresh: upload pending changes then pull remote (when cloud sync is on),
   * otherwise only bump `dataRevision` so local queries reload.
   */
  refreshCloudData: () => Promise<void>;
  /** Premium subscription required for cloud sync when IAP product IDs are configured (native builds). */
  cloudSyncPremiumBlocked: boolean;
};

const TallyData = createContext<TallyDataContext | null>(null);

const webMinFill: ViewStyle | false =
  Platform.OS === "web"
    ? ({ minHeight: "100vh", width: "100%" } as unknown as ViewStyle)
    : false;

type Opened = { sqlite: import("expo-sqlite").SQLiteDatabase; tally: TallyDb };

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const premium = usePremium();
  const { session: authSession, loading: authSessionLoading } =
    useSupabaseSession();
  const { config } = useRemoteConfig();
  // Derived once, not read inline: the provider hands back a NEW frozen object
  // on every successful fetch even when the payload is identical, so depending
  // on `config` itself would rebuild `doFullSync` on every refresh — and
  // `doFullSync` is a dependency of the realtime-subscription effect, so each
  // one would tear down and re-establish the channel and trigger a full sync.
  // The boolean only changes when the flag actually changes.
  const syncEnabled = configBool(config, "sync_enabled", true);
  const [value, setValue] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [syncState, setSyncState] = useState<{
    busy: boolean;
    lastError: string | null;
    lastOkAt: number | null;
  }>({ busy: false, lastError: null, lastOkAt: null });
  const [cloudUserEnabled, setCloudUserEnabled] = useState(false);
  const [cloudPrefReady, setCloudPrefReady] = useState(false);
  const [localUserHasProfileEmail, setLocalUserHasProfileEmail] = useState(false);
  const [authLinkReady, setAuthLinkReady] = useState(false);
  const autoSyncedForUidRef = useRef<string | null>(null);
  // Guards re-entrancy of the launch-sync effect's async body for the SAME
  // uid: premium/email-confirmation dependency changes can fire again before
  // the previous run finishes, and `autoSyncedForUidRef` alone can't catch
  // that because it is only latched once a run actually completes.
  const autoSyncInFlightRef = useRef(false);
  // Set by the in-flight guard when a dependency change lands while a run is
  // already underway. The async body loops (see the `do/while` below) while
  // this is true, so the wakeup is retried instead of silently discarded —
  // discarding it is what stranded sync for the whole session when premium
  // resolved during the initial `fetchAccountCloudSyncPref` round trip.
  const autoSyncPendingRef = useRef(false);
  const [mergePrompt, setMergePrompt] = useState<{
    email: string;
    counts: LocalOnlyCounts;
  } | null>(null);

  const canUseCloud = isSyncConfigured() && !isCloudSyncDisabledByBuildEnv();
  const buildDisabled = isCloudSyncDisabledByBuildEnv();
  // Cloud sync is a paid feature. `premium.isPremium` already reflects the
  // canonical mix (profiles.is_premium for signed-in users, IAP for native,
  // permissive for signed-out users), so we no longer need the `iapGatingEnabled`
  // wrapper that previously let signed-in non-premium users bypass on web/dev.
  const cloudSyncPremiumBlocked = !premium.isPremium;
  // Sync is blocked until the Supabase account's email is confirmed. An
  // unverified account can still write to Supabase, but the data would be
  // orphaned if the user never completes verification, and we don't want
  // to mark premium / leak data before we know the email is real.
  const emailConfirmed = Boolean(authSession?.user?.email_confirmed_at);
  const cloudSyncEffective =
    canUseCloud &&
    cloudUserEnabled &&
    localUserHasProfileEmail &&
    emailConfirmed &&
    !cloudSyncPremiumBlocked;

  const valueRef = useRef<Opened | null>(null);
  valueRef.current = value;
  // Mirrors the auto-sync effect's eligibility inputs. Reassigned on every
  // render (like `valueRef` above) so the effect's async body can re-check
  // eligibility after an `await` from the CURRENT render's values instead of
  // the stale closure it was created with — needed for the `do/while` retry
  // loop in the auto-sync effect below.
  const eligibilityRef = useRef({
    canUseCloud,
    emailConfirmed,
    isPremium: premium.isPremium,
    hasEmail: localUserHasProfileEmail,
  });
  eligibilityRef.current = {
    canUseCloud,
    emailConfirmed,
    isPremium: premium.isPremium,
    hasEmail: localUserHasProfileEmail,
  };
  // Tracks the signed-in uid for the CURRENT render, reassigned every render
  // like `valueRef`/`eligibilityRef` above. The auto-sync loop can be
  // suspended across an `await` while the user signs out (which nulls
  // `autoSyncedForUidRef` and releases the merge prompt) and back in; when the
  // suspended frame resumes it must not latch the uid it started with unless
  // that uid is still the current session's uid, or a resumed frame from a
  // stale session would silently re-latch and skip the next sign-in's launch
  // push.
  const currentUidRef = useRef<string | null>(authSession?.user?.id ?? null);
  currentUidRef.current = authSession?.user?.id ?? null;
  // Holds the `resolve` of the promise `promptMergeDecision` is awaiting, so
  // the overlay's button press can complete an async flow started elsewhere.
  const mergeResolverRef = useRef<((c: MergeChoice) => void) | null>(null);
  const resolveMergePrompt = useCallback((choice: MergeChoice) => {
    const resolve = mergeResolverRef.current;
    mergeResolverRef.current = null;
    setMergePrompt(null);
    resolve?.(choice);
  }, []);
  // Single-flights the enable path of `setCloudSyncUserEnabled` (see below):
  // holds the in-progress promise so a second concurrent caller joins it
  // instead of starting another `clearMergeGate` / `doFullSync` run.
  const enableInFlightRef = useRef<Promise<EnableSyncResult> | null>(null);
  const pushDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doPush = useCallback(async () => {
    if (!valueRef.current || !canUseCloud || !cloudUserEnabled) return;
    if (!localUserHasProfileEmail) return;
    if (!emailConfirmed) return;
    if (!premium.isPremium) return;
    if (!syncEnabled) return;
    const c = createTallySupabaseClient();
    if (!c) return;
    setSyncState((s) => ({ ...s, busy: true, lastError: null }));
    try {
      await pushMergedToSupabase(c, valueRef.current.sqlite);
      setSyncState({ busy: false, lastError: null, lastOkAt: Date.now() });
    } catch (e) {
      setSyncState({
        busy: false,
        lastError: e instanceof Error ? e.message : String(e),
        lastOkAt: null,
      });
    }
  }, [
    canUseCloud,
    cloudUserEnabled,
    localUserHasProfileEmail,
    emailConfirmed,
    premium.isPremium,
    syncEnabled,
  ]);

  const schedulePush = useCallback(() => {
    if (!canUseCloud || !cloudUserEnabled || !localUserHasProfileEmail) return;
    if (!premium.isPremium) return;
    if (pushDebounce.current) clearTimeout(pushDebounce.current);
    pushDebounce.current = setTimeout(() => {
      pushDebounce.current = null;
      void doPush();
    }, PUSH_DEBOUNCE_MS);
  }, [
    canUseCloud,
    cloudUserEnabled,
    localUserHasProfileEmail,
    premium.isPremium,
    doPush,
  ]);

  const schedulePushRef = useRef(schedulePush);
  schedulePushRef.current = schedulePush;
  const openDbCallbackRef = useRef(() => {});
  openDbCallbackRef.current = () => {
    setDataRevision((n) => n + 1);
    schedulePushRef.current();
  };

  useEffect(() => {
    let c = true;
    void (async () => {
      try {
        // Must run BEFORE openTallyDatabase so the wipe happens with no live
        // SQLite handle racing with `DELETE FROM`. The flag is set by the
        // delete-account flow right before `reloadAppAsync`.
        await applyPendingAccountDeletionIfAny();
        const o = await openTallyDatabase(() => openDbCallbackRef.current());
        if (c) setValue(o);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      c = false;
    };
  }, []);

  /**
   * Serialises syncs so two never overlap on the one SQLite connection.
   *
   * `pullAllFromSupabase` and `markRowsForUpload` each issue a bare `BEGIN`,
   * and SQLite has no nested transactions — an overlapping run's `ROLLBACK`
   * aborts the other's transaction mid-write. Six call sites reach
   * `doFullSync` (periodic poll, foreground catch-up, realtime subscribe,
   * realtime change, the enable path, the launch path) and several can fire
   * in the same tick: enabling sync flips `cloudSyncEffective`, which mounts
   * the realtime effect, whose `SUBSCRIBED` callback syncs immediately —
   * while the enable's own sync is still running.
   *
   * Chained rather than dropped: a queued caller's work still happens, so a
   * pull can't silently swallow a pending push.
   */
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  const doFullSync = useCallback(
    async (includePush: boolean, o?: { bypassProfileEmailCheck?: boolean }) => {
      // Eligibility is checked before queuing so a no-op call doesn't extend
      // the chain and make a real sync wait behind it.
      if (!valueRef.current || !canUseCloud) return;
      if (!o?.bypassProfileEmailCheck && !localUserHasProfileEmail) return;
      if (!emailConfirmed) return;
      if (!premium.isPremium) return;
      if (!syncEnabled) return;
      const client = createTallySupabaseClient();
      if (!client) return;

      const run = syncChainRef.current.then(async () => {
        // Re-read: the database can be reopened while this run is queued.
        const v = valueRef.current;
        if (!v) return;
        setSyncState((s) => ({ ...s, busy: true, lastError: null }));
        try {
          if (includePush) {
            await pushMergedToSupabase(client, v.sqlite);
          } else {
            await pullAllFromSupabase(client, v.sqlite);
          }
          setDataRevision((n) => n + 1);
          setSyncState({ busy: false, lastError: null, lastOkAt: Date.now() });
        } catch (e) {
          setSyncState({
            busy: false,
            lastError: e instanceof Error ? e.message : String(e),
            lastOkAt: null,
          });
        }
      });
      // The body above catches everything, so `run` should never reject — but
      // swallow here too, or one escaped throw would poison the chain and
      // silently kill every later sync.
      syncChainRef.current = run.catch(() => {});
      return run;
    },
    [
      canUseCloud,
      localUserHasProfileEmail,
      emailConfirmed,
      premium.isPremium,
      syncEnabled,
    ],
  );

  // After open: resolve the profile email, then the cloud preference
  // (disabling cloud if it was on without an email). The launch sync used to
  // live here too; it now belongs to the auth-link-gated effect below, which
  // cannot run before the local id is bound to the authenticated uid.
  useEffect(() => {
    if (!value) return;
    let alive = true;
    void (async () => {
      const profile = await getLocalUserProfile(value.tally);
      if (!alive) return;
      const authEmail = authSession?.user?.email?.trim() ?? "";
      const hasEmail = Boolean(profile.email?.trim() || authEmail);
      setLocalUserHasProfileEmail(hasEmail);
      const raw = await getSetting(
        value.tally,
        SETTINGS_KEYS.cloudSyncUserEnabled,
      );
      const wants = raw === "1" || raw === "true";
      if (wants && !hasEmail) {
        await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "0");
        if (!alive) return;
        setCloudUserEnabled(false);
      } else {
        if (!alive) return;
        setCloudUserEnabled(wants);
      }
      setCloudPrefReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [value, authSession?.user?.email]);

  // When local data changes, re-read email and turn cloud off if it was removed.
  useEffect(() => {
    if (!value) return;
    void (async () => {
      const profile = await getLocalUserProfile(value.tally);
      const authEmail = authSession?.user?.email?.trim() ?? "";
      const hasEmail = Boolean(profile.email?.trim() || authEmail);
      setLocalUserHasProfileEmail(hasEmail);
      if (hasEmail) return;
      const on = await getSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled);
      if (on === "1" || on === "true") {
        await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "0");
        setCloudUserEnabled(false);
        setSyncState((s) => ({ ...s, lastError: null, busy: false }));
      }
    })();
  }, [value, dataRevision, authSession?.user?.email]);

  // When Supabase auth session loads (email), refresh cloud eligibility without waiting for local writes.
  useEffect(() => {
    if (!value || authSessionLoading) return;
    void (async () => {
      const profile = await getLocalUserProfile(value.tally);
      const authEmail = authSession?.user?.email?.trim() ?? "";
      setLocalUserHasProfileEmail(Boolean(profile.email?.trim() || authEmail));
    })();
  }, [value, authSession?.user?.email, authSessionLoading]);

  // Signing out unbinds the local id (`performLocalSignOutCleanup`), so the
  // link signal has to drop with it — otherwise the next sign-in would look
  // already-linked and could sync against the previous account's id.
  useEffect(() => {
    if (!authSession?.user?.id) {
      setAuthLinkReady(false);
      autoSyncedForUidRef.current = null;
      // An external sign-out (e.g. a refresh-token failure) can land while
      // the merge overlay is up. `promptMergeDecision`'s promise only
      // resolves from a button press, so without releasing these here the
      // auto-sync effect's `finally` never runs, `autoSyncInFlightRef` stays
      // true forever, and every later sign-in in this process is blocked at
      // the in-flight guard.
      autoSyncInFlightRef.current = false;
      autoSyncPendingRef.current = false;
      if (mergeResolverRef.current) {
        resolveMergePrompt("dismiss");
      }
    }
  }, [authSession?.user?.id, resolveMergePrompt]);

  // Periodic pull when cloud is effectively on.
  useEffect(() => {
    if (!value || !cloudSyncEffective) return;
    const id = setInterval(() => void doFullSync(false), PULL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [value, cloudSyncEffective, doFullSync]);

  // When returning to the app, catch up (pull + push) without waiting for the poll interval.
  const lastForegroundSyncAtRef = useRef(0);
  useEffect(() => {
    if (!value || !cloudSyncEffective) return;
    const onChange = (next: AppStateStatus) => {
      if (next !== "active") return;
      const now = Date.now();
      if (now - lastForegroundSyncAtRef.current < FOREGROUND_SYNC_MIN_GAP_MS) return;
      lastForegroundSyncAtRef.current = now;
      void doFullSync(true);
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [value, cloudSyncEffective, doFullSync]);

  // Realtime: re-pull on any public table change.
  useEffect(() => {
    if (!value || !cloudSyncEffective) return;
    const c = createTallySupabaseClient();
    if (!c) return;
    const deb = (fn: () => void) => {
      let p: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (p) clearTimeout(p);
        p = setTimeout(() => {
          p = null;
          fn();
        }, REALTIME_PULL_DEBOUNCE_MS);
      };
    };
    const dPull = deb(() => void doFullSync(false));
    const channelName = "tally-sync-" + String(Platform.OS);
    const rch = c.channel(channelName);
    TALLY_SUPABASE_TABLES.forEach((table) => {
      (rch as { on: (a: string, f: object, c: () => void) => typeof rch }).on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        dPull,
      );
    });
    rch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void doFullSync(false);
      }
    });
    return () => {
      void c.removeChannel(rch);
    };
  }, [value, cloudSyncEffective, doFullSync]);

  const revalidateLocalUserForSync = useCallback(async () => {
    if (!value) return;
    const p = await getLocalUserProfile(value.tally);
    const authEmail = authSession?.user?.email?.trim() ?? "";
    setLocalUserHasProfileEmail(Boolean(p.email?.trim() || authEmail));
  }, [value, authSession?.user?.email]);

  const bumpDataRevision = useCallback(() => {
    setDataRevision((n) => n + 1);
  }, []);

  const markAuthLinkReady = useCallback(() => {
    setAuthLinkReady(true);
  }, []);

  const refreshCloudData = useCallback(async () => {
    if (!valueRef.current) return;
    if (!canUseCloud || !cloudUserEnabled || !localUserHasProfileEmail) {
      setDataRevision((n) => n + 1);
      return;
    }
    if (!premium.isPremium) {
      setDataRevision((n) => n + 1);
      return;
    }
    const client = createTallySupabaseClient();
    if (!client) {
      setDataRevision((n) => n + 1);
      return;
    }
    setSyncState((s) => ({ ...s, busy: true, lastError: null }));
    // Joins the same chain as `doFullSync`: pull-to-refresh is user-initiated
    // and can land on top of a poll or realtime sync, nesting `BEGIN` on the
    // one SQLite connection. Unlike `doFullSync` this one must keep rejecting,
    // so the catch below can still distinguish offline from a real failure.
    const run = syncChainRef.current.then(() =>
      guardNetworkCall(async () => {
        // Re-read: the database can be reopened while this run is queued.
        const v = valueRef.current;
        if (!v) return;
        await pushMergedToSupabase(client, v.sqlite);
        await pullAllFromSupabase(client, v.sqlite);
      }),
    );
    syncChainRef.current = run.then(
      () => {},
      () => {},
    );
    try {
      await run;
      setDataRevision((n) => n + 1);
      setSyncState({ busy: false, lastError: null, lastOkAt: Date.now() });
    } catch (e) {
      const isOffline =
        e instanceof Error && e.name === "OfflineError";
      setSyncState({
        busy: false,
        lastError: isOffline ? "offline" : e instanceof Error ? e.message : String(e),
        lastOkAt: null,
      });
      setDataRevision((n) => n + 1);
    }
  }, [
    canUseCloud,
    cloudUserEnabled,
    localUserHasProfileEmail,
    premium.isPremium,
  ]);

  /** Suspend until the user answers the merge overlay. */
  const promptMergeDecision = useCallback(
    (email: string, counts: LocalOnlyCounts): Promise<MergeChoice> =>
      new Promise<MergeChoice>((resolve) => {
        mergeResolverRef.current = resolve;
        setMergePrompt({ email, counts });
      }),
    [],
  );

  /**
   * Everything that must happen before the first sync of a session: find the
   * rows a pull would delete, ask the user when there are any, and protect
   * them if they chose to merge.
   *
   * Returns false when the user dismissed — the caller must not enable sync.
   */
  const clearMergeGate = useCallback(
    async (
      client: ReturnType<typeof createTallySupabaseClient>,
      sqlite: SQLiteDatabase,
      email: string,
    ): Promise<boolean> => {
      if (!client) return true;
      const localOnly = await collectLocalOnlyRowIds(client, sqlite);
      const atRisk = localOnly.groupCount > 0 || localOnly.expenseCount > 0;
      if (!atRisk) return true;

      const choice = await promptMergeDecision(email, {
        groupCount: localOnly.groupCount,
        expenseCount: localOnly.expenseCount,
      });
      if (choice === "dismiss") return false;
      if (choice === "merge") {
        // Queue on the same chain as the syncs. `markRowsForUpload` issues a
        // bare `BEGIN`, and while the designed path runs it with
        // `cloudUserEnabled` still false — so the poll and realtime effects are
        // unmounted and nothing else holds a transaction — that is an argument
        // from call-site ordering, not a guarantee. Chaining makes it one.
        const marking = syncChainRef.current.then(() =>
          markRowsForUpload(sqlite, localOnly.byTable),
        );
        syncChainRef.current = marking.then(
          () => {},
          () => {},
        );
        // Deliberately NOT best-effort: syncing with these rows unprotected is
        // precisely the data loss this gate exists to prevent, so a failure
        // here must abort rather than fall through. Awaiting `marking` (not the
        // error-swallowing copy above) is what keeps the throw.
        await marking;
      }
      return true;
    },
    [promptMergeDecision],
  );

  const setCloudSyncUserEnabled = useCallback(
    async (enabled: boolean): Promise<EnableSyncResult> => {
      if (!value) return "ineligible";

      if (!enabled) {
        // Disable is immediate — no merge gate, no network round trip before
        // returning — so it deliberately does NOT go through the in-flight
        // guard below, which exists only to serialize the slow enable path.
        setCloudUserEnabled(false);
        await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "0");
        setSyncState((s) => ({ ...s, lastError: null, busy: false }));
        void pushAccountCloudSyncPref(false);
        return "applied";
      }

      // Single-flight the enable path: there are now two callers (the
      // Account toggle and the launch effect), and this path spans
      // `getLocalUserProfile` plus up to 8 network round-trips
      // (`clearMergeGate`'s remote id scans, then `doFullSync`'s pull/push).
      // Without this guard a concurrent second call would orphan the first
      // caller's promise forever AND run a second `doFullSync(true)` on the
      // same SQLite connection — nested `db.execAsync("BEGIN")` throws and
      // the loser's `ROLLBACK` aborts the winner's transaction mid-write. A
      // concurrent caller joins the SAME promise instead of starting a second
      // flow. It must NOT synthesize "dismissed" here: the launch effect maps
      // "dismissed" to turning sync back off, which would undo a concurrent
      // caller's successful enable.
      if (enableInFlightRef.current) return enableInFlightRef.current;

      const run = (async (): Promise<EnableSyncResult> => {
        if (!premium.isPremium) return "ineligible";
        const p = await getLocalUserProfile(value.tally);
        const email = p.email?.trim() ?? "";
        if (!email) return "ineligible";
        setLocalUserHasProfileEmail(true);

        if (canUseCloud) {
          const client = createTallySupabaseClient();
          try {
            const proceed = await clearMergeGate(client, value.sqlite, email);
            if (!proceed) return "dismissed";
          } catch {
            // We couldn't determine what was at risk, so we must not run the
            // destructive pull. Leave the preference untouched and let the user
            // retry — reporting this as ineligible surfaces the existing alert.
            return "ineligible";
          }
        }

        setCloudUserEnabled(true);
        await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "1");
        void pushAccountCloudSyncPref(true);

        if (canUseCloud) {
          try {
            await doFullSync(true, { bypassProfileEmailCheck: true });
          } catch {
            // keep preference
          }
        }
        return "applied";
      })();

      enableInFlightRef.current = run;
      try {
        return await run;
      } finally {
        enableInFlightRef.current = null;
      }
    },
    [value, canUseCloud, doFullSync, premium.isPremium, clearMergeGate],
  );

  // `doFullSync` and `setCloudSyncUserEnabled` both re-check `premium.isPremium`
  // internally, so a stale capture silently no-ops. The auto-sync loop can span a
  // network round-trip during which entitlements resolve, so it must invoke the
  // CURRENT callbacks, not the ones captured when the run was scheduled — reading
  // fresh eligibility and then calling a stale callee is what latched sync off.
  const doFullSyncRef = useRef(doFullSync);
  doFullSyncRef.current = doFullSync;
  const setCloudSyncUserEnabledRef = useRef(setCloudSyncUserEnabled);
  setCloudSyncUserEnabledRef.current = setCloudSyncUserEnabled;

  // Sync once per sign-in, as soon as the local id is bound to the auth uid.
  //
  // Gated on `authLinkReady` rather than on the session email: the email lands
  // the moment Supabase restores the session, which can precede
  // `remapLocalUserIdInSqlite` and would push rows under DEFAULT_LOCAL_USER_ID.
  //
  // A device that has never chosen (`localPref === null`) inherits the account
  // default, so a fresh install signing in to an account with sync on starts
  // syncing without the user hunting for the toggle. An explicit local choice
  // always wins — that is what keeps sync off on a shared laptop.
  //
  // The merge gate (`setCloudSyncUserEnabled` -> `clearMergeGate`) protects
  // exactly ONE transition: this device going from "never chosen here" to
  // "on". A device that already holds an explicit "1" already went through
  // that transition on a previous enable (or predates the gate); routing it
  // through the gate again on every launch would arm the periodic/foreground/
  // realtime pull effects — `cloudSyncEffective` is already true by then via
  // the post-open effect's `cloudUserEnabled` state — while the gate's 8
  // sequential round-trips are still running, so the pull would almost always
  // win the race and the user would be asked to merge rows that are already
  // gone. So `resolved.inherited === false` skips the gate and syncs directly,
  // byte-for-byte the launch behavior that existed before this branch. Only
  // `resolved.inherited === true` (the genuine first-enable-on-this-device
  // case) goes through `setCloudSyncUserEnabled`. Residual exposure on an
  // already-enabled device is pre-existing, not introduced here.
  //
  // Both branches below are gated on the SAME `eligible` check, computed
  // once from `eligibilityRef` before either runs. Previously only the
  // `inherited` branch checked eligibility; the `!inherited` branch called
  // `doFullSync` (which itself silently no-ops when `!premium.isPremium`)
  // and then latched the uid unconditionally. That permanently skipped the
  // launch PUSH for an already-enabled device when premium resolved after
  // this effect first ran — the next thing to touch the account became the
  // realtime `SUBSCRIBED` callback's bare `doFullSync(false)` pull, with no
  // push first, which could delete rows created offline.
  useEffect(() => {
    if (!value || !authLinkReady || !cloudPrefReady) return;
    const uid = authSession?.user?.id;
    if (!uid) return;
    // Once per signed-in uid — not on every dependency change.
    if (autoSyncedForUidRef.current === uid) return;
    // Re-entrancy guard for the SAME uid: a dependency change (e.g. premium
    // resolving) can fire the effect again while the async body below is
    // still running, before `autoSyncedForUidRef` is latched.
    if (autoSyncInFlightRef.current) {
      // A dependency changed while we were awaiting. Record it — returning
      // silently here is what let a late-resolving premium check strand sync
      // for the whole session.
      autoSyncPendingRef.current = true;
      return;
    }
    autoSyncInFlightRef.current = true;

    void (async () => {
      try {
        // Retries the body in place when a dependency change landed mid-await
        // (see the in-flight guard above): without this, that wakeup would be
        // dropped and nothing would reschedule the effect for the rest of the
        // session in the exact late-premium fresh-install case this design
        // targets.
        do {
          autoSyncPendingRef.current = false;

          const localPref = parseLocalSyncPref(
            await getSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled),
          );
          // Only consult the account when this device has no opinion — a device
          // that merely inherited the value must not echo it back.
          const accountPref =
            localPref === null ? await fetchAccountCloudSyncPref() : null;
          const resolved = resolveSyncPref({ accountPref, localPref });
          if (resolved.kind === "off") {
            // Only latch if this uid is still the signed-in one — a sign-out
            // during the awaits above already reset `autoSyncedForUidRef` to
            // null and released any parked prompt; re-latching a stale uid
            // here would make the next sign-in with that uid short-circuit.
            if (currentUidRef.current === uid) {
              autoSyncedForUidRef.current = uid;
            }
            return;
          }

          // Re-read eligibility from the ref, not the render closure: this
          // effect invocation's closure over `canUseCloud`/`emailConfirmed`/
          // `premium.isPremium`/`localUserHasProfileEmail` reflects whichever
          // render scheduled THIS run, which can be stale by the time we get
          // here — especially on a looped pass, where the very reason we're
          // looping is that one of these changed while the awaits above were
          // in flight. `eligibilityRef` is reassigned on every render, so
          // reading it here always sees the latest values.
          const {
            canUseCloud: c,
            emailConfirmed: e,
            isPremium,
            hasEmail,
          } = eligibilityRef.current;
          const eligible = c && e && isPremium && hasEmail;

          if (!eligible) {
            // Do NOT persist the preference or latch the uid here.
            // `premium.isPremium` and `emailConfirmed` resolve asynchronously
            // (PremiumContext's entitlement fetch races AuthSQLiteBinding's
            // bootstrap), so "not eligible yet" is routinely true on the very
            // first pass after sign-in — it is not a final answer. Arming
            // the pref now would flip `cloudSyncEffective` true (via the
            // post-open effect's `cloudUserEnabled`) the instant premium/email
            // land, enabling the ungated periodic/foreground/realtime pull
            // BEFORE the merge prompt ever runs. `continue` rather than
            // `return`: if eligibility landed during the awaits above, the
            // in-flight guard has already set `autoSyncPendingRef`, and the
            // `while` below will loop us back to recheck instead of stranding
            // sync for the rest of the session. If nothing changed, the loop
            // condition is false and we fall out exactly as a plain `return`
            // would have, and the effect's own dependency list (`premium.
            // isPremium`, `emailConfirmed`, `localUserHasProfileEmail` are
            // all below) covers eligibility landing after this async body has
            // fully exited.
            continue;
          }

          if (!resolved.inherited) {
            // Invoke the CURRENT `doFullSync`, not the one captured when this
            // run was scheduled — see `doFullSyncRef` above.
            await doFullSyncRef.current(true, { bypassProfileEmailCheck: true });
            // `doFullSync` returns void, so there's no result to inspect.
            // Re-read eligibility fresh instead of trusting the snapshot from
            // before the await: if it changed underneath us (or we signed
            // out/into a different uid), the sync we just ran may itself have
            // silently no-opped, so latching would strand sync exactly like
            // the bug this fix targets.
            const stillEligible =
              eligibilityRef.current.canUseCloud &&
              eligibilityRef.current.emailConfirmed &&
              eligibilityRef.current.isPremium &&
              eligibilityRef.current.hasEmail;
            if (stillEligible && currentUidRef.current === uid) {
              autoSyncedForUidRef.current = uid;
              return;
            }
            // Didn't latch, so the sync above may have silently no-opped.
            // `continue` rather than `return`: if a dependency landed during
            // the awaits, the in-flight guard recorded it in
            // `autoSyncPendingRef` and the loop condition will retry with
            // fresh values. Returning here would discard that wakeup — the
            // effect will not re-fire for a transition that already happened.
            // When nothing is pending the condition is false and this falls
            // out exactly as the old `return` did.
            continue;
          }

          // Routing through `setCloudSyncUserEnabled` rather than calling
          // `doFullSync` directly is deliberate: it is the single place that runs
          // the merge gate, so login and the Account toggle cannot diverge.
          // Invoke the CURRENT callback — see `setCloudSyncUserEnabledRef` above.
          const result = await setCloudSyncUserEnabledRef.current(true);
          if (result === "dismissed") {
            // The user declined the merge. Suppress syncing for this session so the
            // periodic pull / foreground / realtime effects can't delete the rows
            // they just declined to upload — but deliberately do NOT persist "0" or
            // push an account default: they declined a merge, not cloud sync, and
            // the stored preference must stay as it was so they are asked again on
            // the next launch.
            setCloudUserEnabled(false);
          }
          // "ineligible" means the callback did nothing (stale premium read,
          // missing profile email, etc.) — latching on it is the same
          // latch-after-no-op bug as the stale-closure issue this round
          // fixes. Only "applied" and "dismissed" are genuine outcomes; leave
          // the uid unlatched otherwise so a later dependency change (this
          // effect's own deps cover premium/email/profile-email) retries.
          if (result !== "ineligible" && currentUidRef.current === uid) {
            autoSyncedForUidRef.current = uid;
            return;
          }
          // Same reasoning as the `!inherited` branch above: an unlatched pass
          // means nothing happened, so a wakeup recorded during the awaits
          // must be honoured rather than dropped. Bounded — `autoSyncPendingRef`
          // is only ever set by the effect's in-flight guard, which requires a
          // genuine dependency change, and nothing in this loop writes state
          // that could trigger one.
          continue;
        } while (autoSyncPendingRef.current);
      } finally {
        autoSyncInFlightRef.current = false;
      }
    })().catch((e) => {
      // Nothing upstream awaits this IIFE. The try/finally above always
      // clears `autoSyncInFlightRef`, but without a `.catch` a throw here
      // would still become an unhandled promise rejection.
      console.error("[DatabaseProvider] post-login auto-sync failed:", e);
    });
  }, [
    value,
    authLinkReady,
    cloudPrefReady,
    authSession?.user?.id,
    canUseCloud,
    emailConfirmed,
    premium.isPremium,
    localUserHasProfileEmail,
    doFullSync,
    setCloudSyncUserEnabled,
  ]);

  if (error) {
    const copy = describeDbOpenError(error);
    return (
      <View style={[styles.center, webMinFill]}>
        <Text style={styles.err}>{copy.title}</Text>
        <Text style={styles.sub}>{copy.body}</Text>
        {copy.canRetry && Platform.OS === "web" ? (
          <Pressable
            onPress={() => window.location.reload()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.dbErrRetry, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.dbErrRetryLabel}>{copy.retryLabel}</Text>
          </Pressable>
        ) : null}
        {__DEV__ ? (
          <Text style={styles.hint}>
            {`${error}\n\nIf this appeared after a quick reload, try full reload or clear Metro: npx expo start -c`}
          </Text>
        ) : null}
      </View>
    );
  }

  if (!value) {
    return (
      <View style={[styles.center, webMinFill]}>
        <ActivityIndicator size="large" />
        <Text style={styles.sub}>Loading…</Text>
      </View>
    );
  }

  return (
    <TallyData.Provider
      value={{
        db: value.tally,
        sqlite: value.sqlite,
        dataRevision,
        syncState,
        cloudSyncUserEnabled: cloudUserEnabled,
        cloudSyncUserPrefReady: cloudPrefReady,
        cloudSyncCanBeUsed: canUseCloud,
        cloudSyncBuildDisabled: buildDisabled,
        localUserHasProfileEmail,
        revalidateLocalUserForSync,
        setCloudSyncUserEnabled,
        mergePrompt,
        resolveMergePrompt,
        bumpDataRevision,
        markAuthLinkReady,
        refreshCloudData,
        cloudSyncPremiumBlocked,
      }}
    >
      {children}
    </TallyData.Provider>
  );
}

export function useTallyData(): TallyDataContext {
  const v = useContext(TallyData);
  if (!v) throw new Error("useTallyData / useDatabase need DatabaseProvider");
  return v;
}

export function useDatabase(): TallyDb {
  return useTallyData().db;
}

/**
 * User-facing copy for a failed database open.
 *
 * `DatabaseProvider` mounts *outside* `LocaleProvider` (see `App.tsx`), so
 * `t()` isn't reachable here — the strings are inlined per locale and the
 * language is read straight off the device.
 *
 * The case worth naming is the multi-tab one. On web the database lives in
 * OPFS, which allows a single writer: opening Tally in a second tab (very
 * easy to do by following a `/join/:token` share link while the app is
 * already open) makes the second tab fail with a `NoModificationAllowedError`
 * from `createSyncAccessHandle`. That isn't a corrupt database and there is
 * nothing for the user to clear — they just need the other tab closed.
 */
function describeDbOpenError(message: string): {
  title: string;
  body: string;
  retryLabel: string;
  canRetry: boolean;
} {
  const lang = Localization.getLocales()[0]?.languageCode ?? "en";
  const alreadyOpenElsewhere =
    Platform.OS === "web" &&
    (message.includes("createSyncAccessHandle") ||
      message.includes("NoModificationAllowedError") ||
      message.includes("Access Handles cannot be created"));

  if (alreadyOpenElsewhere) {
    if (lang === "fa") {
      return {
        title: "تالی در یک تب دیگر باز است",
        body: "تالی روی وب فقط می‌تواند در یک تب باز باشد. تب‌های دیگر تالی را ببندید و دوباره تلاش کنید.",
        retryLabel: "تلاش دوباره",
        canRetry: true,
      };
    }
    if (lang === "es") {
      return {
        title: "Tally ya está abierto en otra pestaña",
        body: "En la web, Tally solo puede estar abierto en una pestaña. Cierra las demás pestañas de Tally y vuelve a intentarlo.",
        retryLabel: "Reintentar",
        canRetry: true,
      };
    }
    return {
      title: "Tally is already open in another tab",
      body: "On the web Tally can only be open in one tab at a time. Close the other Tally tabs, then try again.",
      retryLabel: "Try again",
      canRetry: true,
    };
  }

  if (lang === "fa") {
    return {
      title: "پایگاه داده باز نشد",
      body: "دوباره تلاش کنید. اگر ادامه داشت، برنامه را ببندید و دوباره باز کنید.",
      retryLabel: "تلاش دوباره",
      canRetry: true,
    };
  }
  if (lang === "es") {
    return {
      title: "No se pudo abrir la base de datos",
      body: "Vuelve a intentarlo. Si el problema continúa, cierra la aplicación y ábrela de nuevo.",
      retryLabel: "Reintentar",
      canRetry: true,
    };
  }
  return {
    title: "Could not open database",
    body: "Try again. If this keeps happening, close the app and reopen it.",
    retryLabel: "Try again",
    canRetry: true,
  };
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  err: { fontSize: 17, fontWeight: "600", marginBottom: 8 },
  sub: { color: "#666", textAlign: "center" },
  dbErrRetry: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#10B981",
  },
  dbErrRetryLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  hint: {
    marginTop: 20,
    color: "#333",
    textAlign: "center",
    lineHeight: 22,
  },
});
