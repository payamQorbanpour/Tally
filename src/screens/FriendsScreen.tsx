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
  SectionList,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";
import { TextInput } from "../ui/AppTextInput";
import { KeyboardDismissButton } from "../ui/KeyboardDismissButton";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useDatabase } from "../db/DatabaseContext";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import { isValidOptionalEmail } from "../data/emailValidation";
import {
  createFriendContact,
  deleteFriendContact,
  formatMinor,
  listFriendBalances,
  listFriendContacts,
  getLocalUserId,
  updateFriendContact,
  type FriendBalanceRow,
  type FriendContactRow,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import type { MainTabParamList } from "../navigation/types";

type FriendsRouteProps = BottomTabScreenProps<MainTabParamList, "Friends">;

const EXTRA_TOUCH_SLOP = { top: 16, bottom: 16, left: 16, right: 16 } as const;

type FriendFilterKey = "all" | "withBalance" | "youOwe" | "owesYou" | "settled";

type FriendListRow = {
  friendId: string;
  name: string;
  email: string | null;
  balances: FriendBalanceRow[];
  primaryBalance: FriendBalanceRow | null;
};

type FormState =
  | { open: false }
  | { open: true; mode: "add" }
  | { open: true; mode: "edit"; contact: FriendContactRow };

function buildFriendsStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    kicker: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      paddingHorizontal: 16,
      paddingTop: 12,
      width: "100%",
      ...te,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      paddingHorizontal: 16,
      marginBottom: 4,
      width: "100%",
      ...te,
    },
    sub: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
      paddingHorizontal: 16,
      marginBottom: 12,
      width: "100%",
      ...te,
    },
    listContent: { paddingHorizontal: 16, flexGrow: 1 },
    emptyInline: { color: colors.muted, lineHeight: 22, paddingVertical: 12, ...te },

    searchWrap: {
      paddingHorizontal: 16,
      marginBottom: 10,
      width: "100%",
    },
    searchInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },

    chipsRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 12,
      flexWrap: "wrap",
      width: "100%",
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.owedSoft,
    },
    chipText: { fontSize: 13, fontWeight: "700", color: colors.muted },
    chipTextActive: { color: colors.text },

    friendCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      marginBottom: 10,
      overflow: "hidden",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
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
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarLetter: { fontSize: 18, fontWeight: "800", color: colors.text },
    mainCol: { flex: 1, minWidth: 0 },
    name: { fontSize: 17, fontWeight: "700", color: colors.text },
    meta: { fontSize: 12, color: colors.muted, marginTop: 2 },

    balanceCol: { flexShrink: 0, alignItems: isRTL ? "flex-start" : "flex-end" },
    badge: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      maxWidth: 200,
    },
    badgeText: { fontSize: 13, fontWeight: "700", color: colors.muted },
    balanceLabel: { fontSize: 12, fontWeight: "700", color: colors.muted, marginTop: 2, ...te },
    balanceAmount: { fontSize: 16, fontWeight: "800", color: colors.text, ...te },
    pos: { color: colors.owed },
    neg: { color: colors.owe },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.88 },
    fab: {
      position: "absolute",
      right: 20,
      paddingHorizontal: 16,
      height: 52,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    fabPressed: { opacity: 0.88 },
    fabRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
    },
    fabIcon: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: -1 },
    fabLabel: { color: "#fff", fontSize: 15, fontWeight: "800" },
    formRoot: {
      flex: 1,
      paddingTop: 56,
      paddingHorizontal: 16,
      backgroundColor: colors.bg,
    },
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    formTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
    formDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
    fieldLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    inputInvalid: {
      borderColor: colors.destructive,
      borderWidth: 1,
    },
    fieldError: {
      fontSize: 13,
      color: colors.destructive,
      marginTop: 6,
      lineHeight: 18,
      width: "100%",
      ...te,
    },
    formSaveBtn: { marginTop: 20 },
    formSaveBtnText: { fontWeight: "600" },
  });
}

export function FriendsScreen({ navigation, route }: FriendsRouteProps) {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const { width } = useWindowDimensions();
  const styles = useMemo(
    () => buildFriendsStyles(colors, isRTL),
    [colors, isRTL],
  );
  const [contacts, setContacts] = useState<FriendContactRow[]>([]);
  const [balances, setBalances] = useState<FriendBalanceRow[]>([]);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ open: false });
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filterKey, setFilterKey] = useState<FriendFilterKey>("all");
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

  const load = useCallback(async () => {
    const [c, b] = await Promise.all([
      listFriendContacts(db),
      listFriendBalances(db, getLocalUserId()),
    ]);
    setContacts(c);
    setBalances(b);
  }, [db]);

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

  const rows = useMemo((): FriendListRow[] => {
    const byFriend = new Map<string, FriendListRow>();
    for (const c of contacts) {
      byFriend.set(c.id, {
        friendId: c.id,
        name: c.name,
        email: c.email,
        balances: [],
        primaryBalance: null,
      });
    }
    for (const b of balances) {
      const cur =
        byFriend.get(b.friendId) ??
        ({
          friendId: b.friendId,
          name: b.name,
          email: null,
          balances: [],
          primaryBalance: null,
        } satisfies FriendListRow);
      cur.balances = [...cur.balances, b];
      byFriend.set(cur.friendId, cur);
    }

    const out = Array.from(byFriend.values()).map((r) => {
      const primary =
        r.balances.length === 0
          ? null
          : r.balances.reduce((best, next) =>
              Math.abs(next.netMinor) > Math.abs(best.netMinor) ? next : best,
            );
      return { ...r, primaryBalance: primary };
    });

    const q = query.trim().toLowerCase();
    const filtered = out.filter((r) => {
      if (q.length > 0 && !r.name.toLowerCase().includes(q)) return false;
      const pb = r.primaryBalance;
      if (filterKey === "all") return true;
      if (filterKey === "withBalance") return pb !== null;
      if (filterKey === "settled") return pb === null;
      if (!pb) return false;
      if (filterKey === "youOwe") return pb.netMinor < 0;
      if (filterKey === "owesYou") return pb.netMinor > 0;
      return true;
    });

    filtered.sort((a, b) => {
      const aAmt = Math.abs(a.primaryBalance?.netMinor ?? 0);
      const bAmt = Math.abs(b.primaryBalance?.netMinor ?? 0);
      if (aAmt !== bAmt) return bAmt - aAmt;
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [balances, contacts, filterKey, query]);

  const listRef = useRef<SectionList<FriendListRow> | null>(null);
  const { refreshing, onRefresh, onScrollWhileRefreshing } =
    useRefreshWithBackgroundSync(load, {
      scrollToTop: () => {
        const r = listRef.current?.getScrollResponder?.() as
          | { scrollTo?: (o: { y: number; animated?: boolean }) => void }
          | undefined;
        r?.scrollTo?.({ y: 0, animated: true });
      },
    });

  const canSaveForm =
    formName.trim().length > 0 &&
    isValidOptionalEmail(formEmail.trim()) &&
    !formBusy;
  const formEmailInvalid =
    form.open && !isValidOptionalEmail(formEmail.trim());

  const fabBottom = Math.max(20, 12 + insets.bottom);
  const listBottomPad = fabBottom + 52 + 16;
  const maxContentWidth = width >= 980 ? 820 : undefined;

  const initial = (name: string) =>
    (name.trim().slice(0, 1) || "•").toUpperCase();

  const onLongPressRow = (c: FriendContactRow) => {
    if (deletingContactId !== null) return;
    Alert.alert(c.name, undefined, [
      { text: t("friends.editFriend"), onPress: () => openEdit(c) },
      { text: t("friends.deleteFriend"), style: "destructive", onPress: () => confirmDelete(c) },
      { text: t("friends.cancel"), style: "cancel" },
    ]);
  };

  const filters: { key: FriendFilterKey; label: string }[] = [
    { key: "all", label: t("friends.filterAll") },
    { key: "withBalance", label: t("friends.filterWithBalance") },
    { key: "youOwe", label: t("friends.filterYouOwe") },
    { key: "owesYou", label: t("friends.filterOwesYou") },
    { key: "settled", label: t("friends.filterSettled") },
  ];

  return (
    <View style={styles.wrap}>
      <SectionList<FriendListRow>
        ref={listRef}
        sections={[{ title: "friends", data: rows }]}
        onScroll={onScrollWhileRefreshing}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.friendId}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={maxContentWidth ? { alignSelf: "center", width: "100%", maxWidth: maxContentWidth } : undefined}>
            <Text style={styles.kicker}>{t("friends.kicker")}</Text>
            <Text style={styles.title}>{t("friends.title")}</Text>
            <Text style={styles.sub}>{t("friends.sub")}</Text>

            <View style={styles.searchWrap}>
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

            <View style={styles.chipsRow}>
              {filters.map((f) => {
                const active = f.key === filterKey;
                return (
                  <Pressable
                    key={f.key}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setFilterKey(f.key)}
                    accessibilityRole="button"
                    accessibilityLabel={f.label}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const c = contacts.find((x) => x.id === item.friendId) ?? null;
          const deleting = deletingContactId === item.friendId;
          const deleteLocked = deletingContactId !== null;
          const pb = item.primaryBalance;

          const balanceLine =
            pb && pb.netMinor !== 0
              ? pb.netMinor > 0
                ? t("friends.owesYou", { amount: formatMinor(pb.netMinor, pb.currency) })
                : t("friends.youOwe", { amount: formatMinor(-pb.netMinor, pb.currency) })
              : t("friends.settled");

          const hasMultiCcy = (item.balances?.length ?? 0) > 1;

          return (
            <View style={maxContentWidth ? { alignSelf: "center", width: "100%", maxWidth: maxContentWidth } : undefined}>
              <View style={[styles.friendCard, deleting && styles.friendCardDeleting]}>
                <Pressable
                  style={({ pressed }) => [styles.friendRow, pressed && styles.pressed]}
                  onPress={() => (c ? openEdit(c) : undefined)}
                  onLongPress={() => (c ? onLongPressRow(c) : undefined)}
                  disabled={deleting || deleteLocked || !c}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                >
                  <View style={styles.avatar} accessibilityRole="image">
                    <Text style={styles.avatarLetter}>{initial(item.name)}</Text>
                  </View>

                  <View style={styles.mainCol}>
                    <AutoDirectionText style={styles.name} numberOfLines={1}>
                      {item.name}
                    </AutoDirectionText>
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.email?.trim()
                        ? item.email
                        : pb
                          ? hasMultiCcy
                            ? t("friends.multiCurrencyHint", { n: String(item.balances.length) })
                            : pb.currency
                          : t("friends.settledHint")}
                    </Text>
                  </View>

                  <View style={styles.balanceCol}>
                    {pb ? (
                      <>
                        <Text
                          style={[
                            styles.balanceAmount,
                            pb.netMinor > 0 && styles.pos,
                            pb.netMinor < 0 && styles.neg,
                          ]}
                          numberOfLines={1}
                        >
                          {balanceLine}
                        </Text>
                      </>
                    ) : (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText} numberOfLines={1}>
                          {t("friends.settled")}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              </View>
            </View>
          );
        }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: listBottomPad },
        ]}
        ListEmptyComponent={
          <Text style={styles.emptyInline}>
            {query.trim().length > 0 ? t("friends.noMatchingFriends") : t("friends.contactEmpty")}
          </Text>
        }
      />

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: fabBottom },
          pressed && styles.fabPressed,
        ]}
        onPress={openAdd}
        hitSlop={EXTRA_TOUCH_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t("friends.addFriend")}
      >
        <View style={styles.fabRow}>
          <Text style={styles.fabIcon}>+</Text>
          <Text style={styles.fabLabel}>{t("friends.addFriend")}</Text>
        </View>
      </Pressable>

      <Modal
        visible={form.open}
        animationType="slide"
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={styles.formRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.formHeader}>
            <Pressable onPress={closeForm} hitSlop={12} style={{ minWidth: 72 }}>
              <Text style={styles.formDone}>{t("friends.cancel")}</Text>
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
          <Text style={styles.fieldLabel}>{t("friends.friendName")}</Text>
          <TextInput
            style={styles.input}
            value={formName}
            onChangeText={setFormName}
            placeholder={t("friends.friendNamePlaceholder")}
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            editable={!formBusy}
          />
          <Text style={styles.fieldLabel}>{t("friends.friendEmailOptional")}</Text>
          <TextInput
            style={[styles.input, formEmailInvalid && styles.inputInvalid]}
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
          {formEmailInvalid ? (
            <Text
              style={styles.fieldError}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {t("friends.invalidEmail")}
            </Text>
          ) : null}
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
    </View>
  );
}
