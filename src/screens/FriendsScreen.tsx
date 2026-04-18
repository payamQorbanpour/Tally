import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useDatabase } from "../db/DatabaseContext";
import { isValidOptionalEmail } from "../data/emailValidation";
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
import type { MainTabParamList } from "../navigation/types";

type FriendsRouteProps = BottomTabScreenProps<MainTabParamList, "Friends">;

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
    contactCard: {
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
    contactCardDeleting: { opacity: 0.55 },
    contactRowOuter: {
      flexDirection: "row",
      alignItems: "center",
      paddingRight: 8,
    },
    contactRowMain: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 12,
      paddingLeft: 14,
      paddingRight: 8,
    },
    contactDeleteBtn: {
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      width: 40,
      height: 40,
      borderRadius: 12,
      marginLeft: 4,
      flexShrink: 0,
      backgroundColor: colors.oweSoft,
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
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.88 },
    fab: {
      position: "absolute",
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
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
    fabText: { color: "#fff", fontSize: 32, fontWeight: "300", marginTop: -2 },
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

export function FriendsScreen({ navigation, route }: FriendsRouteProps) {
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
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ open: false });
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBusy, setFormBusy] = useState(false);
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
  }, [navigation, route.params?.openAddWithName]);

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

  const canSaveForm =
    formName.trim().length > 0 &&
    isValidOptionalEmail(formEmail.trim()) &&
    !formBusy;
  const formEmailInvalid =
    form.open && !isValidOptionalEmail(formEmail.trim());

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
            const deleting = deletingContactId === c.id;
            const deleteLocked = deletingContactId !== null;
            return (
              <View
                style={[
                  styles.contactCard,
                  deleting && styles.contactCardDeleting,
                ]}
              >
                <View style={styles.contactRowOuter}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.contactRowMain,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => openEdit(c)}
                    disabled={deleting || deleteLocked}
                    accessibilityRole="button"
                    accessibilityLabel={t("friends.editFriend")}
                  >
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
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.contactDeleteBtn,
                      Platform.OS === "web" &&
                        ({
                          cursor: "pointer",
                          outlineWidth: 0,
                        } as ViewStyle),
                      pressed && styles.pressed,
                      (deleting || deleteLocked) && styles.disabled,
                    ]}
                    onPress={() => {
                      if (deleteLocked) return;
                      confirmDelete(c);
                    }}
                    hitSlop={6}
                    disabled={deleting || deleteLocked}
                    accessibilityRole="button"
                    accessibilityLabel={t("friends.deleteFriend")}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.destructive}
                    />
                  </Pressable>
                </View>
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
