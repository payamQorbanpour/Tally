import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { classifyExpenseCategory } from "../core/classifyExpenseCategory";
import { parseReceiptImageBase64 } from "../core/parseReceiptImage";
import { parseExpenseDescription } from "../core/parseExpenseDescription";
import { transcribeAudioFile } from "../core/transcribeAudio";
import type { ParsedExpenseItem } from "../core/expenseDescriptionTypes";
import type { ParsedReceiptPayload } from "../core/receiptParseTypes";
import { hasAnyAiBackend } from "../core/receiptAiEnv";
import {
  addExpenseWithSplits,
  addPersonToGroup,
  formatMinor,
  getGroup,
  listGroups,
  listMembers,
  updateExpenseCategory,
  type GroupRow,
  type MemberRow,
} from "../data/tallyRepo";
import { majorFloatToMinor } from "../data/currencies";
import { useDatabase } from "../db/DatabaseContext";
import { usePremium } from "../premium/PremiumContext";
import { getLocalUserId, newId } from "../db/ids";
import { useLocale } from "../i18n/LocaleContext";
import type { MainTabParamList, ReceiptPrefillV1, RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";
import { TextInput } from "../ui/AppTextInput";
import {
  ReceiptAssignDnDModal,
  type AssignableLine,
} from "./ReceiptAssignDnDModal";

type AiNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "AiReceipt">,
  NativeStackNavigationProp<RootStackParamList>
>;

type EditableLine = {
  id: string;
  label: string;
  amountMajor: number;
  assigneeId: string;
};

function mediaLibraryAllowed(
  p: Awaited<ReturnType<typeof ImagePicker.getMediaLibraryPermissionsAsync>>,
) {
  if (p.status === "granted") return true;
  if (p.accessPrivileges === "limited" || p.accessPrivileges === "all") return true;
  return false;
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    pad: { paddingHorizontal: 20 },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      marginTop: 4,
      marginBottom: 6,
      ...te,
    },
    muted: { fontSize: 15, color: colors.muted, lineHeight: 22, ...te },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.muted,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      ...te,
    },
    groupRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 8,
    },
    groupName: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text, minWidth: 0 },
    groupPick: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    groupPickLast: { borderBottomWidth: 0 },
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    lineLabel: { flex: 1, fontSize: 15, color: colors.text, minWidth: 0, ...te },
    lineAmt: { fontSize: 15, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
    assigneeBtn: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      maxWidth: 140,
    },
    assigneeBtnText: { fontSize: 13, fontWeight: "600", color: colors.primary },
    warn: {
      fontSize: 14,
      color: colors.owe,
      marginTop: 8,
      ...te,
    },
    previewWrap: {
      position: "relative" as const,
      marginTop: 12,
      width: "100%",
    },
    preview: {
      width: "100%",
      height: 200,
      borderRadius: 12,
      backgroundColor: colors.inputSurface,
    },
    previewDelete: {
      position: "absolute",
      top: 8,
      right: 8,
      zIndex: 1,
    },
    btnRow: { flexDirection: isRTL ? "row-reverse" : "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 16,
      maxHeight: "55%",
    },
    modalTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 12, ...te },
    modalRow: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    premiumPill: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.owedSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primary,
      marginBottom: 8,
    },
    premiumPillText: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
    delBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
    modeToggle: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignSelf: "stretch",
      gap: 8,
      padding: 4,
      borderRadius: 999,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginTop: 10,
      marginBottom: 4,
    },
    modeTab: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    modeTabOn: { backgroundColor: colors.primary },
    modeTabLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.muted,
      textAlign: "center",
    },
    modeTabLabelOn: { color: "#fff" },
    describeInput: {
      minHeight: 120,
      maxHeight: 240,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      backgroundColor: colors.inputSurface,
      color: colors.text,
      textAlignVertical: "top" as const,
      ...te,
    },
    proposedItem: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    proposedItemLast: { borderBottomWidth: 0 },
    proposedTopRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      justifyContent: "space-between",
    },
    proposedDesc: {
      flex: 1,
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      minWidth: 0,
      ...te,
    },
    proposedAmt: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    proposedMeta: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 4,
      ...te,
    },
    voiceCenter: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 24,
      gap: 16,
    },
    voiceHeading: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
    },
    voiceLead: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 8,
    },
    voiceTimer: {
      fontSize: 40,
      fontWeight: "700",
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    voiceMicBtn: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    voiceMicBtnRecording: { backgroundColor: colors.owe },
    voiceProcessingBody: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
    },
    voiceTranscript: {
      marginTop: 8,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
  });
}

function payloadToEditableLines(
  parsed: ParsedReceiptPayload,
  defaultAssignee: string,
  fallbackTotalLabel: string,
): EditableLine[] {
  const out: EditableLine[] = [];
  if (parsed.lines.length > 0) {
    for (const l of parsed.lines) {
      out.push({
        id: newId(),
        label: l.label,
        amountMajor: l.amount,
        assigneeId: defaultAssignee,
      });
    }
    return out;
  }
  if (parsed.total != null && Number.isFinite(parsed.total)) {
    out.push({
      id: newId(),
      label: fallbackTotalLabel,
      amountMajor: parsed.total,
      assigneeId: defaultAssignee,
    });
  }
  return out;
}

export function AiReceiptScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const db = useDatabase();
  const navigation = useNavigation<AiNav>();
  const premium = usePremium();
  const myId = getLocalUserId();

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupCurrency, setGroupCurrency] = useState("USD");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [parsed, setParsed] = useState<ParsedReceiptPayload | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [payerId, setPayerId] = useState(myId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [libDenied, setLibDenied] = useState(false);
  const [camDenied, setCamDenied] = useState(false);
  const [pickerLineId, setPickerLineId] = useState<string | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const autoOpenDone = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const [mode, setMode] = useState<"scan" | "describe" | "voice">("scan");
  const [describeText, setDescribeText] = useState("");
  const [describeBusy, setDescribeBusy] = useState(false);
  const [describeErr, setDescribeErr] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ParsedExpenseItem[]>([]);
  const [addingAll, setAddingAll] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [voicePhase, setVoicePhase] = useState<"idle" | "recording" | "processing">(
    "idle",
  );
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [voiceMicDenied, setVoiceMicDenied] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [dndOpen, setDndOpen] = useState(false);

  const hasKey = hasAnyAiBackend();

  const reloadGroups = useCallback(async () => {
    const g = await listGroups(db);
    setGroups(g);
    if (g.length === 0) {
      setGroupId(null);
      return;
    }
    setGroupId((prev) => (prev && g.some((x) => x.id === prev) ? prev : g[0]!.id));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void reloadGroups();
    }, [reloadGroups]),
  );

  useEffect(() => {
    if (!groupId) {
      setMembers([]);
      return;
    }
    let live = true;
    void (async () => {
      const [g, m] = await Promise.all([getGroup(db, groupId), listMembers(db, groupId)]);
      if (!live) return;
      setGroupCurrency(g?.currency ?? "USD");
      setMembers(m);
      setPayerId((p) => (m.some((x) => x.id === p) ? p : (m[0]?.id ?? myId)));
    })();
    return () => {
      live = false;
    };
  }, [db, groupId, myId]);

  const selected = groups.find((g) => g.id === groupId);

  const runParse = useCallback(
    async (b64: string, mime: string) => {
      if (!groupId) return;
      if (premium.iapGatingEnabled && !premium.isPremium) {
        setErr(t("aiReceipt.premiumRequiredBody"));
        return;
      }
      if (!hasKey) {
        setErr(t("aiReceipt.unavailableBuild"));
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const out = await parseReceiptImageBase64({
          base64: b64,
          mimeType: mime,
          currencyHint: groupCurrency,
        });
        setParsed(out);
        const def = members[0]?.id ?? myId;
        setLines(payloadToEditableLines(out, def, t("aiReceipt.fallbackTotalLabel")));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "MISSING_OPENAI_KEY") {
          setErr(t("aiReceipt.unavailableBuild"));
        } else {
          setErr(msg || t("aiReceipt.parseFailed"));
        }
      } finally {
        setBusy(false);
      }
    },
    [groupCurrency, groupId, hasKey, members, myId, t, premium.iapGatingEnabled, premium.isPremium],
  );

  const clearPhoto = useCallback(() => {
    setImageUri(null);
    setImageBase64(null);
    setImageMime("image/jpeg");
    setParsed(null);
    setLines([]);
    setErr(null);
    setLibDenied(false);
    setCamDenied(false);
  }, []);

  const pickFromLibrary = useCallback(async () => {
    if (premium.iapGatingEnabled && !premium.isPremium) {
      setErr(t("aiReceipt.premiumRequiredBody"));
      return;
    }
    if (!hasKey) {
      setErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    setErr(null);
    setLibDenied(false);
    setCamDenied(false);
    try {
      let cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!mediaLibraryAllowed(cur)) {
        cur = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (!mediaLibraryAllowed(cur)) {
        setErr(t("aiReceipt.libraryDenied"));
        setLibDenied(true);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
        base64: true,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (!a.base64) {
        setErr(t("aiReceipt.noBase64"));
        return;
      }
      setImageUri(a.uri);
      setImageBase64(a.base64);
      setImageMime(a.mimeType ?? "image/jpeg");
      setParsed(null);
      setLines([]);
      await runParse(a.base64, a.mimeType ?? "image/jpeg");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("aiReceipt.parseFailed"));
    }
  }, [hasKey, runParse, t, premium.iapGatingEnabled, premium.isPremium]);

  const pickFromCamera = useCallback(async () => {
    if (premium.iapGatingEnabled && !premium.isPremium) {
      setErr(t("aiReceipt.premiumRequiredBody"));
      return;
    }
    if (!hasKey) {
      setErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    setErr(null);
    setLibDenied(false);
    setCamDenied(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        setErr(t("aiReceipt.cameraDenied"));
        setCamDenied(true);
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.75,
        base64: true,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (!a.base64) {
        setErr(t("aiReceipt.noBase64"));
        return;
      }
      setImageUri(a.uri);
      setImageBase64(a.base64);
      setImageMime(a.mimeType ?? "image/jpeg");
      setParsed(null);
      setLines([]);
      await runParse(a.base64, a.mimeType ?? "image/jpeg");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("aiReceipt.parseFailed"));
    }
  }, [hasKey, runParse, t, premium.iapGatingEnabled, premium.isPremium]);

  /** One-time: open photo library when AI tab is ready (minimal taps). */
  useEffect(() => {
    if (autoOpenDone.current) return;
    if (mode !== "scan") return;
    if (premium.iapGatingEnabled && !premium.isPremium) return;
    if (!hasKey || groups.length === 0) return;
    if (imageBase64) return;
    if (Platform.OS === "web") return;
    autoOpenDone.current = true;
    const tmr = setTimeout(() => {
      void pickFromLibrary();
    }, 500);
    return () => clearTimeout(tmr);
  }, [hasKey, groups.length, imageBase64, mode, pickFromLibrary, premium.iapGatingEnabled, premium.isPremium]);

  const reanalyze = useCallback(() => {
    if (imageBase64) void runParse(imageBase64, imageMime);
  }, [imageBase64, imageMime, runParse]);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const setAssignee = useCallback((lineId: string, userId: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, assigneeId: userId } : l)),
    );
    setPickerLineId(null);
  }, []);

  const startVoiceRecord = useCallback(async () => {
    if (premium.iapGatingEnabled && !premium.isPremium) {
      setVoiceErr(t("aiReceipt.premiumRequiredBody"));
      return;
    }
    if (!hasKey) {
      setVoiceErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    if (!groupId || members.length === 0) return;
    setVoiceErr(null);
    setVoiceTranscript(null);
    setProposed([]);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setVoiceMicDenied(true);
        setVoiceErr(t("aiReceipt.voiceMicDenied"));
        return;
      }
      setVoiceMicDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoicePhase("recording");
    } catch (e) {
      setVoiceErr(e instanceof Error ? e.message : t("aiReceipt.voiceFailed"));
      setVoicePhase("idle");
    }
  }, [
    groupId,
    hasKey,
    members.length,
    premium.iapGatingEnabled,
    premium.isPremium,
    recorder,
    t,
  ]);

  const stopVoiceRecord = useCallback(async () => {
    if (voicePhase !== "recording") return;
    setVoicePhase("processing");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error(t("aiReceipt.voiceFailed"));
      const transcript = await transcribeAudioFile({
        fileUri: uri,
        mimeType: "audio/m4a",
      });
      setVoiceTranscript(transcript);
      const res = await parseExpenseDescription({
        prompt: transcript,
        currencyHint: groupCurrency,
        participantNames: members.map((m) => m.name),
      });
      if (res.expenses.length === 0) {
        setVoiceErr(t("aiReceipt.describeFailed"));
      } else {
        setProposed(res.expenses);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "MISSING_OPENAI_KEY") {
        setVoiceErr(t("aiReceipt.unavailableBuild"));
      } else {
        setVoiceErr(msg || t("aiReceipt.voiceFailed"));
      }
    } finally {
      setVoicePhase("idle");
    }
  }, [groupCurrency, members, recorder, t, voicePhase]);

  const runDescribe = useCallback(async () => {
    const prompt = describeText.trim();
    if (!prompt) {
      setDescribeErr(t("aiReceipt.describeEmpty"));
      return;
    }
    if (!groupId || members.length === 0) return;
    if (premium.iapGatingEnabled && !premium.isPremium) {
      setDescribeErr(t("aiReceipt.premiumRequiredBody"));
      return;
    }
    if (!hasKey) {
      setDescribeErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    setDescribeBusy(true);
    setDescribeErr(null);
    setProposed([]);
    try {
      const res = await parseExpenseDescription({
        prompt,
        currencyHint: groupCurrency,
        participantNames: members.map((m) => m.name),
      });
      if (res.expenses.length === 0) {
        setDescribeErr(t("aiReceipt.describeFailed"));
      } else {
        setProposed(res.expenses);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "MISSING_OPENAI_KEY") {
        setDescribeErr(t("aiReceipt.unavailableBuild"));
      } else {
        setDescribeErr(msg || t("aiReceipt.describeFailed"));
      }
    } finally {
      setDescribeBusy(false);
    }
  }, [
    describeText,
    groupId,
    groupCurrency,
    hasKey,
    members,
    premium.iapGatingEnabled,
    premium.isPremium,
    t,
  ]);

  const resolveMemberIdByName = useCallback(
    (name: string): string | null => {
      const target = name.trim().toLowerCase();
      if (!target) return null;
      const exact = members.find((m) => m.name.trim().toLowerCase() === target);
      if (exact) return exact.id;
      const partial = members.find(
        (m) =>
          m.name.trim().toLowerCase().includes(target) ||
          target.includes(m.name.trim().toLowerCase()),
      );
      return partial?.id ?? null;
    },
    [members],
  );

  const addAllProposed = useCallback(async () => {
    if (!groupId || proposed.length === 0 || addingAll) return;
    setAddingAll(true);
    setDescribeErr(null);
    try {
      const createdIdByLower = new Map<string, string>();
      const toCreate = new Map<string, string>();
      const collectName = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        if (resolveMemberIdByName(trimmed)) return;
        const key = trimmed.toLowerCase();
        if (!toCreate.has(key)) toCreate.set(key, trimmed);
      };
      for (const item of proposed) {
        collectName(item.payerName);
        for (const s of item.splits) collectName(s.personName);
      }
      for (const [key, name] of toCreate) {
        const uid = await addPersonToGroup(db, groupId, name);
        createdIdByLower.set(key, uid);
      }
      const resolveOrCreate = (name: string): string | null => {
        const existing = resolveMemberIdByName(name);
        if (existing) return existing;
        return createdIdByLower.get(name.trim().toLowerCase()) ?? null;
      };
      for (const item of proposed) {
        const amountMinor = majorFloatToMinor(item.amountMajor, groupCurrency);
        if (amountMinor <= 0) continue;
        const payerIdResolved =
          resolveOrCreate(item.payerName) ?? members[0]?.id ?? myId;
        const owed = new Map<string, number>();
        let remaining = amountMinor;
        const splitEntries = item.splits
          .map((s) => ({
            userId: resolveOrCreate(s.personName),
            minor: majorFloatToMinor(s.amountMajor, groupCurrency),
          }))
          .filter((s): s is { userId: string; minor: number } => !!s.userId);
        if (splitEntries.length === 0) continue;
        for (let i = 0; i < splitEntries.length; i++) {
          const entry = splitEntries[i]!;
          const isLast = i === splitEntries.length - 1;
          const share = isLast ? remaining : Math.min(entry.minor, remaining);
          const prev = owed.get(entry.userId) ?? 0;
          owed.set(entry.userId, prev + share);
          remaining -= share;
          if (remaining <= 0) break;
        }
        if (remaining > 0) {
          const last = splitEntries[splitEntries.length - 1]!;
          owed.set(last.userId, (owed.get(last.userId) ?? 0) + remaining);
        }
        const title = item.description.slice(0, 500);
        const newId = await addExpenseWithSplits(db, groupId, {
          description: title,
          amountMinor,
          payerId: payerIdResolved,
          expenseDate: new Date().toISOString(),
          owedByUserId: owed,
          category: null,
        });
        const savedGid = groupId;
        void classifyExpenseCategory(title)
          .then((cat) => updateExpenseCategory(db, savedGid, newId, cat))
          .catch(() => {
            /* classification is best-effort; keep the default */
          });
      }
      if (createdIdByLower.size > 0) {
        const refreshed = await listMembers(db, groupId);
        setMembers(refreshed);
      }
      setProposed([]);
      setDescribeText("");
      navigation.navigate("Groups", {
        screen: "GroupDetail",
        params: { groupId },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDescribeErr(msg || t("aiReceipt.proposedAddFailed"));
    } finally {
      setAddingAll(false);
    }
  }, [
    addingAll,
    db,
    groupCurrency,
    groupId,
    members,
    myId,
    navigation,
    proposed,
    resolveMemberIdByName,
    t,
  ]);

  const goToExpense = useCallback(() => {
    if (!groupId || lines.length === 0) return;
    const exactByUserId: Record<string, number> = {};
    for (const m of members) exactByUserId[m.id] = 0;
    for (const ln of lines) {
      const minor = majorFloatToMinor(ln.amountMajor, groupCurrency);
      const uid = ln.assigneeId;
      exactByUserId[uid] = (exactByUserId[uid] ?? 0) + minor;
    }
    const amountMinor = lines.reduce(
      (s, ln) => s + majorFloatToMinor(ln.amountMajor, groupCurrency),
      0,
    );
    if (amountMinor <= 0) return;
    const desc =
      (parsed?.merchant?.trim() || t("aiReceipt.defaultDescription")) +
      (lines.length > 1 ? ` · ${lines.length} items` : "");

    const prefill: ReceiptPrefillV1 = {
      v: 1,
      description: desc.slice(0, 500),
      amountMinor,
      payerId: members.some((m) => m.id === payerId) ? payerId : (members[0]?.id ?? myId),
      exactByUserId,
      category: guessCategoryFromTitle(desc),
    };

    navigation.navigate("Groups", {
      screen: "AddExpense",
      params: { groupId, receiptPrefill: prefill },
    });
  }, [groupCurrency, groupId, lines, members, myId, navigation, parsed?.merchant, payerId, t]);

  const aggregateMinor = useMemo(() => {
    let sum = 0;
    for (const ln of lines) {
      sum += majorFloatToMinor(ln.amountMajor, groupCurrency);
    }
    return sum;
  }, [lines, groupCurrency]);

  const modelTotalMinor = useMemo(() => {
    if (!parsed?.total || !Number.isFinite(parsed.total)) return null;
    return majorFloatToMinor(parsed.total, groupCurrency);
  }, [parsed, groupCurrency]);

  const mismatch =
    modelTotalMinor !== null && modelTotalMinor !== aggregateMinor
      ? formatMinor(Math.abs(modelTotalMinor - aggregateMinor), groupCurrency)
      : null;

  const scrollBottom = 28 + insets.bottom;
  const groupSummaryText =
    selected && groupId
      ? t("aiReceipt.groupSummary", { name: selected.name, currency: selected.currency })
      : "";

  const premiumGate = premium.iapGatingEnabled && !premium.isPremium;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.pad,
          { paddingTop: 10 + insets.top, paddingBottom: scrollBottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {!premiumGate ? (
          <View style={styles.premiumPill}>
            <Text style={styles.premiumPillText}>{t("aiReceipt.premiumPill")}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{t("aiReceipt.title")}</Text>
        <Text style={styles.muted}>{t("aiReceipt.lead")}</Text>

        {premiumGate ? (
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.cardTitle}>{t("aiReceipt.premiumRequiredTitle")}</Text>
            <Text style={[styles.muted, { marginTop: 8 }]}>{t("aiReceipt.premiumRequiredBody")}</Text>
            <AppButton
              variant="primary"
              label={t("aiReceipt.premiumUpgradeCta")}
              onPress={() => navigation.navigate("Account")}
              style={{ marginTop: 14 }}
            />
          </View>
        ) : groups.length === 0 ? (
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.muted}>{t("aiReceipt.noGroups")}</Text>
            <AppButton
              variant="secondary"
              label={t("aiReceipt.goHome")}
              onPress={() => navigation.navigate("Groups", { screen: "GroupsList" })}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : (
          <View style={[styles.card, { marginTop: 12 }]}>
            <View style={styles.groupRow}>
              {groups.length > 1 ? (
                <Pressable
                  onPress={() => setGroupModalOpen(true)}
                  style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.75 : 1 }]}
                >
                  <Text style={styles.muted} numberOfLines={1}>
                    {groupSummaryText}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.muted} numberOfLines={1}>
                  {groupSummaryText}
                </Text>
              )}
              {groups.length > 1 ? (
                <AppButton
                  variant="ghost"
                  size="sm"
                  label={t("aiReceipt.changeGroup")}
                  onPress={() => setGroupModalOpen(true)}
                />
              ) : null}
            </View>
          </View>
        )}

        {groupId && groups.length > 0 && !premiumGate ? (
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeTab, mode === "scan" && styles.modeTabOn]}
              onPress={() => setMode("scan")}
              accessibilityRole="button"
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.modeTabLabel,
                  mode === "scan" && styles.modeTabLabelOn,
                ]}
              >
                {t("aiReceipt.modeScan")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, mode === "describe" && styles.modeTabOn]}
              onPress={() => setMode("describe")}
              accessibilityRole="button"
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.modeTabLabel,
                  mode === "describe" && styles.modeTabLabelOn,
                ]}
              >
                {t("aiReceipt.modeDescribe")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, mode === "voice" && styles.modeTabOn]}
              onPress={() => setMode("voice")}
              accessibilityRole="button"
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.modeTabLabel,
                  mode === "voice" && styles.modeTabLabelOn,
                ]}
              >
                {t("aiReceipt.modeVoice")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {mode === "scan" && groupId && groups.length > 0 && !premiumGate ? (
          <View>
            {hasKey ? (
              <AppButton
                variant="primary"
                fullWidth
                label={
                  busy && imageBase64
                    ? t("aiReceipt.analyzing")
                    : t("aiReceipt.primaryAddReceipt")
                }
                onPress={() => void pickFromLibrary()}
                disabled={busy}
                left={
                  busy && imageBase64 ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="image-outline" size={20} color="#fff" />
                  )
                }
                style={{ marginBottom: 8 }}
              />
            ) : (
              <Text style={styles.warn}>{t("aiReceipt.unavailableBuild")}</Text>
            )}

            <View style={styles.btnRow}>
              {Platform.OS !== "web" && hasKey ? (
                <AppButton
                  variant="secondary"
                  size="md"
                  label={t("aiReceipt.takePhoto")}
                  left={<Ionicons name="camera-outline" size={18} color={colors.text} />}
                  onPress={() => void pickFromCamera()}
                  disabled={busy}
                />
              ) : null}
              {hasKey && imageBase64 && !busy ? (
                <AppButton
                  variant="outline"
                  size="md"
                  label={t("aiReceipt.reanalyze")}
                  onPress={reanalyze}
                />
              ) : null}
            </View>

            {imageUri ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
                <View style={styles.previewDelete} pointerEvents="box-none">
                  <Pressable
                    style={({ pressed }) => [styles.delBtn, pressed && { opacity: 0.85 }]}
                    onPress={clearPhoto}
                    disabled={busy}
                    accessibilityLabel={t("aiReceipt.removePhoto")}
                  >
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {err ? <Text style={styles.warn}>{err}</Text> : null}
        {(libDenied || camDenied) && err ? (
          <AppButton
            variant="secondary"
            fullWidth
            label={t("aiReceipt.openSettings")}
            onPress={openSystemSettings}
            style={{ marginTop: 8 }}
          />
        ) : null}

        {mode === "scan" && !premiumGate && parsed && lines.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("aiReceipt.linesHeading")}</Text>
            {parsed.currency && parsed.currency !== groupCurrency ? (
              <Text style={[styles.muted, { marginBottom: 8 }]}>
                {t("aiReceipt.receiptCurrency", { code: parsed.currency })}
              </Text>
            ) : null}
            {parsed.confidence ? (
              <Text style={[styles.muted, { marginBottom: 8 }]}>
                {t("aiReceipt.modelConfidence", { level: parsed.confidence })}
              </Text>
            ) : null}
            {lines.map((ln, idx) => (
              <View
                key={ln.id}
                style={[styles.row, idx === lines.length - 1 && styles.rowLast]}
              >
                <Text style={styles.lineLabel} numberOfLines={2}>
                  {ln.label}
                </Text>
                <Text style={styles.lineAmt}>
                  {formatMinor(majorFloatToMinor(ln.amountMajor, groupCurrency), groupCurrency)}
                </Text>
                <Pressable
                  style={styles.assigneeBtn}
                  onPress={() => setPickerLineId(ln.id)}
                >
                  <Text style={styles.assigneeBtnText} numberOfLines={1}>
                    {members.find((m) => m.id === ln.assigneeId)?.name ?? "—"}
                  </Text>
                </Pressable>
              </View>
            ))}
            <Text style={[styles.cardTitle, { marginTop: 16 }]}>{t("aiReceipt.payerLabel")}</Text>
            {members.map((m) => {
              const on = m.id === payerId;
              return (
                <Pressable
                  key={m.id}
                  style={[styles.groupPick, styles.groupPickLast]}
                  onPress={() => setPayerId(m.id)}
                >
                  <Text style={styles.groupName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {on ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={colors.muted} />
                  )}
                </Pressable>
              );
            })}
            <Text style={[styles.muted, { marginTop: 10 }]}>
              {t("aiReceipt.assignedTotal", {
                amount: formatMinor(aggregateMinor, groupCurrency),
              })}
            </Text>
            {mismatch ? (
              <Text style={styles.warn}>
                {t("aiReceipt.sumMismatch", { diff: mismatch })}
              </Text>
            ) : null}
            <AppButton
              variant="outline"
              label={t("aiReceipt.dndOpen")}
              onPress={() => setDndOpen(true)}
              disabled={members.length === 0}
              left={
                <Ionicons
                  name="swap-horizontal"
                  size={18}
                  color={colors.primary}
                />
              }
              style={{ marginTop: 14, alignSelf: "stretch" }}
              fullWidth
            />
            <AppButton
              variant="primary"
              label={t("aiReceipt.continueToSplit")}
              onPress={goToExpense}
              disabled={aggregateMinor <= 0 || !members.length}
              style={{ marginTop: 10, alignSelf: "stretch" }}
              fullWidth
            />
          </View>
        ) : mode === "scan" && !premiumGate && parsed && lines.length === 0 && !busy ? (
          <Text style={styles.warn}>{t("aiReceipt.noLines")}</Text>
        ) : null}

        {mode === "describe" && groupId && groups.length > 0 && !premiumGate ? (
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.cardTitle}>
              {t("aiReceipt.describeHeading")}
            </Text>
            <Text style={[styles.muted, { marginBottom: 10 }]}>
              {t("aiReceipt.describeLead")}
            </Text>
            <TextInput
              style={styles.describeInput}
              value={describeText}
              onChangeText={setDescribeText}
              placeholder={t("aiReceipt.describePlaceholder")}
              placeholderTextColor={colors.muted}
              multiline
              editable={!describeBusy && !addingAll}
              onFocus={() => {
                setTimeout(() => {
                  scrollRef.current?.scrollToEnd({ animated: true });
                }, 120);
              }}
            />
            <AppButton
              variant="primary"
              fullWidth
              label={
                describeBusy
                  ? t("aiReceipt.describeAnalyzing")
                  : t("aiReceipt.describeAnalyze")
              }
              onPress={() => void runDescribe()}
              disabled={describeBusy || addingAll || !hasKey || members.length === 0}
              left={
                describeBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="sparkles-outline" size={20} color="#fff" />
                )
              }
              style={{ marginTop: 12 }}
            />
            {!hasKey ? (
              <Text style={styles.warn}>{t("aiReceipt.unavailableBuild")}</Text>
            ) : null}
            {describeErr ? (
              <Text style={styles.warn}>{describeErr}</Text>
            ) : null}
          </View>
        ) : null}

        {mode === "voice" && groupId && groups.length > 0 && !premiumGate ? (
          <View style={[styles.card, { marginTop: 12 }]}>
            <View style={styles.voiceCenter}>
              {voicePhase === "processing" ? (
                <>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.voiceHeading}>
                    {t("aiReceipt.voiceProcessingTitle")}
                  </Text>
                  <Text style={styles.voiceProcessingBody}>
                    {t("aiReceipt.voiceProcessingBody")}
                  </Text>
                </>
              ) : voicePhase === "recording" ? (
                <>
                  <Text style={styles.voiceHeading}>
                    {t("aiReceipt.voiceRecording")}
                  </Text>
                  <Text style={styles.voiceTimer}>
                    {Math.max(
                      0,
                      Math.floor((recorderState.durationMillis ?? 0) / 1000),
                    )}
                    s
                  </Text>
                  <Pressable
                    style={[styles.voiceMicBtn, styles.voiceMicBtnRecording]}
                    onPress={() => void stopVoiceRecord()}
                    accessibilityRole="button"
                    accessibilityLabel={t("aiReceipt.voiceStopHint")}
                  >
                    <Ionicons name="stop" size={40} color="#fff" />
                  </Pressable>
                  <Text style={styles.voiceLead}>
                    {t("aiReceipt.voiceStopHint")}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.voiceHeading}>
                    {t("aiReceipt.voiceHeading")}
                  </Text>
                  <Text style={styles.voiceLead}>{t("aiReceipt.voiceLead")}</Text>
                  <Pressable
                    style={styles.voiceMicBtn}
                    onPress={() => void startVoiceRecord()}
                    disabled={!hasKey || members.length === 0}
                    accessibilityRole="button"
                    accessibilityLabel={t("aiReceipt.voiceStart")}
                  >
                    <Ionicons name="mic" size={40} color="#fff" />
                  </Pressable>
                </>
              )}
            </View>
            {!hasKey ? (
              <Text style={styles.warn}>{t("aiReceipt.unavailableBuild")}</Text>
            ) : null}
            {voiceErr ? <Text style={styles.warn}>{voiceErr}</Text> : null}
            {voiceMicDenied ? (
              <AppButton
                variant="secondary"
                fullWidth
                label={t("aiReceipt.voiceMicDeniedOpenSettings")}
                onPress={openSystemSettings}
                style={{ marginTop: 8 }}
              />
            ) : null}
            {voiceTranscript ? (
              <View style={styles.voiceTranscript}>
                <Text style={[styles.cardTitle, { marginBottom: 4 }]}>
                  {t("aiReceipt.voiceTranscriptHeading")}
                </Text>
                <Text style={styles.muted}>{voiceTranscript}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {(mode === "describe" || mode === "voice") && proposed.length > 0 && !premiumGate ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {t("aiReceipt.proposedHeading")}
            </Text>
            {proposed.map((item, idx) => (
              <View
                key={`${idx}-${item.description}`}
                style={[
                  styles.proposedItem,
                  idx === proposed.length - 1 && styles.proposedItemLast,
                ]}
              >
                <View style={styles.proposedTopRow}>
                  <Text style={styles.proposedDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text style={styles.proposedAmt}>
                    {formatMinor(
                      majorFloatToMinor(item.amountMajor, groupCurrency),
                      groupCurrency,
                    )}
                  </Text>
                </View>
                <Text style={styles.proposedMeta}>
                  {t("aiReceipt.proposedPaidBy", { name: item.payerName })}
                </Text>
                <Text style={styles.proposedMeta}>
                  {t("aiReceipt.proposedSplitSummary", {
                    count: String(item.splits.length),
                  })}
                  {": "}
                  {item.splits.map((s) => s.personName).join(", ")}
                </Text>
              </View>
            ))}
            <AppButton
              variant="primary"
              fullWidth
              label={
                addingAll
                  ? t("aiReceipt.proposedAdding")
                  : t("aiReceipt.proposedAddAll", {
                      group: selected?.name ?? "",
                    })
              }
              onPress={() => void addAllProposed()}
              disabled={addingAll || proposed.length === 0}
              left={
                addingAll ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="checkmark-done" size={20} color="#fff" />
                )
              }
              style={{ marginTop: 12, alignSelf: "stretch" }}
            />
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={groupModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setGroupModalOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: 16 + insets.bottom }]}>
            <Text style={styles.modalTitle}>{t("aiReceipt.changeGroup")}</Text>
            <FlatList
              data={groups}
              keyExtractor={(g) => g.id}
              renderItem={({ item, index }) => {
                const on = item.id === groupId;
                return (
                  <Pressable
                    style={[styles.groupPick, index === groups.length - 1 && styles.groupPickLast]}
                    onPress={() => {
                      setGroupId(item.id);
                      setGroupModalOpen(false);
                    }}
                  >
                    <Text style={styles.groupName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{item.currency}</Text>
                    {on ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color={colors.muted} />
                    )}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={pickerLineId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerLineId(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerLineId(null)}>
          <View style={[styles.modalSheet, { paddingBottom: 16 + insets.bottom }]}>
            <Text style={styles.modalTitle}>{t("aiReceipt.pickMemberTitle")}</Text>
            <FlatList
              data={members}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => pickerLineId && setAssignee(pickerLineId, item.id)}
                >
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      <ReceiptAssignDnDModal
        visible={dndOpen}
        onClose={() => setDndOpen(false)}
        lines={lines.map((ln) => ({
          id: ln.id,
          label: ln.label,
          amountMajor: ln.amountMajor,
          assigneeId: ln.assigneeId,
        }))}
        members={members}
        currency={groupCurrency}
        onApply={(updated: AssignableLine[]) => {
          const fallback = members[0]?.id ?? myId;
          setLines((prev) =>
            prev.map((ln) => {
              const next = updated.find((u) => u.id === ln.id);
              if (!next) return ln;
              return { ...ln, assigneeId: next.assigneeId ?? fallback };
            }),
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}
