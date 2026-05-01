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
import { TextInput } from "../ui/AppTextInput";
import { SwipeableDeleteRow } from "../ui/SwipeableDeleteRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { PersonAvatar } from "../components/PersonAvatar";
import { useDatabase } from "../db/DatabaseContext";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import { isValidOptionalEmail } from "../data/emailValidation";
import {
  createFriendContact,
  deleteFriendContact,
  listFriendContacts,
  updateFriendContact,
  type FriendContactRow,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import type { MainTabParamList } from "../navigation/types";

type FriendsRouteProps = BottomTabScreenProps<MainTabParamList, "Friends">;

type FormState =
  | { open: false }
  | { open: true; mode: "add" }
  | { open: true; mode: "edit"; contact: FriendContactRow };

function buildFriendsStyles(
  colors: ThemeColors,
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const cardBorder =
    resolvedScheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
  const rowDividerColor =
    resolvedScheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
  const searchSurface =
    resolvedScheme === "dark" ? "rgba(255,255,255,0.06)" : "#EDEFF2";
  const avatarTint =
    resolvedScheme === "dark" ? "rgba(52,211,153,0.18)" : "#D7F1E6";
  const inviteIllustrationBg =
    resolvedScheme === "dark" ? "rgba(52,211,153,0.14)" : "#E7F6EE";

  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    listContent: {
      paddingHorizontal: 16,
      flexGrow: 1,
    },
    column: { width: "100%", maxWidth: 640, alignSelf: "center" },

    titleRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 14,
      width: "100%",
      backgroundColor: colors.bg,
    },
    /** Wrapper for the fixed top header — sits above the scroll view and
        masks content that scrolls beneath it. Holds the safe-area inset
        plus the title row. */
    headerAnchor: {
      backgroundColor: colors.bg,
      zIndex: 2,
    },
    titleSpacer: { width: 36 },
    title: {
      flex: 1,
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    titlePlusBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    searchWrap: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: searchSurface,
      marginBottom: 18,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      padding: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
    },

    sectionHeader: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 10,
      ...te,
    },

    listSection: {
      marginBottom: 24,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    /** Per-row clip: keeps the swipe strip + animated content from leaking past the row bounds. */
    rowClip: {
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    friendRowWrap: {
      backgroundColor: colors.surface,
    },
    friendRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
    },
    friendRowDeleting: { opacity: 0.55 },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: rowDividerColor,
      marginLeft: isRTL ? 0 : 70,
      marginRight: isRTL ? 70 : 0,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: avatarTint,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarLetter: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.primary,
    },

    mainCol: { flex: 1, minWidth: 0 },
    name: { fontSize: 16, fontWeight: "600", color: colors.text },
    email: { fontSize: 13, color: colors.muted, marginTop: 2 },

    rowMenuBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },

    emptyInline: {
      color: colors.muted,
      lineHeight: 22,
      paddingVertical: 24,
      textAlign: "center",
    },

    inviteCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: cardBorder,
      padding: 18,
      marginBottom: 24,
    },
    inviteTopRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 16,
    },
    inviteTextCol: { flex: 1, minWidth: 0 },
    inviteTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
      ...te,
    },
    inviteBody: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
      ...te,
    },
    inviteIllustration: {
      width: 80,
      height: 80,
      borderRadius: 16,
      backgroundColor: inviteIllustrationBg,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },

    pressed: { opacity: 0.85 },

    formRoot: {
      flex: 1,
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
  const { colors, resolvedScheme } = useTheme();
  const { t, isRTL } = useLocale();
  const { width } = useWindowDimensions();
  const styles = useMemo(
    () => buildFriendsStyles(colors, isRTL, resolvedScheme),
    [colors, isRTL, resolvedScheme],
  );
  const [contacts, setContacts] = useState<FriendContactRow[]>([]);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ open: false });
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [query, setQuery] = useState("");
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

  const load = useCallback(async () => {
    const c = await listFriendContacts(db);
    setContacts(c);
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
            <View style={styles.titleSpacer} />
            <Text style={styles.title}>{t("friends.title")}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.titlePlusBtn,
                pressed && styles.pressed,
              ]}
              onPress={openAdd}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("friends.addFriend")}
            >
              <Ionicons name="add" size={26} color={colors.text} />
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
            <Ionicons name="search" size={18} color={colors.muted} />
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

          <Text style={styles.sectionHeader}>{t("friends.myFriends")}</Text>

          <View style={styles.listSection}>
            {filteredContacts.length === 0 ? (
              <Text style={styles.emptyInline}>
                {query.trim().length > 0
                  ? t("friends.noMatchingFriends")
                  : t("friends.contactEmpty")}
              </Text>
            ) : (
              filteredContacts.map((c, idx) => {
                const deleting = deletingContactId === c.id;
                const deleteLocked = deletingContactId !== null;
                const isLast = idx === filteredContacts.length - 1;
                return (
                  <View key={c.id}>
                    <SwipeableDeleteRow
                      isRTL={isRTL}
                      cardEdgeRadius={0}
                      disabled={deleting || deleteLocked}
                      onRequestDelete={() => confirmDelete(c)}
                      accessibilityLabel={t("friends.deleteFriendA11y", { name: c.name })}
                    >
                      <View
                        style={[
                          styles.friendRowWrap,
                          deleting && styles.friendRowDeleting,
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
                            size={44}
                            containerStyle={styles.avatar}
                            letterStyle={styles.avatarLetter}
                            letterOverride={initial(c.name)}
                          />

                          <View style={styles.mainCol}>
                            <AutoDirectionText style={styles.name} numberOfLines={1}>
                              {c.name}
                            </AutoDirectionText>
                            {c.email?.trim() ? (
                              <Text style={styles.email} numberOfLines={1}>
                                {c.email}
                              </Text>
                            ) : null}
                          </View>

                          <Pressable
                            style={({ pressed }) => [
                              styles.rowMenuBtn,
                              pressed && styles.pressed,
                            ]}
                            onPress={() => onRowMenuPress(c)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={t("friends.rowMenuA11y", { name: c.name })}
                          >
                            <Ionicons
                              name="ellipsis-horizontal"
                              size={20}
                              color={colors.muted}
                            />
                          </Pressable>
                        </Pressable>
                      </View>
                    </SwipeableDeleteRow>
                    {isLast ? null : <View style={styles.rowDivider} />}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.inviteCard}>
            <View style={styles.inviteTopRow}>
              <View style={styles.inviteTextCol}>
                <Text style={styles.inviteTitle}>{t("friends.inviteTitle")}</Text>
                <Text style={styles.inviteBody}>{t("friends.inviteBody")}</Text>
              </View>
              <View style={styles.inviteIllustration}>
                <Ionicons name="people" size={42} color={colors.primary} />
              </View>
            </View>
            <AppButton
              variant="primary"
              fullWidth
              label={t("friends.inviteCta")}
              onPress={() => void onInvitePress()}
              left={
                <Ionicons name="paper-plane-outline" size={18} color="#fff" />
              }
              accessibilityLabel={t("friends.inviteCta")}
            />
          </View>
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
