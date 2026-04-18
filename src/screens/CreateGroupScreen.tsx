import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useDatabase } from "../db/DatabaseContext";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type { GroupsStackParamList } from "../navigation/types";
import {
  createGroup,
  getSetting,
  searchFriendsByName,
  SETTINGS_KEYS,
  type GroupType,
  type MemberRow,
} from "../data/tallyRepo";
import { CURRENCY_OPTIONS, currencyLabel, isValidCurrencyCode } from "../data/currencies";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

type Props = NativeStackScreenProps<GroupsStackParamList, "CreateGroup">;

type MemberDraft = {
  key: string;
  name: string;
  email: string;
  linkedUserId: string | null;
};

function emptyMember(): MemberDraft {
  return {
    key: randomUUID(),
    name: "",
    email: "",
    linkedUserId: null,
  };
}

function buildCreateGroupStyles(colors: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40, gap: 0 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  avatarWrap: { alignSelf: "center", marginBottom: 8 },
  avatarImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlus: {
    fontSize: 28,
    fontWeight: "300",
    color: colors.primary,
    marginBottom: 2,
  },
  avatarHint: { fontSize: 12, color: colors.muted },
  clearPhoto: { alignSelf: "center", marginBottom: 16 },
  clearPhotoText: { fontSize: 13, color: colors.owe, fontWeight: "600" },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  labelSmall: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 8,
    marginBottom: 4,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.owedSoft,
  },
  typeChipText: { fontSize: 14, fontWeight: "600", color: colors.text },
  typeChipTextOn: { color: colors.primary },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    paddingVertical: 8,
    gap: 12,
  },
  switchLabelWrap: { flex: 1 },
  switchTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  switchSub: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 16 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginTop: 28,
    marginBottom: 4,
  },
  sectionSub: { fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: 8 },
  memberCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  memberHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  memberIndex: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    fontSize: 22,
    color: colors.owe,
    fontWeight: "400",
    lineHeight: 24,
  },
  linkedHint: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 6,
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
  addPerson: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  addPersonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
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
});
}

export function CreateGroupScreen({ navigation }: Props) {
  const db = useDatabase();
  const bumpGroupsList = useBumpGroupsList();
  const { t } = useLocale();
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

  const [groupName, setGroupName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [iconDataUri, setIconDataUri] = useState<string | null>(null);
  const [groupType, setGroupType] = useState<GroupType>("other");
  const [simplifyDebts, setSimplifyDebts] = useState(true);
  const [members, setMembers] = useState<MemberDraft[]>(() => [emptyMember()]);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestForKey, setSuggestForKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MemberRow[]>([]);
  const [suggestPending, setSuggestPending] = useState(false);

  useEffect(() => {
    void (async () => {
      const c = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
      if (c && isValidCurrencyCode(c)) setCurrency(c);
    })();
  }, [db]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [...CURRENCY_OPTIONS];
    return CURRENCY_OPTIONS.filter(
      (x) =>
        x.code.toLowerCase().includes(q) ||
        x.label.toLowerCase().includes(q),
    );
  }, [search]);

  useEffect(() => {
    if (!suggestForKey) {
      setSuggestions([]);
      return;
    }
    const row = members.find((m) => m.key === suggestForKey);
    const q = row?.name.trim() ?? "";
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    setSuggestPending(true);
    const t = setTimeout(() => {
      void (async () => {
        const rows = await searchFriendsByName(db, q, 12);
        setSuggestions(rows);
        setSuggestPending(false);
      })();
    }, 220);
    return () => clearTimeout(t);
  }, [db, suggestForKey, members]);

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

  const updateMember = useCallback(
    (key: string, patch: Partial<MemberDraft>) => {
      setMembers((prev) =>
        prev.map((m) => (m.key === key ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const onNameChange = (key: string, text: string) => {
    updateMember(key, { name: text, linkedUserId: null });
  };

  const linkSuggestion = (key: string, friend: MemberRow) => {
    updateMember(key, {
      name: friend.name,
      linkedUserId: friend.id,
    });
    setSuggestForKey(null);
    setSuggestions([]);
  };

  const addRow = () => {
    setMembers((prev) => [...prev, emptyMember()]);
  };

  const removeRow = (key: string) => {
    setMembers((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m.key !== key)));
    if (suggestForKey === key) {
      setSuggestForKey(null);
      setSuggestions([]);
    }
  };

  const save = async () => {
    if (!groupName.trim() || busy) return;
    const payloadMembers = members
      .filter((m) => m.name.trim())
      .map((m) => ({
        linkedUserId: m.linkedUserId,
        name: m.name.trim(),
        email: m.email.trim() || null,
      }));
    setBusy(true);
    try {
      const id = await createGroup(db, {
        name: groupName,
        currency,
        icon: iconDataUri,
        groupType,
        simplifyDebts,
        members: payloadMembers,
      });
      bumpGroupsList();
      navigation.replace("GroupDetail", { groupId: id });
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
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.kicker}>{t("createGroup.kicker")}</Text>

        <Pressable
          style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
          onPress={pickAvatar}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t("createGroup.chooseIconA11y")}
        >
          {iconDataUri ? (
            <Image source={{ uri: iconDataUri }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlus}>+</Text>
              <Text style={styles.avatarHint}>{t("createGroup.icon")}</Text>
            </View>
          )}
        </Pressable>
        {iconDataUri ? (
          <Pressable onPress={clearAvatar} disabled={busy} style={styles.clearPhoto}>
            <Text style={styles.clearPhotoText}>{t("createGroup.removePhoto")}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.label}>{t("createGroup.groupName")}</Text>
        <TextInput
          style={styles.input}
          value={groupName}
          onChangeText={setGroupName}
          placeholder={t("createGroup.placeholderName")}
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          editable={!busy}
        />

        <Text style={styles.label}>{t("createGroup.groupType")}</Text>
        <View style={styles.typeRow}>
          {groupTypes.map(({ value, label }) => (
            <Pressable
              key={value}
              style={[
                styles.typeChip,
                groupType === value && styles.typeChipOn,
              ]}
              onPress={() => setGroupType(value)}
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

        <View style={styles.switchRow}>
          <View style={styles.switchLabelWrap}>
            <Text style={styles.switchTitle}>{t("createGroup.simplifyDebts")}</Text>
            <Text style={styles.switchSub}>{t("createGroup.simplifyHint")}</Text>
          </View>
          <Switch
            value={simplifyDebts}
            onValueChange={setSimplifyDebts}
            disabled={busy}
            trackColor={{ false: colors.border, true: colors.owedSoft }}
            thumbColor={simplifyDebts ? colors.primary : "#f4f4f5"}
          />
        </View>

        <Text style={styles.sectionTitle}>{t("createGroup.people")}</Text>
        <Text style={styles.sectionSub}>{t("createGroup.peopleHint")}</Text>

        {members.map((m, index) => (
          <View key={m.key} style={styles.memberCard}>
            <View style={styles.memberHead}>
              <Text style={styles.memberIndex}>{index + 1}</Text>
              <Pressable
                style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                onPress={() => removeRow(m.key)}
                disabled={busy || members.length <= 1}
                accessibilityRole="button"
                accessibilityLabel={t("friends.deleteFriend")}
              >
                <Text style={styles.removeBtnText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.labelSmall}>{t("createGroup.name")}</Text>
            <TextInput
              style={styles.input}
              value={m.name}
              onChangeText={(t) => onNameChange(m.key, t)}
              onFocus={() => setSuggestForKey(m.key)}
              onBlur={() => {
                setTimeout(() => setSuggestForKey(null), 200);
              }}
              placeholder={t("createGroup.name")}
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              editable={!busy}
            />
            {m.linkedUserId ? (
              <Text style={styles.linkedHint}>{t("createGroup.linkedHint")}</Text>
            ) : null}
            {suggestForKey === m.key && m.name.trim() ? (
              <View style={styles.suggestBox}>
                {suggestPending ? (
                  <Text style={styles.suggestMuted}>{t("createGroup.searching")}</Text>
                ) : suggestions.length === 0 ? (
                  <Text style={styles.suggestMuted}>{t("createGroup.noNameMatch")}</Text>
                ) : (
                  suggestions.map((s) => (
                    <Pressable
                      key={s.id}
                      style={({ pressed }) => [
                        styles.suggestRow,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => linkSuggestion(m.key, s)}
                    >
                      <Text style={styles.suggestName}>{s.name}</Text>
                      <Text style={styles.suggestAction}>{t("createGroup.link")}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
            <Text style={styles.labelSmall}>{t("createGroup.emailOptional")}</Text>
            <TextInput
              style={styles.input}
              value={m.email}
              onChangeText={(t) => updateMember(m.key, { email: t })}
              placeholder="email@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [styles.addPerson, pressed && styles.pressed]}
          onPress={addRow}
          disabled={busy}
        >
          <Text style={styles.addPersonText}>{t("createGroup.addPerson")}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            !canSave && styles.disabled,
            pressed && canSave && styles.pressed,
          ]}
          onPress={save}
          disabled={!canSave || busy}
        >
          <Text style={styles.primaryBtnText}>
            {busy ? t("createGroup.saving") : t("createGroup.saveGroup")}
          </Text>
        </Pressable>
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
            <Text style={styles.modalTitle}>{t("createGroup.modalCurrency")}</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
              <Text style={styles.modalClose}>{t("createGroup.done")}</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
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
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  item.code === currency && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => pickCode(item.code)}
              >
                <Text style={styles.rowCode}>{item.code}</Text>
                <Text style={styles.rowLabel}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>{t("createGroup.emptySearch")}</Text>
            }
          />
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

