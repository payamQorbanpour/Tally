import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";
import { Field } from "../ui/Field";
import { TextInput } from "../ui/AppTextInput";
import { SwipeableDeleteRow } from "../ui/SwipeableDeleteRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { PersonAvatar } from "../components/PersonAvatar";
import { useDatabase } from "../db/DatabaseContext";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import { isValidOptionalEmail } from "../data/emailValidation";
import { formatMinorWithSymbol, isValidCurrencyCode } from "../data/currencies";
import {
  createFriendContact,
  deleteFriendContact,
  formatMinor,
  getLocalUserId,
  getOverallBalanceForUser,
  getSetting,
  listFriendContacts,
  listFriendSummaries,
  SETTINGS_KEYS,
  updateFriendContact,
  type FriendContactRow,
  type FriendSummaryRow,
  type OverallBalanceByCurrency,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import type { MainTabParamList } from "../navigation/types";

type FriendsRouteProps = BottomTabScreenProps<MainTabParamList, "Friends">;

type FormState =
  | { open: false }
  | { open: true; mode: "add" }
  | { open: true; mode: "edit"; contact: FriendContactRow };

function buildFriendsStyles(
  colors: ThemeColors,
  isRTL: boolean,
  cardShadow: ShadowStyle,
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };

  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    listContent: {
      paddingHorizontal: 20,
      flexGrow: 1,
    },
    column: { width: "100%", maxWidth: 640, alignSelf: "center" },

    headerAnchor: {
      backgroundColor: colors.bg,
      zIndex: 2,
    },

    /* ── Title row ────────────────────────────────────────────────── */
    titleRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 8,
    },
    titleCol: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.4,
      ...te,
    },
    subtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
      ...te,
    },
    addBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    /* ── Search ───────────────────────────────────────────────────── */
    searchWrap: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.inputSurface,
      marginTop: 8,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      padding: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
    },

    /* ── Net summary card (people-owe-you / you-owe) ─────────────── */
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      padding: 14,
      flexDirection: isRTL ? "row-reverse" : "row",
      gap: 10,
      ...cardShadow,
    },
    summaryCol: { flex: 1, paddingHorizontal: 6, paddingVertical: 4 },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    summaryLabelOwed: {
      fontSize: 11,
      color: colors.muted,
      fontWeight: "700",
      letterSpacing: 0.5,
      ...te,
    },
    summaryLabelOwe: {
      fontSize: 11,
      color: colors.muted,
      fontWeight: "700",
      letterSpacing: 0.5,
      ...te,
    },
    summaryAmountOwed: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.owed,
      marginTop: 4,
      letterSpacing: -0.2,
      fontVariant: ["tabular-nums"],
      ...te,
    },
    summaryAmountOwe: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.owe,
      marginTop: 4,
      letterSpacing: -0.2,
      fontVariant: ["tabular-nums"],
      ...te,
    },

    /* ── Friend cards ─────────────────────────────────────────────── */
    cardsWrap: { marginTop: 16, gap: 10 },
    friendCardShell: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      ...cardShadow,
    },
    friendCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      overflow: "hidden",
    },
    friendCardDeleting: { opacity: 0.55 },
    friendRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarLetter: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.primary,
    },
    mainCol: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontWeight: "700", color: colors.text },
    email: { fontSize: 12, color: colors.muted, marginTop: 2 },

    rowMenuBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    rowSummaryCol: {
      alignItems: "flex-end",
      flexShrink: 0,
      gap: 2,
    },
    rowSummaryEyebrow: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.6,
    },
    rowSummaryAmount: {
      fontSize: 15,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    rowSummaryDash: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.muted,
      paddingHorizontal: 8,
    },

    emptyInline: {
      color: colors.muted,
      lineHeight: 22,
      paddingVertical: 24,
      paddingHorizontal: 14,
      textAlign: "center",
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      ...cardShadow,
    },

    /* ── Invite pill (kit's compact version) ──────────────────────── */
    invitePill: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.owedSoft,
      marginTop: 16,
    },
    inviteIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    inviteCol: { flex: 1, minWidth: 0 },
    inviteTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
      ...te,
    },
    inviteBody: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
      ...te,
    },

    pressed: { opacity: 0.85 },

    /* ── Add/Edit modal ───────────────────────────────────────────── */
    formRoot: {
      flex: 1,
      paddingHorizontal: 20,
      backgroundColor: colors.bg,
    },
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    formTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
    formCancel: { fontSize: 16, color: colors.primary, fontWeight: "600" },
    fieldInput: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 16,
      backgroundColor: colors.inputSurface,
      color: colors.text,
      borderWidth: 1,
      borderColor: "transparent",
    },
    inputInvalid: {
      borderColor: colors.owe,
      borderWidth: 1.5,
    },
    formSaveBtn: { marginTop: 24 },
    formSaveBtnText: { fontWeight: "700" },
  });
}

export function FriendsScreen({ navigation, route }: FriendsRouteProps) {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { t, isRTL } = useLocale();
  const { width } = useWindowDimensions();
  const styles = useMemo(
    () => buildFriendsStyles(colors, isRTL, shadows.card),
    [colors, isRTL, shadows.card],
  );
  const [contacts, setContacts] = useState<FriendContactRow[]>([]);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ open: false });
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [totals, setTotals] = useState<OverallBalanceByCurrency[]>([]);
  const [defaultCcy, setDefaultCcy] = useState("USD");
  /**
   * Set while the native iOS share sheet is up. iOS does not block RN's touch
   * system from delivering taps that land outside the activity view's frame,
   * so a tap meant to dismiss the sheet would also fire the friend row's
   * `onPress` (opening Edit Friend). We render a full-screen transparent
   * `Pressable` while this is true to absorb those taps.
   */
  const [sharing, setSharing] = useState(false);
  const pendingReturnToCreateGroup = useRef(false);

  useEffect(() => {
    const name = route.params?.openAddWithName;
    if (!name?.trim()) return;
    pendingReturnToCreateGroup.current = !!route.params?.returnToCreateGroup;
    setFormName(name.trim());
    setFormEmail("");
    setForm({ open: true, mode: "add" });
    navigation.setParams({
      openAddWithName: undefined,
      returnToCreateGroup: undefined,
    });
  }, [navigation, route.params?.openAddWithName, route.params?.returnToCreateGroup]);

  const [summaries, setSummaries] = useState<FriendSummaryRow[]>([]);
  const load = useCallback(async () => {
    const c = await listFriendContacts(db);
    setContacts(c);
    const ccyRaw = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (ccyRaw && isValidCurrencyCode(ccyRaw)) setDefaultCcy(ccyRaw);
    const tot = await getOverallBalanceForUser(db, getLocalUserId());
    setTotals(tot);
    const s = await listFriendSummaries(db, getLocalUserId());
    setSummaries(s);
  }, [db]);
  const summaryByFriend = useMemo(() => {
    const m = new Map<string, FriendSummaryRow>();
    for (const s of summaries) m.set(s.friendId, s);
    return m;
  }, [summaries]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openAdd = () => {
    pendingReturnToCreateGroup.current = false;
    setFormName("");
    setFormEmail("");
    setForm({ open: true, mode: "add" });
  };

  const openEdit = (c: FriendContactRow) => {
    if (deletingContactId !== null) return;
    setFormName(c.name);
    setFormEmail(c.email ?? "");
    setForm({ open: true, mode: "edit", contact: c });
  };

  const closeForm = () => {
    setForm({ open: false });
    setFormBusy(false);
    if (pendingReturnToCreateGroup.current) {
      pendingReturnToCreateGroup.current = false;
      navigation.navigate("Groups", { screen: "CreateGroup" });
    }
  };

  const submitForm = async () => {
    const name = formName.trim();
    if (!name || formBusy) return;
    const emailTrim = formEmail.trim();
    if (!isValidOptionalEmail(emailTrim)) {
      Alert.alert(t("friends.invalidEmailTitle"), t("friends.invalidEmail"));
      return;
    }
    setFormBusy(true);
    try {
      const email = emailTrim ? emailTrim : null;
      const savedAsAdd = form.open && form.mode === "add";
      let createdFriendId: string | null = null;
      if (savedAsAdd) {
        createdFriendId = await createFriendContact(db, { name, email });
      } else if (form.open && form.mode === "edit") {
        await updateFriendContact(db, form.contact.id, { name, email });
      }
      await load();
      const goBackToCreateGroup = pendingReturnToCreateGroup.current;
      pendingReturnToCreateGroup.current = false;
      setForm({ open: false });
      setFormBusy(false);
      if (goBackToCreateGroup) {
        navigation.navigate("Groups", {
          screen: "CreateGroup",
          params:
            savedAsAdd && createdFriendId
              ? { linkNewFriend: { id: createdFriendId, name } }
              : {},
        });
      }
    } catch (e) {
      setFormBusy(false);
      const msg = e instanceof Error ? e.message : "Error";
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    }
  };

  const performDelete = async (c: FriendContactRow) => {
    setDeletingContactId(c.id);
    try {
      await deleteFriendContact(db, c.id);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setDeletingContactId(null);
    }
  };

  const confirmDelete = (c: FriendContactRow) => {
    const msg = t("friends.deleteFriendConfirm", { name: c.name });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) {
        void performDelete(c);
      }
      return;
    }
    Alert.alert(t("friends.deleteFriend"), msg, [
      { text: t("friends.cancel"), style: "cancel" },
      {
        text: t("friends.deleteFriend"),
        style: "destructive",
        onPress: () => void performDelete(c),
      },
    ]);
  };

  const onRowMenuPress = (c: FriendContactRow) => {
    if (deletingContactId !== null) return;
    if (Platform.OS === "web") {
      // Web doesn't get a native action sheet — fall through to edit.
      openEdit(c);
      return;
    }
    Alert.alert(c.name, undefined, [
      { text: t("friends.editFriend"), onPress: () => openEdit(c) },
      {
        text: t("friends.deleteFriend"),
        style: "destructive",
        onPress: () => confirmDelete(c),
      },
      { text: t("friends.cancel"), style: "cancel" },
    ]);
  };

  const onInvitePress = useCallback(async () => {
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
    setSharing(true);
    try {
      await Share.share({ message });
    } catch {
      /* user cancelled */
    } finally {
      setSharing(false);
    }
  }, [t]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = q.length === 0
      ? [...contacts]
      : contacts.filter((c) => {
          if (c.name.toLowerCase().includes(q)) return true;
          if (c.email?.toLowerCase().includes(q)) return true;
          return false;
        });
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [contacts, query]);

  const scrollRef = useRef<ScrollView>(null);
  const { refreshing, onRefresh, onScrollWhileRefreshing } =
    useRefreshWithBackgroundSync(load, {
      scrollToTop: () => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      },
    });

  const canSaveForm =
    formName.trim().length > 0 &&
    isValidOptionalEmail(formEmail.trim()) &&
    !formBusy;
  const formEmailInvalid =
    form.open && !isValidOptionalEmail(formEmail.trim());

  const listBottomPad = Math.max(24, 12 + insets.bottom);
  const listTopPad = Math.max(8, insets.top);
  const maxContentWidth = width >= 980 ? 820 : undefined;

  const initial = (name: string) =>
    (name.trim().slice(0, 1) || "•").toUpperCase();

  const sumTotals = useMemo(() => {
    return totals.reduce(
      (acc, r) => {
        acc.owed += r.owedMinor;
        acc.owe += r.owesMinor;
        return acc;
      },
      { owed: 0, owe: 0 },
    );
  }, [totals]);
  const summaryCcy = totals[0]?.currency ?? defaultCcy;
  const peopleCount = contacts.length;

  return (
    <View style={styles.wrap}>
      <View style={[styles.headerAnchor, { paddingTop: listTopPad }]}>
        <View
          style={[
            styles.column,
            maxContentWidth ? { maxWidth: maxContentWidth } : null,
          ]}
        >
          <View style={styles.titleRow}>
            <View style={styles.titleCol}>
              <Text style={styles.title}>{t("friends.title")}</Text>
              <Text style={styles.subtitle}>
                {t("friends.peopleCount", { count: String(peopleCount) })}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.addBtn,
                pressed && styles.pressed,
              ]}
              onPress={openAdd}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("friends.addFriend")}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onScroll={onScrollWhileRefreshing}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: listBottomPad },
        ]}
      >
        <View style={[styles.column, maxContentWidth ? { maxWidth: maxContentWidth } : null]}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t("friends.searchPlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!formBusy}
            />
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabelOwed}>
                {t("friends.filterOwesYou").toUpperCase()}
              </Text>
              <Text style={styles.summaryAmountOwed} numberOfLines={1}>
                {formatMinor(sumTotals.owed, summaryCcy)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabelOwe}>
                {t("friends.filterYouOwe").toUpperCase()}
              </Text>
              <Text style={styles.summaryAmountOwe} numberOfLines={1}>
                {formatMinor(sumTotals.owe, summaryCcy)}
              </Text>
            </View>
          </View>

          <View style={styles.cardsWrap}>
            {filteredContacts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyInline}>
                  {query.trim().length > 0
                    ? t("friends.noMatchingFriends")
                    : t("friends.contactEmpty")}
                </Text>
              </View>
            ) : (
              filteredContacts.map((c) => {
                const deleting = deletingContactId === c.id;
                const deleteLocked = deletingContactId !== null;
                return (
                  <View key={c.id} style={styles.friendCardShell}>
                    <SwipeableDeleteRow
                      isRTL={isRTL}
                      cardEdgeRadius={14}
                      disabled={deleting || deleteLocked}
                      onRequestDelete={() => confirmDelete(c)}
                      accessibilityLabel={t("friends.deleteFriendA11y", { name: c.name })}
                    >
                    <View
                      style={[
                        styles.friendCard,
                        deleting && styles.friendCardDeleting,
                      ]}
                    >
                      <Pressable
                        style={({ pressed }) => [
                          styles.friendRow,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => openEdit(c)}
                        onLongPress={() => onRowMenuPress(c)}
                        disabled={deleting || deleteLocked}
                        accessibilityRole="button"
                        accessibilityLabel={c.name}
                      >
                        <PersonAvatar
                          name={c.name}
                          avatarUri={null}
                          size={42}
                          containerStyle={styles.avatar}
                          letterStyle={styles.avatarLetter}
                          letterOverride={initial(c.name)}
                        />

                        <View style={styles.mainCol}>
                          <AutoDirectionText style={styles.name} numberOfLines={1}>
                            {c.name}
                          </AutoDirectionText>
                          {(() => {
                            const s = summaryByFriend.get(c.id);
                            if (!s || s.netMinor === 0) {
                              return (
                                <Text style={styles.email} numberOfLines={1}>
                                  {t("friends.allSettled")}
                                </Text>
                              );
                            }
                            const inGroup = s.topGroupName
                              ? s.netMinor > 0
                                ? t("friends.owesYouInGroup", {
                                    group: s.topGroupName,
                                  })
                                : t("friends.youOweInGroup", {
                                    group: s.topGroupName,
                                  })
                              : s.netMinor > 0
                                ? t("friends.owesYouShort")
                                : t("friends.youOweShort");
                            return (
                              <Text style={styles.email} numberOfLines={1}>
                                {inGroup}
                              </Text>
                            );
                          })()}
                        </View>

                        {(() => {
                          const s = summaryByFriend.get(c.id);
                          if (!s || s.netMinor === 0) {
                            return (
                              <Text style={styles.rowSummaryDash}>—</Text>
                            );
                          }
                          const positive = s.netMinor > 0;
                          return (
                            <View style={styles.rowSummaryCol}>
                              <Text
                                style={[
                                  styles.rowSummaryEyebrow,
                                  {
                                    color: positive
                                      ? colors.owed
                                      : colors.owe,
                                  },
                                ]}
                              >
                                {positive
                                  ? t("friends.owesYouLabel")
                                  : t("friends.youOweLabel")}
                              </Text>
                              <Text
                                style={[
                                  styles.rowSummaryAmount,
                                  {
                                    color: positive
                                      ? colors.owed
                                      : colors.owe,
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {formatMinorWithSymbol(
                                  Math.abs(s.netMinor),
                                  s.currency || defaultCcy,
                                )}
                              </Text>
                            </View>
                          );
                        })()}
                      </Pressable>
                    </View>
                    </SwipeableDeleteRow>
                  </View>
                );
              })
            )}
          </View>

          <Pressable
            style={({ pressed }) => [styles.invitePill, pressed && styles.pressed]}
            onPress={() => void onInvitePress()}
            accessibilityRole="button"
            accessibilityLabel={t("friends.inviteCta")}
          >
            <View style={styles.inviteIcon}>
              <Ionicons name="link-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.inviteCol}>
              <Text style={styles.inviteTitle}>{t("friends.inviteTitle")}</Text>
              <Text style={styles.inviteBody}>{t("friends.inviteBody")}</Text>
            </View>
            <Ionicons
              name={isRTL ? "chevron-back" : "chevron-forward"}
              size={18}
              color={colors.muted}
            />
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={form.open}
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={[styles.formRoot, { paddingTop: Math.max(24, insets.top + 12) }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.formHeader}>
            <Pressable onPress={closeForm} hitSlop={12} style={{ minWidth: 72 }}>
              <Text style={styles.formCancel}>{t("friends.cancel")}</Text>
            </Pressable>
            <Text
              style={[styles.formTitle, { flex: 1, textAlign: "center" }]}
              numberOfLines={1}
            >
              {form.open && form.mode === "add"
                ? t("friends.friendModalAddTitle")
                : t("friends.friendModalEditTitle")}
            </Text>
            <View style={{ minWidth: 72 }} />
          </View>
          <Field label={t("friends.friendName")} topGap={12}>
            <TextInput
              style={styles.fieldInput}
              value={formName}
              onChangeText={setFormName}
              placeholder={t("friends.friendNamePlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              editable={!formBusy}
            />
          </Field>
          <Field
            label={t("friends.friendEmailOptional")}
            error={formEmailInvalid}
            hint={formEmailInvalid ? t("friends.invalidEmail") : undefined}
          >
            <TextInput
              style={[styles.fieldInput, formEmailInvalid && styles.inputInvalid]}
              value={formEmail}
              onChangeText={setFormEmail}
              placeholder={t("account.emailPlaceholder")}
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              importantForAutofill="yes"
              editable={!formBusy}
            />
          </Field>
          <AppButton
            variant="primary"
            fullWidth
            style={styles.formSaveBtn}
            textStyle={styles.formSaveBtnText}
            label={formBusy ? t("friends.saving") : t("friends.saveFriend")}
            onPress={() => void submitForm()}
            disabled={!canSaveForm}
          />
        </KeyboardAvoidingView>
      </Modal>
      {sharing ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            /* Absorb taps that leak past the native share sheet. */
          }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );
}
