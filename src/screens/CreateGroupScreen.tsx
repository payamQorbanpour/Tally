import { randomUUID } from "expo-crypto";
import {
  StackActions,
  useFocusEffect,
  useNavigation,
  type NavigationProp,
} from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "../ui/AppText";
import { TextInput, type AppTextInputRef } from "../ui/AppTextInput";
import { AppSwitch } from "../ui/AppSwitch";
import { useDatabase } from "../db/DatabaseContext";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type {
  GroupsStackParamList,
  RootStackParamList,
} from "../navigation/types";
import {
  createGroup,
  getSetting,
  listFriendContacts,
  SETTINGS_KEYS,
  type GroupType,
  type FriendContactRow,
} from "../data/tallyRepo";
import {
  CURRENCY_OPTIONS,
  currencyLabel,
  currencySymbol,
  isValidCurrencyCode,
} from "../data/currencies";
import { PersonAvatar } from "../components/PersonAvatar";
import { SimplifyDebtsIllustration } from "../components/SimplifyDebtsIllustration";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import { isGroupTypePickerEnabled } from "../core/featureFlags";
import { usePremium } from "../premium/PremiumContext";

type Props = NativeStackScreenProps<GroupsStackParamList, "CreateGroup">;

type MemberDraft = {
  key: string;
  name: string;
  linkedUserId: string | null;
  /** Snapshot when linked; cleared only if the name is edited away from this. */
  linkedNameAt: string | null;
};

function emptyMember(): MemberDraft {
  return {
    key: randomUUID(),
    name: "",
    linkedUserId: null,
    linkedNameAt: null,
  };
}

function buildCreateGroupStyles(colors: ThemeColors, cardShadow: ShadowStyle) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
    gap: 0,
    maxWidth: 600,
    width: "100%" as const,
    alignSelf: "center" as const,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  /**
   * Mint-tinted pill input matching the spec for GROUP NAME — leading
   * people icon, single-line bold text input. Edit mirrors this shape.
   */
  namePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.owedSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  namePillIcon: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  namePillInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  /**
   * Two-line currency picker pill — code symbol bubble on the left, the
   * full label and a "used for all expenses" subline stacked in the middle,
   * chevron on the right. Mirrors the design's mint-soft pill, distinct
   * from the input style above so the press target reads as "tap to pick"
   * rather than "type here."
   */
  currencyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.owedSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  currencyPillSymbol: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyPillSymbolText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  currencyPillTextCol: { flex: 1, minWidth: 0 },
  currencyPillTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  currencyPillSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  iconBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  iconBtnPlaceholder: {
    borderStyle: "dashed",
    backgroundColor: colors.surface,
  },
  iconImg: { width: 56, height: 56 },
  iconPlus: {
    fontSize: 24,
    fontWeight: "300",
    color: colors.primary,
    lineHeight: 26,
  },
  headerNameWrap: { flex: 1, minWidth: 0 },
  headerNameInput: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  clearPhoto: { marginTop: 4, marginBottom: 16 },
  clearPhotoText: { fontSize: 13, color: colors.owe, fontWeight: "600" },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 8,
    paddingLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    backgroundColor: colors.inputSurface,
    color: colors.text,
    fontWeight: "600",
  },
  pickerField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pickerText: { flex: 1, fontSize: 16, color: colors.text },
  pickerChevron: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 18 },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardRim,
    backgroundColor: colors.surface,
  },
  typeChipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.owedSoft,
  },
  typeChipText: { fontSize: 14, fontWeight: "600", color: colors.text },
  typeChipTextOn: { color: colors.primary },
  simplifyCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    ...cardShadow,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  switchLabelWrap: { flex: 1, paddingRight: 8 },
  switchTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  switchSub: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 },
  peopleSection: {
    marginTop: 28,
    padding: 16,
    paddingBottom: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  sectionSub: { fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: 4 },
  peopleComposer: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.inputSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
  },
  memberChipLinked: {
    borderColor: colors.primary,
    backgroundColor: colors.owedSoft,
  },
  memberChipText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  chipRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  draftInput: {
    minWidth: 0,
  },
  removeBtnText: {
    fontSize: 22,
    color: colors.owe,
    fontWeight: "400",
    lineHeight: 24,
  },
  suggestBox: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  suggestName: { fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 },
  suggestAction: { fontSize: 13, fontWeight: "700", color: colors.primary },
  suggestMuted: { fontSize: 13, color: colors.muted, padding: 10 },
  /**
   * "+ Add a person" row mirrors the AddExpense composer (same icon
   * bubble, same primary-tinted label) — taps swap the row content for an
   * inline TextInput plus check / close affordances.
   */
  addPersonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    marginTop: 8,
  },
  /** When sandwiched inside the suggested-friends card the row drops the
   *  outer border + radius + margin so it reads as just another row. */
  addPersonRowEmbedded: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    marginTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  addPersonIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.owedSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  addPersonLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
    flex: 1,
  },
  addPersonInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
  },
  /** SUGGESTED card section (image #11). Sits below the MEMBERS composer.
   *  Each row has the friend's avatar + name + a small "from {group}" sub
   *  in muted text + a circular "+" affordance on the right. The Invite-
   *  by-link row uses an accent background so it reads as a different kind
   *  of action from the suggestion list above. */
  suggestedCard: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    overflow: "hidden",
  },
  peopleSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.inputSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  peopleSearchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
  },
  /**
   * Caps the suggestions list to ~5 rows; longer lists scroll inside the
   * card so the Add-a-person + Invite-by-link affordances below stay
   * pinned and reachable without first scrolling through every friend.
   */
  suggestedScroll: { maxHeight: 5 * 60 },
  peopleSearchEmpty: { paddingVertical: 18, paddingHorizontal: 14 },
  peopleSearchEmptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  suggestedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestedItemLast: { borderBottomWidth: 0 },
  suggestedItemTextCol: { flex: 1, minWidth: 0 },
  suggestedItemName: { fontSize: 15, fontWeight: "700", color: colors.text },
  suggestedItemSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  suggestedAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.owedSoft,
  },
  inviteCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteCardCol: { flex: 1, minWidth: 0 },
  inviteCardTitle: { fontSize: 14, fontWeight: "800", color: colors.primary },
  inviteCardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  /** Empty-state CTA shown above the search input when no members are added yet. */
  peopleEmptyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  peopleEmptyIcon: { color: colors.primary },
  peopleEmptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  /** Tick shown next to the currently selected currency in the picker list. */
  rowCheck: { marginLeft: 8, color: colors.primary },
  /** Header right "Save" link — mirrors AddExpense's kit-header save. */
  headerSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerSaveBtnDisabled: { opacity: 0.45 },
  headerSaveText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  modalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  modalClose: { fontSize: 17, color: colors.primary, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: { backgroundColor: colors.owedSoft },
  rowPressed: { opacity: 0.85 },
  rowCode: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    width: 44,
    fontVariant: ["tabular-nums"],
  },
  rowLabel: { flex: 1, fontSize: 15, color: colors.text },
  empty: { padding: 24, textAlign: "center", color: colors.muted, fontSize: 15 },
  secondaryBtn: {
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", color: colors.primary },
});
}

export function CreateGroupScreen({ navigation, route }: Props) {
  const db = useDatabase();
  const bumpGroupsList = useBumpGroupsList();
  const { t, isRTL } = useLocale();
  const { colors, shadows } = useTheme();
  const { isPremium } = usePremium();
  const rootNav = useNavigation<NavigationProp<RootStackParamList>>();
  const styles = useMemo(
    () => buildCreateGroupStyles(colors, shadows.card),
    [colors, shadows.card],
  );

  const groupTypes = useMemo(
    () =>
      (
        [
          ["home", "createGroup.typeHome"],
          ["trip", "createGroup.typeTrip"],
          ["couple", "createGroup.typeCouple"],
          ["other", "createGroup.typeOther"],
        ] as const
      ).map(([value, key]) => ({
        value: value as GroupType,
        label: t(key),
      })),
    [t],
  );

  const showGroupTypePicker = useMemo(() => isGroupTypePickerEnabled(), []);

  const [groupName, setGroupName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const iconDataUri: string | null = null;
  const [groupType, setGroupType] = useState<GroupType>("other");
  const [simplifyDebts, setSimplifyDebts] = useState(false);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  /**
   * Always-visible suggested-friends list (image #11 design). Sourced from
   * the user's *saved friends list* (`listFriendContacts`) — not every
   * `users` row across all groups — so people seeded by old expense splits
   * don't leak into Create Group's picker.
   */
  const [allFriends, setAllFriends] = useState<FriendContactRow[]>([]);
  /** Local query that filters `allFriends` by case-insensitive name match. */
  const [peopleSearch, setPeopleSearch] = useState("");
  /**
   * Inline "+ Add a person" row mirrors the AddExpense composer:
   * idle = single tappable row, active = inline input with submit/cancel.
   * Replaces the previous "type a name and tap return" green-pill block.
   */
  const [addPersonInline, setAddPersonInline] = useState(false);
  const addPersonInputRef = useRef<AppTextInputRef>(null);
  useEffect(() => {
    const p = route.params?.linkNewFriend;
    if (!p?.id) return;
    navigation.setParams({ linkNewFriend: undefined });
    setMembers((prev) => {
      if (prev.some((m) => m.linkedUserId === p.id)) return prev;
      return [
        ...prev,
        {
          ...emptyMember(),
          name: p.name,
          linkedUserId: p.id,
          linkedNameAt: p.name,
        },
      ];
    });
    setDraftName("");
  }, [navigation, route.params?.linkNewFriend]);

  useEffect(() => {
    void (async () => {
      const c = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
      if (c && isValidCurrencyCode(c)) setCurrency(c);
    })();
  }, [db]);

  // Pull the saved-friends list once at mount for the persistent SUGGESTED
  // section. We refresh on focus too via useFocusEffect below so a friend
  // added from the Friends tab shows up after navigating back.
  useEffect(() => {
    void (async () => {
      const rows = await listFriendContacts(db);
      setAllFriends(rows);
    })();
  }, [db]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = q
      ? CURRENCY_OPTIONS.filter(
          (x) =>
            x.code.toLowerCase().includes(q) ||
            x.label.toLowerCase().includes(q),
        )
      : [...CURRENCY_OPTIONS];
    // Float the currently selected currency to the top so the user can see
    // their current pick at a glance (with a tick) without scrolling.
    const selectedIdx = matches.findIndex((x) => x.code === currency);
    if (selectedIdx > 0) {
      const [sel] = matches.splice(selectedIdx, 1);
      matches.unshift(sel);
    }
    return matches;
  }, [search, currency]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        // Refresh the saved-friends list when returning from Friends-tab
        // "add friend" so the new contact appears here.
        const all = await listFriendContacts(db);
        if (live) setAllFriends(all);
      })();
      return () => {
        live = false;
      };
    }, [db]),
  );

  /**
   * Friends not yet added to this draft group, narrowed by the in-card
   * search query. The chips above hold what's *in* the draft; this list
   * is everyone else from saved-friends still available to add.
   */
  const suggestedToAdd = useMemo(() => {
    const linkedIds = new Set(
      members
        .map((m) => m.linkedUserId)
        .filter((id): id is string => !!id),
    );
    const q = peopleSearch.trim().toLowerCase();
    return allFriends.filter((f) => {
      if (linkedIds.has(f.id)) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allFriends, members, peopleSearch]);

  const onInviteByLinkPress = useCallback(async () => {
    if (busy) return;
    const message = t("friends.inviteShareMessage");
    if (Platform.OS === "web") {
      const nav = (typeof navigator !== "undefined" ? navigator : null) as
        | (Navigator & { share?: (data: { text?: string }) => Promise<void> })
        | null;
      if (nav?.share) {
        try {
          await nav.share({ text: message });
        } catch {
          /* user cancelled */
        }
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      /* user cancelled */
    }
  }, [busy, t]);

  const linkSuggestion = (friend: { id: string; name: string }) => {
    setMembers((prev) => [
      ...prev,
      {
        ...emptyMember(),
        name: friend.name,
        linkedUserId: friend.id,
        linkedNameAt: friend.name,
      },
    ]);
    setDraftName("");
  };

  const commitDraft = () => {
    const t = draftName.trim();
    if (!t || busy) return;
    setMembers((prev) => [...prev, { ...emptyMember(), name: t }]);
    setDraftName("");
  };

  const removeMember = (key: string) => {
    setMembers((prev) => prev.filter((m) => m.key !== key));
  };

  const save = async () => {
    if (!groupName.trim() || busy) return;
    Keyboard.dismiss();
    const draftTrim = draftName.trim();
    const payloadMembers = [
      ...members
        .filter((m) => m.name.trim())
        .map((m) => ({
          linkedUserId: m.linkedUserId,
          name: m.name.trim(),
        })),
      ...(draftTrim
        ? [{ linkedUserId: null as string | null, name: draftTrim }]
        : []),
    ];
    setBusy(true);
    try {
      const id = await createGroup(db, {
        name: groupName,
        currency,
        icon: iconDataUri,
        groupType: showGroupTypePicker ? groupType : "other",
        simplifyDebts,
        queueForTypeLabeling: !showGroupTypePicker,
        members: payloadMembers,
      });
      bumpGroupsList();
      navigation.dispatch(StackActions.replace("GroupDetail", { groupId: id }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.alert(`${t("createGroup.errSave")}\n\n${msg}`);
        }
      } else {
        Alert.alert(t("createGroup.errSave"), msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const openPicker = () => {
    setSearch("");
    setPickerOpen(true);
  };

  const pickCode = (code: string) => {
    setCurrency(code);
    setPickerOpen(false);
  };

  const canSave = groupName.trim().length > 0;

  // Stable forwarders so headerRight can call into the latest closure
  // without forcing the header to re-render on every keystroke.
  const saveRef = useRef<() => Promise<void> | void>(() => {});
  const canSaveRef = useRef<boolean>(canSave);
  const busyRef = useRef<boolean>(busy);
  saveRef.current = save;
  canSaveRef.current = canSave;
  busyRef.current = busy;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            if (!canSaveRef.current || busyRef.current) return;
            void saveRef.current();
          }}
          disabled={!canSave || busy}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            busy ? t("createGroup.saving") : t("createGroup.saveGroup")
          }
          style={({ pressed }) => [
            styles.headerSaveBtn,
            (!canSave || busy) && styles.headerSaveBtnDisabled,
            pressed && canSave && !busy && styles.pressed,
          ]}
        >
          <Text style={styles.headerSaveText}>
            {busy ? t("createGroup.saving") : t("createGroup.saveGroup")}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, canSave, busy, styles, t]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        <Text style={styles.label}>{t("createGroup.groupName")}</Text>
        <View style={styles.namePill}>
          <View style={styles.namePillIcon}>
            <Ionicons
              name="people-outline"
              size={18}
              color={colors.primary}
            />
          </View>
          <TextInput
            style={styles.namePillInput}
            value={groupName}
            onChangeText={setGroupName}
            placeholder={t("createGroup.placeholderName")}
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            editable={!busy}
            accessibilityLabel={t("createGroup.groupName")}
          />
        </View>

        {showGroupTypePicker ? (
          <>
            <Text style={styles.label}>{t("createGroup.groupType")}</Text>
            <View style={styles.typeRow}>
              {groupTypes.map(({ value, label }) => (
                <Pressable
                  key={value}
                  style={[
                    styles.typeChip,
                    groupType === value && styles.typeChipOn,
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setGroupType(value);
                  }}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      groupType === value && styles.typeChipTextOn,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>{t("createGroup.currency")}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.currencyPill,
            pressed && styles.pressed,
          ]}
          onPress={openPicker}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t("createGroup.currency")}
        >
          <View style={styles.currencyPillSymbol}>
            <Text style={styles.currencyPillSymbolText}>
              {currencySymbol(currency)}
            </Text>
          </View>
          <View style={styles.currencyPillTextCol}>
            <Text style={styles.currencyPillTitle} numberOfLines={1}>
              {currencyLabel(currency)}
            </Text>
            <Text style={styles.currencyPillSub} numberOfLines={1}>
              {t("createGroup.currencySub")}
            </Text>
          </View>
          <Ionicons
            name="chevron-down"
            size={18}
            color={colors.primary}
          />
        </Pressable>

        <View style={styles.peopleSection}>
        <Text style={styles.sectionTitle}>{t("createGroup.people")}</Text>
        <Text style={styles.sectionSub}>{t("createGroup.peopleHint")}</Text>

        {members.length > 0 ? (
          <View style={styles.chipRow}>
            {members.map((m) => (
              <View
                key={m.key}
                style={[
                  styles.memberChip,
                  m.linkedUserId ? styles.memberChipLinked : null,
                ]}
              >
                <Text style={styles.memberChipText} numberOfLines={1}>
                  {m.name}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.chipRemoveBtn,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => removeMember(m.key)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={t("friends.deleteFriend")}
                >
                  <Text style={styles.removeBtnText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.suggestedCard}>
          <View style={styles.peopleSearchRow}>
            <Ionicons name="search-outline" size={16} color={colors.muted} />
            <TextInput
              style={styles.peopleSearchInput}
              value={peopleSearch}
              onChangeText={setPeopleSearch}
              placeholder={t("createGroup.searchFriendsPlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel={t("createGroup.searchFriendsPlaceholder")}
            />
            {peopleSearch.length > 0 ? (
              <Pressable
                onPress={() => setPeopleSearch("")}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("createGroup.done")}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            ) : null}
          </View>
          {suggestedToAdd.length > 0 ? (
            <ScrollView
              style={styles.suggestedScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {suggestedToAdd.map((s) => (
                <View key={s.id} style={styles.suggestedItem}>
                  <PersonAvatar name={s.name} avatarUri={null} size={36} />
                  <View style={styles.suggestedItemTextCol}>
                    <Text style={styles.suggestedItemName} numberOfLines={1}>
                      {s.name}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => linkSuggestion(s)}
                    disabled={busy}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.suggestedAddBtn,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t("createGroup.link")}
                  >
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : peopleSearch.trim().length > 0 ? (
            <View style={styles.peopleSearchEmpty}>
              <Text style={styles.peopleSearchEmptyText}>
                {t("groupDetail.noMatchingFriends")}
              </Text>
            </View>
          ) : null}
          {addPersonInline ? (
            <View style={[styles.addPersonRow, styles.addPersonRowEmbedded]}>
              <View style={styles.addPersonIcon}>
                <Ionicons name="add" size={18} color={colors.primary} />
              </View>
              <TextInput
                ref={addPersonInputRef}
                value={draftName}
                onChangeText={setDraftName}
                placeholder={t("createGroup.peopleInputPlaceholder")}
                placeholderTextColor={colors.muted}
                style={styles.addPersonInput}
                onSubmitEditing={() => {
                  commitDraft();
                  setAddPersonInline(false);
                }}
                returnKeyType="done"
                autoFocus
                editable={!busy}
                accessibilityLabel={t("createGroup.peopleInputPlaceholder")}
              />
              <Pressable
                onPress={() => {
                  commitDraft();
                  setAddPersonInline(false);
                }}
                disabled={!draftName.trim() || busy}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("createGroup.addPerson")}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={26}
                  color={draftName.trim() ? colors.primary : colors.muted}
                />
              </Pressable>
              <Pressable
                onPress={() => {
                  setDraftName("");
                  setAddPersonInline(false);
                }}
                disabled={busy}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("createGroup.done")}
              >
                <Ionicons name="close-circle" size={26} color={colors.muted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setAddPersonInline(true);
                requestAnimationFrame(() =>
                  addPersonInputRef.current?.focus(),
                );
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t("createGroup.addPerson")}
              style={({ pressed }) => [
                styles.addPersonRow,
                styles.addPersonRowEmbedded,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.addPersonIcon}>
                <Ionicons name="add" size={18} color={colors.primary} />
              </View>
              <Text style={styles.addPersonLabel}>
                {t("createGroup.addPerson")}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onInviteByLinkPress}
            disabled={busy}
            style={({ pressed }) => [
              styles.inviteCard,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("createGroup.inviteByLink")}
          >
            <View style={styles.inviteCardIcon}>
              <Ionicons
                name="link-outline"
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.inviteCardCol}>
              <Text style={styles.inviteCardTitle}>
                {t("createGroup.inviteByLink")}
              </Text>
              <Text style={styles.inviteCardSub}>
                {t("createGroup.inviteByLinkSub")}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.primary}
            />
          </Pressable>
        </View>
        </View>

        <View style={styles.simplifyCard}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelWrap}>
              <Text style={styles.switchTitle}>{t("createGroup.simplifyDebts")}</Text>
              <Text style={styles.switchSub}>{t("createGroup.simplifyHint")}</Text>
            </View>
            <AppSwitch
              value={simplifyDebts}
              onValueChange={(v) => {
                if (v && !isPremium) {
                  rootNav.navigate("Plans");
                  return;
                }
                setSimplifyDebts(v);
              }}
              disabled={busy}
            />
          </View>
          <SimplifyDebtsIllustration
            colors={colors}
            caption={t("createGroup.simplifyIllustrationCaption")}
            simplifyWord={t("createGroup.simplifyDiagramWord")}
            onePaymentLabel={t("createGroup.simplifyOnePayment")}
          />
        </View>

      </ScrollView>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("createGroup.modalCurrency")}</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
              <Text style={styles.modalClose}>{t("createGroup.done")}</Text>
            </Pressable>
          </View>
          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t("createGroup.searchPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.code === currency;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    isSelected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => pickCode(item.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={styles.rowCode}>{item.code}</Text>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      style={styles.rowCheck}
                    />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>{t("createGroup.emptySearch")}</Text>
            }
          />
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

