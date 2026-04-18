import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useDatabase } from "../db/DatabaseContext";
import {
  createFriendContact,
  deleteFriendContact,
  formatMinor,
  listFriendBalances,
  listFriendContacts,
  LOCAL_USER_ID,
  updateFriendContact,
  type FriendBalanceRow,
  type FriendContactRow,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

const EXTRA_TOUCH_SLOP = { top: 16, bottom: 16, left: 16, right: 16 } as const;

/** Single union for SectionList rows (contacts + balances sections). */
type FriendsListItem =
  | { kind: "contact"; contact: FriendContactRow }
  | { kind: "contactEmpty" }
  | { kind: "balance"; balance: FriendBalanceRow }
  | { kind: "balanceEmpty" };

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
    sectionHeader: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.muted,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      backgroundColor: colors.bg,
      width: "100%",
      ...te,
    },
    listContent: { paddingHorizontal: 16, flexGrow: 1 },
    emptyInline: {
      color: colors.muted,
      lineHeight: 22,
      paddingVertical: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 12,
    },
    rowLeft: { flex: 1, minWidth: 0 },
    name: { fontSize: 16, fontWeight: "600", color: colors.text },
    email: { fontSize: 12, color: colors.muted, marginTop: 2 },
    ccy: { fontSize: 12, color: colors.muted, marginTop: 2 },
    amt: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      maxWidth: "52%",
    },
    pos: { color: colors.owed },
    neg: { color: colors.owe },
    cardMenuBtn: {
      paddingHorizontal: 4,
      paddingVertical: 4,
      marginRight: -4,
      borderRadius: 8,
      minWidth: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.88 },
    fab: {
      position: "absolute",
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    fabPressed: { opacity: 0.88 },
    fabText: { color: "#fff", fontSize: 32, fontWeight: "300", marginTop: -2 },
    menuBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    menuBackdropWeb: {
      justifyContent: "center",
      padding: 24,
    },
    menuBackdropMobile: {
      justifyContent: "flex-end",
    },
    menuSheet: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      zIndex: 2,
    },
    menuSheetWeb: {
      borderRadius: 14,
      maxWidth: 400,
      alignSelf: "center",
      width: "100%",
    },
    menuSheetMobile: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      width: "100%",
      alignSelf: "stretch",
    },
    menuTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuRowDanger: { borderBottomWidth: 0 },
    menuRowCancel: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      borderBottomWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
    },
    menuRowTextEdit: { fontSize: 16, fontWeight: "600", color: colors.primary },
    menuRowTextDanger: { fontSize: 16, fontWeight: "600", color: colors.destructive },
    menuRowTextMuted: { fontSize: 16, fontWeight: "600", color: colors.muted },
    menuBackdropHit: { zIndex: 0 },
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
    primaryBtn: {
      marginTop: 20,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  });
}

export function FriendsScreen() {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(
    () => buildFriendsStyles(colors, isRTL),
    [colors, isRTL],
  );
  const [contacts, setContacts] = useState<FriendContactRow[]>([]);
  const [balances, setBalances] = useState<FriendBalanceRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [menuContactId, setMenuContactId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ open: false });
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, b] = await Promise.all([
      listFriendContacts(db),
      listFriendBalances(db, LOCAL_USER_ID),
    ]);
    setContacts(c);
    setBalances(b);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const openAdd = () => {
    setFormName("");
    setFormEmail("");
    setForm({ open: true, mode: "add" });
  };

  const openEdit = (c: FriendContactRow) => {
    setMenuContactId(null);
    setFormName(c.name);
    setFormEmail(c.email ?? "");
    setForm({ open: true, mode: "edit", contact: c });
  };

  const closeForm = () => {
    setForm({ open: false });
    setFormBusy(false);
  };

  const submitForm = async () => {
    const name = formName.trim();
    if (!name || formBusy) return;
    setFormBusy(true);
    try {
      const emailTrim = formEmail.trim();
      const email = emailTrim ? emailTrim : null;
      if (form.open && form.mode === "add") {
        await createFriendContact(db, { name, email });
      } else if (form.open && form.mode === "edit") {
        await updateFriendContact(db, form.contact.id, { name, email });
      }
      await load();
      closeForm();
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

  const menuContact = menuContactId
    ? contacts.find((c) => c.id === menuContactId)
    : undefined;

  const performDelete = async (c: FriendContactRow) => {
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
    }
  };

  const confirmDelete = (c: FriendContactRow) => {
    setMenuContactId(null);
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

  const sections = useMemo(
    () => [
      {
        key: "contacts" as const,
        title: t("friends.contactsSection"),
        data: (
          contacts.length === 0
            ? [{ kind: "contactEmpty" as const }]
            : contacts.map((c) => ({ kind: "contact" as const, contact: c }))
        ) as FriendsListItem[],
      },
      {
        key: "balances" as const,
        title: t("friends.balancesSection"),
        data: (
          balances.length === 0
            ? [{ kind: "balanceEmpty" as const }]
            : balances.map((b) => ({ kind: "balance" as const, balance: b }))
        ) as FriendsListItem[],
      },
    ],
    [contacts, balances, t],
  );

  const canSaveForm = formName.trim().length > 0 && !formBusy;

  const fabBottom = Math.max(20, 12 + insets.bottom);
  const listBottomPad = fabBottom + 56 + 16;

  return (
    <View style={styles.wrap}>
      <SectionList<FriendsListItem, (typeof sections)[number]>
        sections={sections}
        keyExtractor={(item) => {
          if (item.kind === "contact") return item.contact.id;
          if (item.kind === "balance") {
            return `${item.balance.friendId}-${item.balance.currency}`;
          }
          if (item.kind === "contactEmpty") return "contact-empty";
          return "balance-empty";
        }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <>
            <Text style={styles.kicker}>{t("friends.kicker")}</Text>
            <Text style={styles.title}>{t("friends.title")}</Text>
            <Text style={styles.sub}>{t("friends.sub")}</Text>
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          if (item.kind === "contactEmpty") {
            return (
              <Text style={styles.emptyInline}>{t("friends.contactEmpty")}</Text>
            );
          }
          if (item.kind === "contact") {
            const c = item.contact;
            return (
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <AutoDirectionText style={styles.name} numberOfLines={1}>
                    {c.name}
                  </AutoDirectionText>
                  {c.email ? (
                    <Text style={styles.email} numberOfLines={1}>
                      {c.email}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.cardMenuBtn,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setMenuContactId(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`More actions for ${c.name}`}
                  hitSlop={EXTRA_TOUCH_SLOP}
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={20}
                    color={colors.currencyMeta}
                  />
                </Pressable>
              </View>
            );
          }
          if (item.kind === "balanceEmpty") {
            return (
              <Text style={styles.emptyInline}>{t("friends.empty")}</Text>
            );
          }
          const b = item.balance;
          return (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.name} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.ccy}>{b.currency}</Text>
              </View>
              <Text
                style={[
                  styles.amt,
                  b.netMinor > 0 && styles.pos,
                  b.netMinor < 0 && styles.neg,
                ]}
              >
                {b.netMinor > 0
                  ? t("friends.owesYou", {
                      amount: formatMinor(b.netMinor, b.currency),
                    })
                  : b.netMinor < 0
                    ? t("friends.youOwe", {
                        amount: formatMinor(-b.netMinor, b.currency),
                      })
                    : t("friends.settled")}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: listBottomPad },
        ]}
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
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <Modal
        transparent
        visible={menuContactId !== null}
        animationType={Platform.OS === "web" ? "fade" : "slide"}
        onRequestClose={() => setMenuContactId(null)}
      >
        <View
          style={[
            styles.menuBackdrop,
            Platform.OS === "web" ? styles.menuBackdropWeb : styles.menuBackdropMobile,
          ]}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, styles.menuBackdropHit]}
            onPress={() => setMenuContactId(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss menu"
          />
          <View
            style={[
              styles.menuSheet,
              Platform.OS === "web" ? styles.menuSheetWeb : styles.menuSheetMobile,
              Platform.OS !== "web" && {
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <AutoDirectionText style={styles.menuTitle} numberOfLines={1}>
              {menuContact?.name ?? ""}
            </AutoDirectionText>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              onPress={() => menuContact && openEdit(menuContact)}
              hitSlop={EXTRA_TOUCH_SLOP}
              accessibilityRole="button"
            >
              <Ionicons name="pencil" size={20} color={colors.primary} />
              <Text style={styles.menuRowTextEdit}>{t("friends.editFriend")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowDanger,
                pressed && styles.pressed,
              ]}
              onPress={() => menuContact && confirmDelete(menuContact)}
              hitSlop={EXTRA_TOUCH_SLOP}
              accessibilityRole="button"
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={colors.destructive}
              />
              <Text style={styles.menuRowTextDanger}>{t("friends.deleteFriend")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowCancel,
                pressed && styles.pressed,
              ]}
              onPress={() => setMenuContactId(null)}
              hitSlop={EXTRA_TOUCH_SLOP}
            >
              <Text style={styles.menuRowTextMuted}>{t("friends.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
            style={styles.input}
            value={formEmail}
            onChangeText={setFormEmail}
            placeholder={t("account.emailPlaceholder")}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!formBusy}
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canSaveForm || formBusy) && styles.disabled,
              pressed && canSaveForm && !formBusy && styles.pressed,
            ]}
            onPress={() => void submitForm()}
            disabled={!canSaveForm}
          >
            <Text style={styles.primaryBtnText}>
              {formBusy ? t("friends.saving") : t("friends.saveFriend")}
            </Text>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
