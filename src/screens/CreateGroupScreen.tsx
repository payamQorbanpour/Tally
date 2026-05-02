import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { StackActions, useFocusEffect } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "../ui/AppText";
import { TextInput } from "../ui/AppTextInput";
import { AppButton } from "../ui/AppButton";
import { AppSwitch } from "../ui/AppSwitch";
import { useDatabase } from "../db/DatabaseContext";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type { GroupsStackParamList, MainTabParamList } from "../navigation/types";
import {
  createGroup,
  getSetting,
  searchFriendsByName,
  SETTINGS_KEYS,
  type GroupType,
  type MemberRow,
} from "../data/tallyRepo";
import { CURRENCY_OPTIONS, currencyLabel, isValidCurrencyCode } from "../data/currencies";
import { SimplifyDebtsIllustration } from "../components/SimplifyDebtsIllustration";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { isGroupTypePickerEnabled } from "../core/featureFlags";

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

function buildCreateGroupStyles(colors: ThemeColors) {
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
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
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
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
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
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
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
  /** Layout only — visuals from `AppButton`. */
  primaryBtn: { marginTop: 24, borderRadius: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  primaryBtnText: { fontWeight: "600" },
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
  const { colors } = useTheme();
  const styles = useMemo(() => buildCreateGroupStyles(colors), [colors]);

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
  const [iconDataUri, setIconDataUri] = useState<string | null>(null);
  const [groupType, setGroupType] = useState<GroupType>("other");
  const [simplifyDebts, setSimplifyDebts] = useState(true);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftFocused, setDraftFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<MemberRow[]>([]);
  const [suggestPending, setSuggestPending] = useState(false);
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

  useEffect(() => {
    if (!draftFocused) return;
    const q = draftName.trim();
    setSuggestPending(true);
    const t = setTimeout(() => {
      void (async () => {
        const rows = await searchFriendsByName(db, q, 12);
        setSuggestions(rows);
        setSuggestPending(false);
      })();
    }, 220);
    return () => clearTimeout(t);
  }, [db, draftName, draftFocused]);

  useEffect(() => {
    if (!draftFocused) {
      setSuggestions([]);
      setSuggestPending(false);
    }
  }, [draftFocused]);

  useFocusEffect(
    useCallback(() => {
      const q = draftName.trim();
      if (q.length < 1) return;
      let live = true;
      void (async () => {
        const rows = await searchFriendsByName(db, q, 12);
        if (live) setSuggestions(rows);
      })();
      return () => {
        live = false;
      };
    }, [db, draftName]),
  );

  const goAddFriendFromRow = (name: string) => {
    const q = name.trim();
    if (!q || busy) return;
    Keyboard.dismiss();
    setDraftFocused(false);
    setSuggestions([]);
    const tabNav = navigation.getParent<BottomTabNavigationProp<MainTabParamList>>();
    tabNav?.navigate("Friends", {
      openAddWithName: q,
      returnToCreateGroup: true,
    });
  };

  const pickAvatar = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.45,
      base64: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if (a.base64) {
      const mime =
        a.mimeType?.startsWith("image/") ? a.mimeType : "image/jpeg";
      setIconDataUri(`data:${mime};base64,${a.base64}`);
    } else if (a.uri) {
      setIconDataUri(a.uri);
    }
  }, []);

  const clearAvatar = useCallback(() => {
    setIconDataUri(null);
  }, []);

  const linkSuggestion = (friend: MemberRow) => {
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
    setSuggestions([]);
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
        <Text style={styles.kicker}>{t("createGroup.kicker")}</Text>

        <View style={styles.headerRow}>
          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              !iconDataUri && styles.iconBtnPlaceholder,
              pressed && styles.pressed,
            ]}
            onPress={pickAvatar}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("createGroup.chooseIconA11y")}
          >
            {iconDataUri ? (
              <Image source={{ uri: iconDataUri }} style={styles.iconImg} />
            ) : (
              <Text style={styles.iconPlus}>+</Text>
            )}
          </Pressable>
          <View style={styles.headerNameWrap}>
            <TextInput
              style={styles.headerNameInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder={t("createGroup.placeholderName")}
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              editable={!busy}
              accessibilityLabel={t("createGroup.groupName")}
            />
          </View>
        </View>
        {iconDataUri ? (
          <Pressable onPress={clearAvatar} disabled={busy} style={styles.clearPhoto}>
            <Text style={styles.clearPhotoText}>{t("createGroup.removePhoto")}</Text>
          </Pressable>
        ) : null}

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
            styles.input,
            styles.pickerField,
            pressed && styles.pressed,
          ]}
          onPress={openPicker}
          disabled={busy}
        >
          <Text style={styles.pickerText}>{currencyLabel(currency)}</Text>
          <Text style={styles.pickerChevron}>{t("createGroup.choose")}</Text>
        </Pressable>
        <Text style={styles.hint}>{t("createGroup.irrHint")}</Text>

        <View style={styles.peopleSection}>
        <Text style={styles.sectionTitle}>{t("createGroup.people")}</Text>
        <Text style={styles.sectionSub}>{t("createGroup.peopleHint")}</Text>

        <View style={styles.peopleComposer}>
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
          ) : (
            <View style={styles.peopleEmptyHint}>
              <Ionicons
                name="person-add-outline"
                size={18}
                style={styles.peopleEmptyIcon}
              />
              <Text style={styles.peopleEmptyText}>
                {t("createGroup.peopleEmptyCta")}
              </Text>
            </View>
          )}
          <TextInput
            style={[styles.input, styles.draftInput]}
            value={draftName}
            onChangeText={setDraftName}
            onFocus={() => setDraftFocused(true)}
            onBlur={() => {
              setTimeout(() => setDraftFocused(false), 200);
            }}
            placeholder={t("createGroup.peopleInputPlaceholder")}
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            editable={!busy}
            returnKeyType="done"
            blurOnSubmit={false}
            onSubmitEditing={commitDraft}
          />
          {draftFocused ? (
            <View style={styles.suggestBox}>
              {suggestPending ? (
                <Text style={styles.suggestMuted}>{t("createGroup.searching")}</Text>
              ) : suggestions.length === 0 ? (
                draftName.trim() ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.suggestRow,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => goAddFriendFromRow(draftName)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t("createGroup.addFriendNoMatchCta")}
                  >
                    <Text style={styles.suggestName}>{t("createGroup.addFriendNoMatchCta")}</Text>
                    <Text style={styles.suggestAction}>→</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.suggestMuted}>{t("createGroup.noFriendsYet")}</Text>
                )
              ) : (
                suggestions.map((s) => (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [
                      styles.suggestRow,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => linkSuggestion(s)}
                  >
                    <Text style={styles.suggestName}>{s.name}</Text>
                    <Text style={styles.suggestAction}>{t("createGroup.link")}</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
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
              onValueChange={setSimplifyDebts}
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

        <AppButton
          label={busy ? t("createGroup.saving") : t("createGroup.saveGroup")}
          variant="primary"
          fullWidth
          onPress={save}
          disabled={!canSave || busy}
          style={styles.primaryBtn}
          textStyle={styles.primaryBtnText}
        />
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

