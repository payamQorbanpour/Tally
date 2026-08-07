import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type CompositeNavigationProp,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import {
  isAudioRecordingAvailable,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "../core/audioRecording";
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
import { downscaleReceiptImage } from "../core/downscaleReceiptImage";
import { guessCategoryFromTitle } from "../core/guessCategoryFromTitle";
import { parseReceiptImageBase64 } from "../core/parseReceiptImage";
import { computeReceiptOwed, type SplitLine } from "../core/receiptSplit";
import { parseExpenseDescription } from "../core/parseExpenseDescription";
import {
  clearReceiptDraft,
  loadReceiptDraft,
  saveReceiptDraft,
} from "../core/receiptDraft";
import { transcribeAudioFile } from "../core/transcribeAudio";
import type { ParsedExpenseItem } from "../core/expenseDescriptionTypes";
import type { ParsedReceiptPayload } from "../core/receiptParseTypes";
import { hasAnyAiBackend } from "../core/receiptAiEnv";
import {
  addExpenseWithSplits,
  addPersonToGroup,
  createAutoErrorReport,
  formatMinor,
  getGroup,
  listGroups,
  listMembers,
  updateExpenseCategory,
  type GroupRow,
  type MemberRow,
} from "../data/tallyRepo";
import {
  currencyMinorExponent,
  formatUnsignedMoneyInputDisplay,
  majorFloatToMinor,
  minorToAmountInputString,
  parseMoneyToMinor,
} from "../data/currencies";
import { useDatabase } from "../db/DatabaseContext";
import { usePremium } from "../premium/PremiumContext";
import { useAiCredits } from "../premium/AiCreditsContext";
import { AiCreditsPanel } from "../components/AiCreditsPanel";
import { resolveAiAccess } from "../core/aiAccess";
import {
  AiProxyDisabledError,
  AiProxyHttpError,
  AiProxyInsufficientCreditsError,
} from "../core/aiProxy";
import { useAiConfig } from "../premium/RemoteConfigContext";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { getLocalUserId, newId } from "../db/ids";
import { PersonAvatar } from "../components/PersonAvatar";
import { ReceiptLineRow } from "./aiReceipt/ReceiptLineRow";
import { useLocalUserAvatar } from "../hooks/useLocalUserAvatar";
import { useTourTarget } from "../hooks/useTourTarget";
import { useLocale } from "../i18n/LocaleContext";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";
import { TextInput, type AppTextInputRef } from "../ui/AppTextInput";

type AiNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "AiReceipt">,
  NativeStackNavigationProp<RootStackParamList>
>;

type EditableLine = {
  id: string;
  label: string;
  amountMajor: number;
  /** Members sharing this line. Empty = unassigned; blocks Save for item lines. */
  sharerIds: string[];
  /** "spread" lines are distributed proportionally over the item lines. */
  kind: "item" | "spread";
  /** When true the user has switched the line off — kept for re-enable, but
   *  excluded from totals, splits, and the save. */
  disabled?: boolean;
};

type Attachment = {
  id: string;
  uri: string;
  base64: string;
  mimeType: string;
};

function mediaLibraryAllowed(
  p: Awaited<ReturnType<typeof ImagePicker.getMediaLibraryPermissionsAsync>>,
) {
  if (p.status === "granted") return true;
  if (p.accessPrivileges === "limited" || p.accessPrivileges === "all") return true;
  return false;
}

function buildStyles(colors: ThemeColors, isRTL: boolean, cardShadow: ShadowStyle) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    pad: { paddingHorizontal: 20 },
    /* — Sign-in / premium gate overlay (floats above the dimmed AI page
         so the user sees a single upsell card on top of the disabled UI) — */
    gateOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    // Match the visual width of the Cloud sync gate card on AccountScreen,
    // which renders inside a padded section card. Without this constraint
    // the AI variant fills the screen and looks larger than its sibling.
    gateOverlayInner: {
      width: "100%",
      maxWidth: 360,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      marginTop: 4,
      marginBottom: 6,
      ...te,
    },
    /** Wrapper for the static top header — sits above the scroll view and
        masks content scrolling beneath it. Holds the safe-area inset plus
        the page title row. Mirrors the headerAnchor pattern used on
        Friends and Activity screens. */
    headerAnchor: {
      backgroundColor: colors.bg,
      paddingHorizontal: 20,
      zIndex: 2,
    },
    /* Page heading row, mirroring `friends.title` / `activity.title`. */
    pageTitleRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 14,
      width: "100%",
    },
    pageTitleSpacer: { width: 36 },
    pageTitleText: {
      flex: 1,
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    /* —— Canonical AI hero ————————————————————————————————— */
    aiHeroRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 4,
      marginTop: 4,
      marginBottom: 12,
    },
    aiHeroIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    aiHeroTextCol: { flex: 1, minWidth: 0 },
    aiHeroTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.4,
      ...te,
    },
    aiHeroSubtitle: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 2,
      ...te,
    },
    // NOTE: brief called for `colors.card`, which isn't a token on
    // `ThemeColors` (see src/theme/tokens.ts); `colors.surface` is the
    // existing analog used for card-like backgrounds throughout this file.
    creditsChip: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    addingToPill: {
      alignSelf: isRTL ? "flex-end" : "flex-start",
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.owedSoft,
      marginBottom: 14,
      maxWidth: "100%",
    },
    addingToPillText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.primary,
      flexShrink: 1,
    },
    /* —— New top-section design ————————————————————————————————— */
    heroCard: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 14,
      marginTop: 4,
      marginBottom: 14,
    },
    heroTextCol: { flex: 1, minWidth: 0 },
    heroTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      ...te,
    },
    heroSub: {
      fontSize: 12,
      color: colors.muted,
      lineHeight: 18,
      marginTop: 4,
      ...te,
    },
    heroIllustration: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    addExpenseRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 6,
      marginBottom: 14,
    },
    addExpenseLabel: {
      fontSize: 13,
      color: colors.muted,
      ...te,
    },
    addExpenseValueWrap: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 4,
    },
    addExpenseValue: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      ...te,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: 6,
      marginBottom: 10,
      ...te,
    },
    tilesGrid: {
      flexDirection: isRTL ? "row-reverse" : "row",
      gap: 12,
      marginBottom: 20,
    },
    /** Photo tile (filled primary) — the highlighted action. */
    tileBoxPrimary: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 22,
      paddingHorizontal: 14,
      alignItems: "flex-start",
      gap: 12,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 3,
    },
    /** Gallery tile (white surface) — the secondary action. */
    tileBox: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardRim,
      paddingVertical: 22,
      paddingHorizontal: 14,
      alignItems: "flex-start",
      gap: 12,
    },
    tileBoxDisabled: { opacity: 0.5 },
    tileIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.owedSoft,
    },
    /** Icon tile inside the filled-primary Photo card. */
    tileIconWrapInverse: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    tileLabel: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.2,
    },
    tileLabelInverse: {
      fontSize: 17,
      fontWeight: "800",
      color: "#FFFFFF",
      letterSpacing: -0.2,
    },
    tileSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: -6,
    },
    tileSubInverse: {
      fontSize: 12,
      color: "rgba(255, 255, 255, 0.85)",
      marginTop: -6,
    },
    /** White card wrapping the typed-prompt textarea + helper line + inline Analyze. */
    describeBox: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      marginBottom: 14,
      ...cardShadow,
    },
    describeBoxInput: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
      padding: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
      textAlignVertical: "top",
      minHeight: 60,
    },
    describeFootRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      marginTop: 8,
    },
    describeHelper: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      color: colors.muted,
      ...te,
    },
    analyzeChip: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.primary,
      flexShrink: 0,
    },
    analyzeChipDisabled: { opacity: 0.5 },
    analyzeChipText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    voiceCtaWrap: {
      alignItems: "center",
      marginBottom: 18,
    },
    voiceCircleLarge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    voiceCircleLargeRecording: {
      backgroundColor: colors.destructive,
    },
    voiceCircleLargeDisabled: { opacity: 0.5 },
    voiceCtaLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.muted,
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
      paddingVertical: 0,
      minHeight: 32,
    },
    /** Compact wrapper for the group-selector card (smaller than the standard `card`). */
    groupCardCompact: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginBottom: 12,
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
    /** Wrapper that sits the row's tap-to-expand zone next to the remove
     *  button so tapping X toggles disabled instead of the tray. */
    rowOuter: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowFlex: { flex: 1, borderBottomWidth: 0 },
    lineLabel: { flex: 1, fontSize: 15, color: colors.text, minWidth: 0, ...te },
    lineAmt: { fontSize: 15, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
    lineLabelInput: {
      paddingVertical: 6,
      paddingHorizontal: 0,
    },
    lineAmtInput: {
      minWidth: 80,
      paddingVertical: 6,
      paddingHorizontal: 0,
      textAlign: isRTL ? "left" : "right",
    },
    lineDisabledText: {
      color: colors.muted,
      textDecorationLine: "line-through",
    },
    rowDisabled: {
      opacity: 0.55,
    },
    removeLineBtn: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    /** Subtle affordance on expandable rows — thin left border + soft
     *  fill tells the user the whole row is tappable in Exact mode. */
    rowExpandable: {
      backgroundColor: colors.owedSoft,
      borderRadius: 8,
      paddingHorizontal: 8,
      marginVertical: 2,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    /** Dedicated, input-free tap target on an expandable row — see the
     *  comment at its one call site for why a plain 44x44 icon slot (not
     *  more chip/pressable surface) is what closes the "tapping the row
     *  focuses the keyboard instead of expanding" gap. */
    expandChevron: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    /* — Task 7: expandable per-item row + its member-toggle tray — */
    /** Display-only summary strip beneath a line row — no longer a tap
     *  target (the row above it is), so it only needs to size to its
     *  content; `ReceiptLineRow` skips rendering it entirely when there's
     *  nothing to summarize. */
    lineSharerSummary: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingLeft: isRTL ? 0 : 26,
      paddingRight: isRTL ? 26 : 0,
    },
    lineSpreadChip: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
      backgroundColor: colors.owedSoft,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      overflow: "hidden",
    },
    lineShareCount: {
      fontSize: 12,
      color: colors.muted,
      fontVariant: ["tabular-nums"],
    },
    lineStackAvatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.surface,
    },
    lineStackAvatarLetter: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.primary,
    },
    lineTray: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 8,
      ...cardShadow,
    },
    lineKindSeg: {
      flexDirection: isRTL ? "row-reverse" : "row",
      backgroundColor: colors.inputSurface,
      borderRadius: 10,
      padding: 3,
      marginBottom: 8,
    },
    lineKindSegBtn: {
      flex: 1,
      paddingVertical: 6,
      alignItems: "center",
      borderRadius: 8,
    },
    lineKindSegBtnSel: {
      backgroundColor: colors.surface,
      ...cardShadow,
    },
    lineKindSegText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
    },
    lineTrayHint: {
      fontSize: 12,
      color: colors.muted,
      marginBottom: 8,
      ...te,
    },
    lineTrayPicks: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    lineTrayPick: {
      width: 72,
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderRadius: 10,
      backgroundColor: colors.owedSoft,
    },
    lineTrayPickOff: {
      opacity: 0.45,
      backgroundColor: colors.inputSurface,
    },
    lineTrayPickAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    lineTrayPickAvatarLetter: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text,
    },
    lineTrayPickName: {
      fontSize: 11,
      color: colors.text,
      marginTop: 4,
      maxWidth: 68,
      textAlign: "center",
    },
    lineTrayPickSlice: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.primary,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
    },
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
    thumbRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    thumbTile: {
      position: "relative" as const,
      width: 88,
      height: 88,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    thumbTap: { width: "100%", height: "100%" },
    thumbImg: { width: "100%", height: "100%" },
    thumbClose: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    imagePreviewBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
      alignItems: "center",
      justifyContent: "center",
    },
    imagePreviewFull: { width: "100%", height: "100%" },
    imagePreviewClose: {
      position: "absolute",
      right: 16,
      left: 16,
      flexDirection: isRTL ? "row" : "row-reverse",
    },
    imagePreviewCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.15)",
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
    tileRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      /** Stretch so every split tile matches the tallest (payer vs non-payer differ in height). */
      alignItems: "stretch",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    personTileWrap: {
      position: "relative" as const,
      ...Platform.select({
        web: { width: 120 },
        default: { width: 100 },
      }),
      marginHorizontal: 2,
      flexDirection: "column",
    },
    personTilePressFill: {
      flex: 1,
      minHeight: 0,
    },
    personTile: {
      width: "100%",
      alignItems: "center",
      paddingTop: 8,
      paddingBottom: 10,
      paddingHorizontal: 4,
      borderRadius: 12,
      backgroundColor: colors.bg,
      /** Same width as payer tile so layout matches (payer uses 3px primary border) */
      borderWidth: 3,
      borderColor: colors.border,
    },
    /** Payer: full-card green frame + soft fill */
    personTilePayer: {
      borderColor: colors.primary,
      backgroundColor: colors.owedSoft,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.35,
          shadowRadius: 4,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    personTileExcluded: {
      opacity: 0.5,
      borderWidth: 3,
      borderStyle: "dashed",
      borderColor: colors.muted,
      backgroundColor: colors.surface,
    },
    avatarTap: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 4,
      minWidth: 52,
    },
    tileBodyTap: {
      width: "100%",
      alignItems: "center",
      paddingTop: 2,
      paddingBottom: 2,
    },
    /** Amount / sub-fields below name+include row. */
    personTileUnderArea: {
      width: "100%",
      alignItems: "center",
      flex: 1,
      minHeight: 0,
      justifyContent: "flex-start",
    },
    paidBadge: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      alignSelf: "stretch",
      width: "100%",
    },
    paidBadgeLabel: {
      fontSize: 11,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    includedToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 6,
      paddingHorizontal: 8,
      borderRadius: 10,
      alignSelf: "stretch",
      width: "100%",
      /** Fixed height so Included vs Out match on Android/iOS (font + icon metrics differ). */
      height: 36,
    },
    includedIconSlot: {
      width: 22,
      height: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    includedToggleOn: {
      backgroundColor: colors.owedSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primary,
    },
    includedToggleOff: {
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    includedToggleLabel: {
      fontSize: 10,
      fontWeight: "800",
      ...Platform.select({
        web: {},
        default: { textTransform: "uppercase" },
      }),
      letterSpacing: 0.3,
      ...Platform.select({
        android: { includeFontPadding: false },
        default: {},
      }),
    },
    includedToggleLabelOn: { color: colors.primary },
    includedToggleLabelOff: { color: colors.muted },
    /** Fixed-height row so the PAID badge doesn't shift the layout on   */
    /** non-payer tiles — keeps name + Included + amount aligned across. */
    paidBadgeSlot: {
      height: 36,
      alignSelf: "stretch",
      justifyContent: "center",
      alignItems: "center",
    },
    splitToolbarScroll: {
      marginTop: 10,
      marginBottom: 12,
      marginHorizontal: -4,
      ...Platform.select({
        web: {
          overflowX: "auto" as const,
          overflowY: "hidden" as const,
          width: "100%" as const,
          maxWidth: "100%" as const,
        },
        default: {},
      }),
    },
    splitToolbarInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 4,
    },
    splitTab: {
      minWidth: 52,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: colors.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
    },
    splitTabOn: {
      backgroundColor: colors.owedSoft,
      borderColor: colors.primary,
    },
    splitTabLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },
    splitTabLabelOn: { color: colors.primary, fontWeight: "700" },
    splitModeHeading: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
      ...te,
    },
    personTileAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    personTileAvatarPayerRing: {
      borderWidth: 3,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    personTileAvatarLetter: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "700",
    },
    personTileName: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 4,
      maxWidth: "100%",
      textAlign: "center",
    },
    /** Payer tile: bold name */
    personTileNameOn: { color: colors.text, fontWeight: "800", fontSize: 12 },
    personTileAmount: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text,
      marginTop: 8,
      textAlign: "center",
      width: "100%",
      fontVariant: ["tabular-nums"],
    },
    personTileAmountPayer: {
      fontWeight: "800",
      fontSize: 13,
    },
    personTileAmountMuted: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
      marginTop: 8,
      textAlign: "center",
    },
    personTileInput: {
      width: "100%",
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 4,
      paddingVertical: Platform.OS === "ios" ? 8 : 6,
      fontSize: 13,
      textAlign: "center",
      writingDirection: "ltr",
      direction: "ltr",
      backgroundColor: colors.inputSurface,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    personTileAdjInput: {
      width: "100%",
      marginTop: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 4,
      paddingVertical: Platform.OS === "ios" ? 6 : 4,
      fontSize: 12,
      textAlign: "center",
      writingDirection: "ltr",
      direction: "ltr",
      backgroundColor: colors.inputSurface,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    /** Payer's numeric fields: slightly heavier */
    personTileInputPayer: {
      fontWeight: "800",
      borderWidth: 2,
      borderColor: colors.primary,
    },
    tilePercentRow: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      marginTop: 8,
      gap: 4,
    },
    personTileInputFlex: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 4,
      paddingVertical: Platform.OS === "ios" ? 8 : 6,
      fontSize: 13,
      textAlign: "center",
      writingDirection: "ltr",
      direction: "ltr",
      backgroundColor: colors.inputSurface,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    pctSuffix: { width: 20, fontSize: 16, color: colors.muted },
    personTileSubMoney: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.muted,
      marginTop: 4,
      textAlign: "center",
      width: "100%",
      fontVariant: ["tabular-nums"],
    },
    saveRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      gap: 8,
      marginTop: 10,
    },
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
    describeActionRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
    },
    describeAnalyzeBtn: { flex: 1, minWidth: 0 },
    inlineCircleBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    inlineCircleBtnSecondary: {
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    inlineCircleBtnRecording: { backgroundColor: colors.owe },
    inlineCircleBtnDisabled: { opacity: 0.5 },
    voiceStatus: {
      fontSize: 13,
      color: colors.muted,
      textAlign: "center",
      marginTop: 8,
      ...te,
    },
    voiceStatusRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 8,
    },
  });
}

/** Whole numbers summing to 100, for equal %-split across `n` people. */
function equalIntegerPercents(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const rem = 100 - base * n;
  const out = Array.from({ length: n }, () => base);
  for (let i = 0; i < rem; i++) {
    out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}

/** Parse a percent text input as a non-negative number; blanks → 0. */
function parsePercentInput(text: string | undefined): number {
  if (!text) return 0;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Parse a share text input as a non-negative integer; blanks → 0. */
function parseShareInput(text: string | undefined): number {
  if (!text) return 0;
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Parse a money input (major float, can be signed) into minor units. */
function parseSignedMoneyInputMinor(
  text: string | undefined,
  currency: string,
): number {
  if (!text) return 0;
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === "+") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 0;
  return majorFloatToMinor(n, currency);
}

/**
 * Match a free-text name (as returned by an AI parse) to a member id: exact
 * case-insensitive match first, then a substring match in either direction.
 * Returns null rather than guessing when nothing matches. This is the same
 * algorithm `resolveMemberIdByName` (below, inside the component) uses for
 * the "describe an expense" flow's name resolution — kept as one pure
 * top-level function so `payloadToEditableLines` (which runs outside the
 * component, before any hooks exist) and the component's own resolver can
 * never drift into two different matching rules.
 */
function matchMemberNameToId(
  name: string,
  members: readonly { id: string; name: string }[],
): string | null {
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
}

/** Convert a persisted integer minor-unit amount back to the screen's float
 *  `amountMajor` — the same `minor / 10 ** exponent` shape as
 *  `updateLineAmount`'s inverse conversion, run in the other direction to
 *  restore a draft line. */
function minorToMajorFloat(amountMinor: number, currency: string): number {
  const exp = currencyMinorExponent(currency);
  return amountMinor / 10 ** exp;
}

function payloadToEditableLines(
  parsed: ParsedReceiptPayload,
  fallbackTotalLabel: string,
  members: readonly { id: string; name: string }[],
  includedMemberIds: ReadonlySet<string>,
): EditableLine[] {
  // A line's `people` (names the model attributed it to from the user's
  // description) resolve to member ids here, once, at parse time — a name
  // that matches nobody is dropped rather than guessed at, exactly as if
  // the description hadn't mentioned that line. Also dropped: a match that
  // resolves to a member who is currently excluded from the split — same
  // rule the tray applies (`trayMembers`), so a fresh line never shows an
  // avatar the money ignores. An empty `includedMemberIds` means nothing
  // has been excluded yet (either the very first parse in this group, or
  // the seed effect hasn't run yet to populate it with every member) — in
  // that case there is nothing to filter against, so every match stands.
  const resolveSharerIds = (names: string[] | undefined): string[] => {
    if (!names || names.length === 0) return [];
    const ids = new Set<string>();
    for (const n of names) {
      const id = matchMemberNameToId(n, members);
      if (!id) continue;
      if (includedMemberIds.size > 0 && !includedMemberIds.has(id)) continue;
      ids.add(id);
    }
    return [...ids];
  };
  const out: EditableLine[] = [];
  if (parsed.lines.length > 0) {
    for (const l of parsed.lines) {
      out.push({
        id: newId(),
        label: l.label,
        amountMajor: l.amount,
        sharerIds: resolveSharerIds(l.people),
        kind: l.kind === "surcharge" || l.kind === "discount" ? "spread" : "item",
      });
    }
    return out;
  }
  if (parsed.total != null && Number.isFinite(parsed.total)) {
    out.push({
      id: newId(),
      label: fallbackTotalLabel,
      amountMajor: parsed.total,
      sharerIds: [],
      kind: "item",
    });
  }
  return out;
}

/** Debounce window for persisting the in-progress receipt draft after an
 *  edit — long enough that a burst of rapid taps (toggling sharers, typing
 *  a label) coalesces into one write, short enough that a kill shortly
 *  after the last edit still loses very little. Same order of magnitude as
 *  `DatabaseContext`'s own push debounce (`PUSH_DEBOUNCE_MS`). */
const DRAFT_SAVE_DEBOUNCE_MS = 600;

export function AiReceiptScreen() {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { t, locale, isRTL } = useLocale();
  const styles = useMemo(
    () => buildStyles(colors, isRTL, shadows.card),
    [colors, isRTL, shadows.card],
  );
  const db = useDatabase();
  const navigation = useNavigation<AiNav>();
  const route = useRoute<RouteProp<MainTabParamList, "AiReceipt">>();
  const premium = usePremium();
  const credits = useAiCredits();
  const [creditsPanelVisible, setCreditsPanelVisible] = useState(false);
  const { user: authUser } = useSupabaseSession();
  const myId = getLocalUserId();
  const { avatarUri: myAvatarUri } = useLocalUserAvatar();
  // Tour anchor for step 3 — spotlights the AI hero card.
  const aiTour = useTourTarget("ai");

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupCurrency, setGroupCurrency] = useState("USD");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [parsed, setParsed] = useState<ParsedReceiptPayload | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [payerId, setPayerId] = useState(myId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [libDenied, setLibDenied] = useState(false);
  const [camDenied, setCamDenied] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const describeInputRef = useRef<AppTextInputRef>(null);

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
  type ScanSplitMode = "equal" | "exact" | "percent" | "shares" | "adj";
  const [scanSplitMode, setScanSplitMode] = useState<ScanSplitMode>("exact");
  const [includedMemberIds, setIncludedMemberIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Per-member text inputs for percent / shares / adjust modes. */
  const [percentText, setPercentText] = useState<Record<string, string>>({});
  const [sharesText, setSharesText] = useState<Record<string, string>>({});
  const [adjText, setAdjText] = useState<Record<string, string>>({});
  /** Which line's per-item tray is open, if any — only one at a time. */
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  /** Mirrors `lines` so the draft-restore effect can synchronously check
   *  "is there already a fresh scan in this session?" without relying on
   *  setState-updater timing — see the groupId effect's restore block. */
  const linesRef = useRef<EditableLine[]>(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  /** True once the current `groupId`'s draft-restore attempt (in the
   *  groupId effect below) has finished, whether or not a draft existed.
   *  The debounced-save effect gates on this so it can never write before a
   *  restore had its chance to run first. */
  const [draftHydrated, setDraftHydrated] = useState(false);
  /** Set right before a successful restore's state updates, and consumed by
   *  the very next debounced-save effect run, so restoring a draft never
   *  immediately re-saves the same draft it just loaded. */
  const skipNextDraftSaveRef = useRef(false);

  const aiConfig = useAiConfig();
  const hasKey = hasAnyAiBackend();

  const aiAccess = resolveAiAccess({
    signedIn: Boolean(authUser?.email),
    emailConfirmed: Boolean(authUser?.email_confirmed_at),
    isPremium: premium.isPremium,
    balance: credits.balance,
    adsAvailable: credits.adsAvailable,
    aiEnabled: aiConfig.config.aiEnabled,
  });

  /**
   * Gate an AI action at the point of value. Sign-in and pass problems go to
   * their existing screens; a spent-out balance opens the credits panel in
   * place, so the user does not lose the receipt they were about to scan.
   */
  const ensureAiAccess = useCallback(() => {
    if (aiAccess === "allowed") return true;
    if (aiAccess === "unavailable") {
      setErr(t("aiReceipt.temporarilyUnavailable"));
      return false;
    }
    if (aiAccess === "needs_signin") {
      navigation.navigate(authUser?.email ? "Plans" : "Auth");
      return false;
    }
    setCreditsPanelVisible(true);
    return false;
  }, [aiAccess, authUser?.email, navigation, t]);

  const aiGated = aiAccess !== "allowed";

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
    // Block the debounced-save effect until this group's restore attempt
    // (below) has had its chance to run — see `draftHydrated`'s doc comment.
    setDraftHydrated(false);
    let live = true;
    void (async () => {
      const [g, m] = await Promise.all([getGroup(db, groupId), listMembers(db, groupId)]);
      if (!live) return;
      const currency = g?.currency ?? "USD";
      setGroupCurrency(currency);
      setMembers(m);
      setPayerId((p) => (m.some((x) => x.id === p) ? p : (m[0]?.id ?? myId)));

      // Stale-sharer guard: this effect only re-runs when `groupId` itself
      // changes, and a receipt can't be parsed before a group is selected —
      // so on the very first run `lines` is always still empty and both
      // functional updates below no-op immediately. On a genuine mid-flow
      // group switch, prune any sharerIds / included-member ids left over
      // from the *previous* group's members. We intersect rather than wipe
      // outright — a person who's a member of both groups keeps their
      // assignment, and if pruning empties includedMemberIds entirely, the
      // existing "seed on empty" effect below re-populates it from the new
      // group's full member list (it depends on `members`, which just
      // changed via setMembers above).
      const validIds = new Set(m.map((x) => x.id));
      setLines((prev) => {
        if (prev.length === 0) return prev;
        let changed = false;
        const next = prev.map((l) => {
          const pruned = l.sharerIds.filter((id) => validIds.has(id));
          if (pruned.length === l.sharerIds.length) return l;
          changed = true;
          return { ...l, sharerIds: pruned };
        });
        return changed ? next : prev;
      });
      setIncludedMemberIds((prev) => {
        if (prev.size === 0) return prev;
        const pruned = new Set([...prev].filter((id) => validIds.has(id)));
        return pruned.size === prev.size ? prev : pruned;
      });

      // Restore a persisted draft for this group, after the pruning above
      // so a restored draft's own `sharerIds` get filtered against the same
      // `validIds` roster (a draft whose sharerIds name members no longer
      // in the group must not resurrect them). Gated on `linesRef` — not
      // `lines` from this closure, which can be stale by the time this
      // resolves — being empty, so a receipt already scanned/typed in this
      // session by the time we get here is never clobbered. That check has
      // to read the ref synchronously rather than inside a `setLines`
      // updater callback: with automatic batching there's no guarantee an
      // updater runs before the next line of this function executes, so a
      // side-effect flag set inside one would be a race.
      try {
        const draft = await loadReceiptDraft(groupId);
        if (!live || !draft) return;
        if (linesRef.current.length > 0) return;
        // Consumed by the very next debounced-save effect run so restoring
        // doesn't immediately write the same draft straight back out.
        skipNextDraftSaveRef.current = true;
        setLines(
          draft.lines.map((l) => ({
            id: l.id,
            label: l.label,
            amountMajor: minorToMajorFloat(l.amountMinor, currency),
            sharerIds: l.sharerIds.filter((id) => validIds.has(id)),
            kind: l.kind,
            disabled: l.disabled,
          })),
        );
        setScanSplitMode(draft.splitMode);
        setPayerId(validIds.has(draft.payerId) ? draft.payerId : (m[0]?.id ?? myId));
        setIncludedMemberIds(
          new Set(draft.includedMemberIds.filter((id) => validIds.has(id))),
        );
      } finally {
        if (live) setDraftHydrated(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [db, groupId, myId]);

  /**
   * Debounced draft persistence: save whenever the in-progress receipt
   * changes, so an app kill mid-edit doesn't force a re-scan. Gated on
   * `draftHydrated` so it can never fire before this group's restore
   * attempt (above) has run, and on `skipNextDraftSaveRef` so a successful
   * restore doesn't immediately save the very same draft straight back —
   * see that ref's doc comment. `lines.length === 0` covers both "nothing
   * parsed yet" (first mount, nothing to save) and the moment
   * `resetReceiptFlow` clears everything (whose own explicit
   * `clearReceiptDraft` call is what actually removes the draft — this
   * guard just avoids writing an empty one in between).
   */
  useEffect(() => {
    if (!groupId || !draftHydrated) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    if (lines.length === 0) return;
    const handle = setTimeout(() => {
      void saveReceiptDraft({
        groupId,
        lines: lines.map((l) => ({
          id: l.id,
          label: l.label,
          amountMinor: majorFloatToMinor(l.amountMajor, groupCurrency),
          sharerIds: l.sharerIds,
          kind: l.kind,
          disabled: l.disabled ?? false,
        })),
        splitMode: scanSplitMode,
        payerId,
        includedMemberIds: [...includedMemberIds],
      });
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [
    groupId,
    draftHydrated,
    lines,
    scanSplitMode,
    payerId,
    includedMemberIds,
    groupCurrency,
  ]);

  const selected = groups.find((g) => g.id === groupId);

  /**
   * Map any AI-call failure to a UI string, while recording the raw detail
   * via createAutoErrorReport so Supabase-synced feedback_reports act as a
   * monitoring channel. Known short codes ("MISSING_OPENAI_KEY", "OfflineError"
   * etc.) are returned verbatim so callers can branch on them; everything else
   * collapses to the generic message.
   */
  const toUserFacingAiError = useCallback(
    (err: unknown, context: string): string => {
      const e =
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : "Unknown AI error");
      if (e.message === "MISSING_OPENAI_KEY") {
        return t("aiReceipt.unavailableBuild");
      }
      if (e.name === "OfflineError") {
        return t("aiReceipt.offlineError");
      }
      if (e instanceof AiProxyHttpError) {
        if (e.status === 429) return t("aiReceipt.aiErrorRateLimited");
        if (e.status >= 500) return t("aiReceipt.aiErrorServer");
      }
      void createAutoErrorReport(db, e, { context }).catch(() => {
        /* monitoring is best-effort — never block the UI */
      });
      return t("aiReceipt.aiErrorGeneric");
    },
    [db, t],
  );

  const runParse = useCallback(
    async (b64: string, mime: string, description?: string) => {
      if (!groupId) return;
      if (!authUser?.email) {
        navigation.navigate("Auth");
        return;
      }
      // Re-check at the point of spend: `aiAccess` is recomputed from live
      // balance/premium state, so the balance can have hit zero since the
      // caller gated. ensureAiAccess routes each state correctly (credits
      // exhausted → panel, not the Plans screen).
      if (!ensureAiAccess()) return;
      if (!hasKey) {
        setErr(t("aiReceipt.unavailableBuild"));
        return;
      }
      if (!aiConfig.isActionEnabled("parse-receipt")) {
        setErr(t("aiReceipt.temporarilyUnavailable"));
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const out = await parseReceiptImageBase64({
          base64: b64,
          mimeType: mime,
          currencyHint: groupCurrency,
          description,
          participantNames: description ? members.map((m) => m.name) : undefined,
        });
        setParsed(out);
        setLines(
          payloadToEditableLines(
            out,
            t("aiReceipt.fallbackTotalLabel"),
            members,
            includedMemberIds,
          ),
        );
      } catch (e) {
        if (e instanceof AiProxyInsufficientCreditsError) {
          // The server is authoritative; resync and let the user top up.
          void credits.refresh();
          setCreditsPanelVisible(true);
          return;
        }
        if (e instanceof AiProxyDisabledError) {
          // Client config was stale — resync so the UI self-heals.
          aiConfig.refresh();
          setErr(t("aiReceipt.temporarilyUnavailable"));
          return;
        }
        setErr(toUserFacingAiError(e, "ai:receipt-image"));
      } finally {
        setBusy(false);
      }
    },
    [
      groupCurrency,
      groupId,
      hasKey,
      includedMemberIds,
      members,
      t,
      toUserFacingAiError,
      ensureAiAccess,
      credits,
      authUser?.email,
      navigation,
      aiConfig,
    ],
  );

  const pickFromLibrary = useCallback(async () => {
    if (!ensureAiAccess()) return;
    if (!hasKey) {
      setErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    if (!aiConfig.isActionEnabled("parse-receipt")) {
      setErr(t("aiReceipt.temporarilyUnavailable"));
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
        allowsMultipleSelection: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const incoming: Attachment[] = [];
      for (const a of res.assets) {
        if (!a.base64) continue;
        const shrunk = await downscaleReceiptImage(
          {
            uri: a.uri,
            base64: a.base64,
            mimeType: a.mimeType ?? "image/jpeg",
          },
          aiConfig.config.maxImageBytes,
        );
        incoming.push({
          id: newId(),
          uri: shrunk.uri,
          base64: shrunk.base64,
          mimeType: shrunk.mimeType,
        });
      }
      if (incoming.length === 0) {
        setErr(t("aiReceipt.noBase64"));
        return;
      }
      setAttachments((prev) => [...prev, ...incoming]);
      setParsed(null);
      setLines([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("aiReceipt.parseFailed"));
    }
  }, [ensureAiAccess, hasKey, t, aiConfig]);

  const pickFromCamera = useCallback(async () => {
    if (!ensureAiAccess()) return;
    if (!hasKey) {
      setErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    if (!aiConfig.isActionEnabled("parse-receipt")) {
      setErr(t("aiReceipt.temporarilyUnavailable"));
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
      const shrunk = await downscaleReceiptImage(
        {
          uri: a.uri,
          base64: a.base64,
          mimeType: a.mimeType ?? "image/jpeg",
        },
        aiConfig.config.maxImageBytes,
      );
      setAttachments((prev) => [
        ...prev,
        {
          id: newId(),
          uri: shrunk.uri,
          base64: shrunk.base64,
          mimeType: shrunk.mimeType,
        },
      ]);
      setParsed(null);
      setLines([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("aiReceipt.parseFailed"));
    }
  }, [ensureAiAccess, hasKey, t, aiConfig]);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const startVoiceRecord = useCallback(async () => {
    if (!authUser?.email) {
      navigation.navigate("Auth");
      return;
    }
    // Same reasoning as runParse: gate again here, through the branch-aware
    // helper, so a balance that emptied since the caller's check opens the
    // credits panel rather than bouncing the user to Plans.
    if (!ensureAiAccess()) return;
    if (!hasKey) {
      setVoiceErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    if (!aiConfig.isActionEnabled("transcribe")) {
      setVoiceErr(t("aiReceipt.temporarilyUnavailable"));
      return;
    }
    if (!isAudioRecordingAvailable) {
      setVoiceErr(t("aiReceipt.voiceNativeUnavailable"));
      return;
    }
    if (!groupId || members.length === 0) return;
    setVoiceErr(null);
    setDescribeErr(null);
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
    ensureAiAccess,
    recorder,
    t,
    authUser?.email,
    navigation,
    aiConfig,
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
      // Populate the text field and stop. The user reviews/edits the
      // transcript, optionally attaches a photo, then explicitly taps Analyze.
      setDescribeText(transcript);
    } catch (e) {
      if (e instanceof AiProxyInsufficientCreditsError) {
        // The server is authoritative; resync and let the user top up.
        void credits.refresh();
        setCreditsPanelVisible(true);
        return;
      }
      if (e instanceof AiProxyDisabledError) {
        // Client config was stale — resync so the UI self-heals.
        aiConfig.refresh();
        setVoiceErr(t("aiReceipt.temporarilyUnavailable"));
        return;
      }
      setVoiceErr(toUserFacingAiError(e, "ai:transcribe"));
    } finally {
      setVoicePhase("idle");
    }
  }, [credits, recorder, t, toUserFacingAiError, voicePhase, aiConfig]);

  // Stop at the remotely configured ceiling. Cutting the recording here is
  // kinder than letting it run and rejecting the upload afterwards. Routed
  // through `stopVoiceRecord` so audio-mode reset and transcription share the
  // one teardown path rather than duplicating it here.
  useEffect(() => {
    const seconds = (recorderState.durationMillis ?? 0) / 1000;
    if (!recorderState.isRecording) return;
    if (seconds < aiConfig.config.maxAudioSeconds) return;
    void stopVoiceRecord();
  }, [
    recorderState.isRecording,
    recorderState.durationMillis,
    aiConfig.config.maxAudioSeconds,
    stopVoiceRecord,
  ]);

  /**
   * Honor the `autoRecord` route param from the mic half of the home FAB:
   * once the group + members are ready, kick off recording immediately and
   * clear the flag so a tab switch doesn't retrigger it.
   */
  useEffect(() => {
    if (!route.params?.autoRecord) return;
    if (!groupId || members.length === 0) return;
    // Past this point the group is ready, so this is the one chance to honor
    // the request — clear the param unconditionally from here so a later,
    // unrelated dependency change (aiAccess flipping once a credit top-up
    // lands, voicePhase settling, etc.) can never resurrect a stale
    // `autoRecord` and trigger an unrequested recording on a future re-run
    // of this effect.
    navigation.setParams({ autoRecord: undefined });
    if (!hasKey) return;
    if (aiAccess !== "allowed") return;
    if (voicePhase !== "idle") return;
    void startVoiceRecord();
  }, [
    route.params?.autoRecord,
    groupId,
    members.length,
    hasKey,
    aiAccess,
    voicePhase,
    navigation,
    startVoiceRecord,
  ]);

  const runDescribe = useCallback(async () => {
    if (!ensureAiAccess()) return;
    const prompt = describeText.trim();
    // A single photo always goes through the per-line receipt scan, with
    // the typed/dictated description forwarded so `parseReceiptImageBase64`
    // can attribute lines to people (an empty description leaves a
    // photo-only parse unchanged). Only when there's no single photo to
    // scan (zero or several attachments) do we fall back to the
    // text-driven multi-expense parse below, which requires a prompt.
    if (attachments.length === 1) {
      void runParse(attachments[0]!.base64, attachments[0]!.mimeType, prompt || undefined);
      return;
    }
    if (!prompt) {
      setDescribeErr(t("aiReceipt.describeEmpty"));
      return;
    }
    if (!groupId || members.length === 0) return;
    if (!hasKey) {
      setDescribeErr(t("aiReceipt.unavailableBuild"));
      return;
    }
    if (!aiConfig.isActionEnabled("parse-description")) {
      setDescribeErr(t("aiReceipt.temporarilyUnavailable"));
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
        images: attachments.map((a) => ({
          base64: a.base64,
          mimeType: a.mimeType,
        })),
      });
      if (res.expenses.length === 0) {
        // Report the empty response so we can diagnose which prompts/models
        // are producing valid JSON but zero extracted expenses.
        void createAutoErrorReport(
          db,
          new Error("AI returned zero expenses"),
          {
            context: "ai:describe-empty",
            confidence: res.confidence ?? null,
            reasoning: res.reasoning ?? null,
            promptLength: prompt.length,
            imageCount: attachments.length,
          },
        ).catch(() => {});
        setDescribeErr(t("aiReceipt.describeFailed"));
      } else {
        setProposed(res.expenses);
      }
    } catch (e) {
      if (e instanceof AiProxyInsufficientCreditsError) {
        // The server is authoritative; resync and let the user top up.
        void credits.refresh();
        setCreditsPanelVisible(true);
        return;
      }
      if (e instanceof AiProxyDisabledError) {
        // Client config was stale — resync so the UI self-heals.
        aiConfig.refresh();
        setDescribeErr(t("aiReceipt.temporarilyUnavailable"));
        return;
      }
      setDescribeErr(toUserFacingAiError(e, "ai:describe"));
    } finally {
      setDescribeBusy(false);
    }
  }, [
    attachments,
    describeText,
    ensureAiAccess,
    groupId,
    groupCurrency,
    hasKey,
    members,
    runParse,
    t,
    db,
    toUserFacingAiError,
    credits,
    aiConfig,
  ]);

  const resolveMemberIdByName = useCallback(
    (name: string): string | null => matchMemberNameToId(name, members),
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

  /** Clear everything related to the current receipt flow (AI input + parse
   *  result), including the persisted draft — a draft must not outlive the
   *  work it represents, whether that work just got saved as an expense
   *  (this is called from `saveReceiptExpense`'s success path) or the user
   *  explicitly cancelled. */
  const resetReceiptFlow = useCallback(() => {
    setAttachments([]);
    setParsed(null);
    setLines([]);
    setDescribeText("");
    setDescribeErr(null);
    setProposed([]);
    setErr(null);
    if (groupId) void clearReceiptDraft(groupId);
  }, [groupId]);

  /** Toggle a line on/off. Disabled lines stay in the list (so the user can
   *  flip them back on) but are excluded from totals and the per-line save. */
  const toggleLineDisabled = useCallback((id: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              disabled: !l.disabled,
              // Drop the assignment when disabling so the row doesn't keep
              // a hidden owe attached to a person.
              sharerIds: !l.disabled ? [] : l.sharerIds,
            }
          : l,
      ),
    );
  }, []);

  /** Switch a line between "shared like an item" and "spread over items". */
  const setLineKind = useCallback((id: string, kind: "item" | "spread") => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, kind } : l)));
  }, []);

  /** Toggle a single member's membership on a line's `sharerIds`. */
  const toggleLineSharer = useCallback((id: string, memberId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const has = l.sharerIds.includes(memberId);
        return {
          ...l,
          sharerIds: has
            ? l.sharerIds.filter((x) => x !== memberId)
            : [...l.sharerIds, memberId],
        };
      }),
    );
  }, []);

  const updateLineLabel = useCallback((id: string, label: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, label } : l)),
    );
  }, []);

  const updateLineAmount = useCallback(
    (id: string, displayText: string) => {
      const minor = parseMoneyToMinor(displayText, groupCurrency);
      const exp = currencyMinorExponent(groupCurrency);
      const major = minor === null ? 0 : minor / 10 ** exp;
      setLines((prev) =>
        prev.map((l) => (l.id === id ? { ...l, amountMajor: major } : l)),
      );
    },
    [groupCurrency],
  );

  const linesTotalMinor = useMemo(() => {
    let sum = 0;
    for (const ln of lines) {
      if (ln.disabled) continue;
      sum += majorFloatToMinor(ln.amountMajor, groupCurrency);
    }
    return sum;
  }, [lines, groupCurrency]);

  /**
   * Per-member owed minor amounts for the current split mode:
   *  - "exact"   → sum of per-line assignments (user drags items onto plates).
   *  - "equal"   → lines total divided evenly across included members; the
   *                rounding remainder (in minor units) is absorbed by the
   *                first included member so the owed totals match the total.
   *  - "percent" → `percentText` per included member; blanks fall back to
   *                equal percentages so the picture is meaningful while the
   *                user is still typing. Sum is normalized to total.
   *  - "shares"  → `sharesText` per included member (blank → 1). Each member
   *                gets total · share / sumShares.
   *  - "adj"     → equal split + signed `adjText` adjustment per member; the
   *                final remainder is absorbed by the last included member.
   */
  /** Per-item split result — shared by the owed map, the row trays, the plate
   *  totals and the Save gate, so they can never disagree. */
  const perItemResult = useMemo(() => {
    const splitLines: SplitLine[] = lines
      .filter((l) => !l.disabled)
      .map((l) => ({
        id: l.id,
        amountMinor: majorFloatToMinor(l.amountMajor, groupCurrency),
        sharerIds: l.sharerIds.filter((id) => includedMemberIds.has(id)),
        kind: l.kind,
      }));
    return computeReceiptOwed(splitLines, members.map((m) => m.id));
  }, [lines, groupCurrency, includedMemberIds, members]);

  const unassignedCount = perItemResult.unassignedLineIds.length;

  /** "16.6%" — the spread total as a share of the item subtotal, for the tray hint. */
  const spreadPercentLabel = useMemo(() => {
    let items = 0;
    let spread = 0;
    for (const l of lines) {
      if (l.disabled) continue;
      const minor = majorFloatToMinor(l.amountMajor, groupCurrency);
      if (l.kind === "spread") spread += minor;
      else items += minor;
    }
    if (items <= 0 || spread === 0) return null;
    return `${((spread / items) * 100).toFixed(1)}%`;
  }, [lines, groupCurrency]);

  /** `members` plus each person's avatar, matching the convention used by
   *  the split tiles below (only the local user's photo is known here).
   *  Restricted to `includedMemberIds` so the tray can never offer — and
   *  `onToggleSharer` can never write in — an excluded member: `:2153`
   *  filters them back out of `perItemResult` regardless, and without this
   *  filter the row's (unfiltered) `sharerIds` display disagrees with the
   *  (filtered) money and unassigned-count, which can read as a stuck,
   *  self-contradicting state. */
  const trayMembers = useMemo(
    () =>
      members
        .filter((m) => includedMemberIds.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          avatarUri: m.id === myId ? myAvatarUri : null,
        })),
    [members, myId, myAvatarUri, includedMemberIds],
  );

  const owedByMemberId = useMemo(() => {
    const out = new Map<string, number>();
    if (scanSplitMode === "exact") return perItemResult.owedByMemberId;
    const included = members.filter((m) => includedMemberIds.has(m.id));
    if (included.length === 0 || linesTotalMinor <= 0) return out;

    if (scanSplitMode === "percent") {
      const eqPcts = equalIntegerPercents(included.length);
      const pcts = included.map((m, i) => {
        const raw = parsePercentInput(percentText[m.id]);
        return raw > 0 ? raw : (eqPcts[i] ?? 0);
      });
      const sumPct = pcts.reduce((a, b) => a + b, 0);
      if (sumPct <= 0) return out;
      let consumed = 0;
      for (let i = 0; i < included.length; i++) {
        const m = included[i]!;
        const isLast = i === included.length - 1;
        const share = isLast
          ? linesTotalMinor - consumed
          : Math.floor((linesTotalMinor * (pcts[i] ?? 0)) / sumPct);
        out.set(m.id, Math.max(0, share));
        consumed += share;
      }
      return out;
    }

    if (scanSplitMode === "shares") {
      const sharesArr = included.map((m) => {
        const raw = parseShareInput(sharesText[m.id]);
        return raw > 0 ? raw : 1;
      });
      const sumShares = sharesArr.reduce((a, b) => a + b, 0);
      if (sumShares <= 0) return out;
      let consumed = 0;
      for (let i = 0; i < included.length; i++) {
        const m = included[i]!;
        const isLast = i === included.length - 1;
        const share = isLast
          ? linesTotalMinor - consumed
          : Math.floor((linesTotalMinor * (sharesArr[i] ?? 0)) / sumShares);
        out.set(m.id, Math.max(0, share));
        consumed += share;
      }
      return out;
    }

    if (scanSplitMode === "adj") {
      const adjArr = included.map((m) =>
        parseSignedMoneyInputMinor(adjText[m.id], groupCurrency),
      );
      const adjSum = adjArr.reduce((a, b) => a + b, 0);
      const baseTotal = linesTotalMinor - adjSum;
      const baseShare =
        baseTotal > 0 ? Math.floor(baseTotal / included.length) : 0;
      // `remaining` is the true source of truth for what's left to hand
      // out. Each non-last share is clamped to *both* 0 and `remaining` —
      // free-text adjustments have no min/max validation at entry, so a
      // large positive adjText (e.g. "20.00" against a 1000-minor total)
      // must not be allowed to overshoot the total; without the upper
      // clamp, `remaining` would go negative and the last member's clip to
      // 0 would silently strand the excess already handed to earlier
      // members, so the map would sum to more than `linesTotalMinor`.
      // Clamping every share to `remaining` keeps `remaining` monotonically
      // non-negative and guarantees it lands on exactly 0 after the last
      // member (whose share *is* `remaining`), so the map always sums to
      // `linesTotalMinor` exactly.
      let remaining = linesTotalMinor;
      for (let i = 0; i < included.length; i++) {
        const m = included[i]!;
        const isLast = i === included.length - 1;
        const raw = isLast ? remaining : baseShare + (adjArr[i] ?? 0);
        const share = Math.max(0, Math.min(raw, remaining));
        out.set(m.id, share);
        remaining -= share;
      }
      return out;
    }

    // "equal"
    const share = Math.floor(linesTotalMinor / included.length);
    let remainder = linesTotalMinor - share * included.length;
    for (const m of included) {
      const take = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      out.set(m.id, take);
    }
    return out;
  }, [
    adjText,
    groupCurrency,
    includedMemberIds,
    linesTotalMinor,
    members,
    percentText,
    perItemResult,
    scanSplitMode,
    sharesText,
  ]);

  // "Assigned" total — in Exact mode it's the sum of per-line assignments, in
  // other modes it equals linesTotalMinor (every dollar lands somewhere).
  const aggregateMinor = useMemo(() => {
    if (scanSplitMode === "exact") {
      let sum = 0;
      for (const [, v] of owedByMemberId) sum += v;
      return sum;
    }
    return linesTotalMinor;
  }, [linesTotalMinor, owedByMemberId, scanSplitMode]);

  /**
   * Save the whole receipt as a single expense — one global payer, amount
   * equal to the enabled-line total, split via the mode-appropriate
   * `owedByMemberId` map (in per-item mode this IS `perItemResult`'s map).
   * Applies to all five split modes: once VAT is spread proportionally
   * across items, no single receipt line's amount matches the printed
   * receipt any more, so per-line expenses stopped making sense — the
   * screen now always writes one expense per receipt.
   * After the write the receipt flow is cleared and the user lands on the
   * group detail screen so they can see the new entry.
   */
  const saveReceiptExpense = useCallback(async () => {
    if (!groupId || lines.length === 0 || busy || addingAll) return;
    const enabled = lines.filter((l) => !l.disabled);
    if (enabled.length === 0) return;
    if (scanSplitMode === "exact" && perItemResult.unassignedLineIds.length > 0) return;

    const owed = owedByMemberId;
    if (owed.size === 0) return;

    const amountMinor = linesTotalMinor;
    if (amountMinor <= 0) return;

    // Defense in depth: the owed map must reconcile to the exact amount
    // being charged, and every entry must be non-negative — the repo layer
    // (`addExpenseWithSplits`) rejects a negative owed amount outright.
    // Both are normally guaranteed by construction, but two cases fall
    // through: `computeReceiptOwed` can silently drop a spread line's money
    // when its proportional weight-sum is zero (all item lines total 0
    // minor units while still carrying sharers), leaving the map's sum
    // short of `amountMinor`; and a negative-amount item line (a
    // coupon/discount — the compatibility fallback for a receipt line with
    // no `kind` at all, per the design spec) assigned to someone with no
    // offsetting positive items on this receipt produces a negative
    // per-member total even though the map's sum still reconciles. There's
    // no principled way to redistribute either case without guessing at
    // intent, so refuse to save rather than write (or attempt and fail to
    // write) a split that doesn't add up.
    let owedSum = 0;
    let hasNegativeOwed = false;
    for (const v of owed.values()) {
      owedSum += v;
      if (v < 0) hasNegativeOwed = true;
    }
    if (hasNegativeOwed) {
      // Surface through this screen's existing error mechanism rather than
      // letting the repo call below throw it as an unhandled rejection.
      setErr(t("aiReceipt.proposedAddFailed"));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (owedSum !== amountMinor) {
      // Degenerate zero-weight-sum case — not user-actionable (there is
      // nothing to reassign), so this keeps the console.warn for
      // diagnostics. It still needs a visible error, though: the sibling
      // guard above surfaces via setErr, and leaving this one silent means
      // Save just does nothing with no explanation. Reuse the same string
      // as the sibling guard rather than inventing new copy.
      console.warn(
        "[AiReceiptScreen] saveReceiptExpense: owed map does not reconcile to amountMinor",
        { owedSum, amountMinor, scanSplitMode },
      );
      setErr(t("aiReceipt.proposedAddFailed"));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const resolvedPayer = members.some((m) => m.id === payerId)
      ? payerId
      : (members[0]?.id ?? myId);

    const title = (
      parsed?.merchant?.trim() || t("aiReceipt.fallbackTotalLabel")
    ).slice(0, 500);

    const savedGid = groupId;
    setAddingAll(true);
    try {
      const newExpenseId = await addExpenseWithSplits(db, savedGid, {
        description: title,
        amountMinor,
        payerId: resolvedPayer,
        expenseDate: new Date().toISOString(),
        owedByUserId: owed,
        category: guessCategoryFromTitle(title),
      });
      void classifyExpenseCategory(title)
        .then((cat) => updateExpenseCategory(db, savedGid, newExpenseId, cat))
        .catch(() => {});
      resetReceiptFlow();
      navigation.navigate("Groups", {
        screen: "GroupDetail",
        params: { groupId: savedGid },
      });
    } catch (e) {
      // Without this, a rejection here (e.g. the repo layer's own
      // non-negative-integer guard) was an unhandled rejection: the
      // spinner cleared via `finally` below and nothing else happened —
      // matching the `setErr` fallback pattern used for `addAllProposed`'s
      // save failure just above.
      setErr(e instanceof Error ? e.message : t("aiReceipt.proposedAddFailed"));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setAddingAll(false);
    }
  }, [
    addingAll,
    busy,
    db,
    groupId,
    lines,
    linesTotalMinor,
    members,
    myId,
    navigation,
    owedByMemberId,
    parsed,
    payerId,
    perItemResult,
    resetReceiptFlow,
    scanSplitMode,
    t,
  ]);

  // Default: every member is "included" once we've got both members loaded
  // and a parsed receipt. Users can tap a tile to toggle exclusion.
  useEffect(() => {
    if (lines.length === 0) return;
    if (members.length === 0) return;
    setIncludedMemberIds((prev) =>
      prev.size > 0 ? prev : new Set(members.map((m) => m.id)),
    );
  }, [lines.length, members]);

  const togglePersonIncluded = useCallback(
    (memberId: string) => {
      setIncludedMemberIds((prev) => {
        const next = new Set(prev);
        if (next.has(memberId)) {
          next.delete(memberId);
          // Unassign any lines that were on this person, since excluding
          // them means no dollars owed.
          setLines((ls) =>
            ls.map((l) =>
              l.sharerIds.includes(memberId)
                ? { ...l, sharerIds: l.sharerIds.filter((id) => id !== memberId) }
                : l,
            ),
          );
        } else {
          next.add(memberId);
        }
        return next;
      });
    },
    [],
  );

  // Running totals — the raw sum of every parsed line (used for "Split total"
  // and as the base amount for non-Exact split modes).
  const modelTotalMinor = useMemo(() => {
    if (!parsed?.total || !Number.isFinite(parsed.total)) return null;
    return majorFloatToMinor(parsed.total, groupCurrency);
  }, [parsed, groupCurrency]);

  const mismatch =
    modelTotalMinor !== null && modelTotalMinor !== aggregateMinor
      ? formatMinor(Math.abs(modelTotalMinor - aggregateMinor), groupCurrency, locale)
      : null;

  // The lines card (and its Save/Cancel buttons) is gated on this alone —
  // NOT on `parsed` being non-null. `parsed` only ever comes from a fresh
  // `runParse`, never from `loadReceiptDraft`'s restore path, so gating on
  // it made a restored draft (lines populated, `parsed` still null)
  // permanently invisible: no lines, no Save, no Cancel, nothing but the
  // capture card — while the debounced save effect kept silently
  // rewriting the very draft the user could never see or discard. `lines`
  // itself is already set by both `runParse` and restore, so it's the
  // one condition that's true exactly when there's something to show —
  // no second, separately-maintained flag needed. The few spots that read
  // `parsed` for display (merchant title, receipt-currency note, model
  // total reconciliation) already tolerate — or, for the currency note
  // just above, now explicitly guard against — a null `parsed` after a
  // restore.
  const hasLines = lines.length > 0;

  const scrollBottom = 28 + insets.bottom;

  // No upfront gate-card on the screen anymore. Free / signed-out users
  // see the same form as premium users; the paywall is deferred — the
  // AI invocation paths (`runParse` / `runDescribe` / `startVoiceRecord`)
  // navigate to Auth or Plans at the moment of value (point of action).

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.headerAnchor,
          { paddingTop: Math.max(8, insets.top) },
        ]}
      >
        <View style={styles.aiHeroRow}>
          <View style={styles.aiHeroIcon}>
            <Ionicons
              name="sparkles"
              size={22}
              color={colors.primary}
            />
          </View>
          <View style={styles.aiHeroTextCol}>
            <Text style={styles.aiHeroTitle} numberOfLines={1}>
              {t("aiReceipt.heroTitle")}
            </Text>
            <Text style={styles.aiHeroSubtitle} numberOfLines={1}>
              {t("aiReceipt.heroSubtitle")}
            </Text>
          </View>
          {!credits.isUnlimited ? (
            <Text style={styles.creditsChip}>
              {t("aiCredits.chip").replace("{{count}}", String(credits.balance))}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.pad,
          { paddingBottom: scrollBottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          ref={aiTour.ref}
          onLayout={aiTour.onLayout}
          collapsable={false}
        >
        {groups.length === 0 ? (
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
          <Pressable
            style={({ pressed }) => [
              styles.addingToPill,
              pressed && groups.length > 1 ? { opacity: 0.7 } : null,
            ]}
            onPress={() =>
              groups.length > 1 ? setGroupModalOpen(true) : undefined
            }
            disabled={groups.length <= 1}
            accessibilityRole={groups.length > 1 ? "button" : "text"}
            accessibilityLabel={t("aiReceipt.changeGroup")}
          >
            <Ionicons
              name={(() => {
                const gt = selected?.group_type;
                if (gt === "home") return "home";
                if (gt === "trip") return "airplane";
                if (gt === "couple") return "heart";
                return "people";
              })()}
              size={14}
              color={colors.primary}
            />
            <Text style={styles.addingToPillText} numberOfLines={1}>
              {selected
                ? t("aiReceipt.addingToPill", { name: selected.name })
                : t("aiReceipt.addExpenseTo")}
            </Text>
            {groups.length > 1 ? (
              <Ionicons
                name="chevron-down"
                size={14}
                color={colors.primary}
              />
            ) : null}
          </Pressable>
        )}

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

        {hasLines ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("aiReceipt.linesHeading")}</Text>
            {parsed && parsed.currency && parsed.currency !== groupCurrency ? (
              <Text style={[styles.muted, { marginBottom: 8 }]}>
                {t("aiReceipt.receiptCurrency", { code: parsed.currency })}
              </Text>
            ) : null}
            {(() => {
              const rendered = lines;
              return rendered.map((ln, idx) => {
                const isExpandable = scanSplitMode === "exact" && !ln.disabled;
                const isDisabled = !!ln.disabled;
                const amountDisplay = ln.amountMajor > 0
                  ? minorToAmountInputString(
                      majorFloatToMinor(ln.amountMajor, groupCurrency),
                      groupCurrency,
                    )
                  : "";
                const rowInner = (
                  <>
                    <TextInput
                      style={[
                        styles.lineLabel,
                        styles.lineLabelInput,
                        isDisabled && styles.lineDisabledText,
                      ]}
                      value={ln.label}
                      onChangeText={(v) => updateLineLabel(ln.id, v)}
                      editable={!isDisabled}
                      placeholder={t("aiReceipt.lineLabelPlaceholder")}
                      placeholderTextColor={colors.muted}
                      numberOfLines={1}
                    />
                    <TextInput
                      style={[
                        styles.lineAmt,
                        styles.lineAmtInput,
                        isDisabled && styles.lineDisabledText,
                      ]}
                      value={amountDisplay}
                      onChangeText={(v) =>
                        updateLineAmount(
                          ln.id,
                          formatUnsignedMoneyInputDisplay(v, groupCurrency),
                        )
                      }
                      editable={!isDisabled}
                      keyboardType="decimal-pad"
                      placeholder={minorToAmountInputString(0, groupCurrency)}
                      placeholderTextColor={colors.muted}
                    />
                  </>
                );
                const toggleBtn = (
                  <Pressable
                    onPress={() => toggleLineDisabled(ln.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isDisabled
                        ? t("aiReceipt.enableLine")
                        : t("aiReceipt.disableLine")
                    }
                    style={styles.removeLineBtn}
                  >
                    <Ionicons
                      name={isDisabled ? "add-circle" : "close-circle"}
                      size={20}
                      color={isDisabled ? colors.primary : colors.muted}
                    />
                  </Pressable>
                );
                // Whole-row tap target: tapping anywhere on the row (outside
                // the label/amount inputs and the disable/remove button)
                // opens or closes this line's sharer tray below it. Opening
                // one line's tray closes any other that was open.
                // The remove button sits OUTSIDE this Pressable, as a
                // sibling, so tapping it toggles the line's disabled state
                // instead of the tray.
                const expanded = expandedLineId === ln.id;
                const rowA11yLabel =
                  ln.kind === "spread"
                    ? t("aiReceipt.spreadOverItems")
                    : t("aiReceipt.expandLineA11y", { label: ln.label });
                return (
                  <View key={ln.id}>
                    {isExpandable ? (
                      <View
                        style={[
                          styles.rowOuter,
                          idx === rendered.length - 1 && styles.rowLast,
                        ]}
                      >
                        <Pressable
                          onPress={() =>
                            setExpandedLineId((cur) => (cur === ln.id ? null : ln.id))
                          }
                          style={({ pressed }) => [
                            styles.row,
                            styles.rowExpandable,
                            styles.rowFlex,
                            pressed && { opacity: 0.85 },
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ expanded }}
                          accessibilityLabel={rowA11yLabel}
                        >
                          {rowInner}
                          {/* A guaranteed, input-free >=44pt tap target.
                              The label/amount `TextInput`s above claim the
                              touch responder on their own bounds (RN gives
                              text inputs first refusal), so a tap that lands
                              on the visible text opens the keyboard instead
                              of this row's own `onPress` — this chevron is a
                              plain, non-interactive `View` (no Pressable of
                              its own; `pointerEvents="none"` makes that
                              explicit) that reserves real, un-shrinkable
                              layout space next to the inputs so there is
                              always somewhere on the row a tap reliably
                              reaches this Pressable instead of an input. */}
                          <View style={styles.expandChevron} pointerEvents="none">
                            <Ionicons
                              name={expanded ? "chevron-up" : "chevron-down"}
                              size={16}
                              color={expanded ? colors.primary : colors.muted}
                            />
                          </View>
                        </Pressable>
                        {toggleBtn}
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.row,
                          idx === rendered.length - 1 && styles.rowLast,
                          isDisabled && styles.rowDisabled,
                        ]}
                      >
                        {rowInner}
                        {toggleBtn}
                      </View>
                    )}
                    {scanSplitMode === "exact" ? (
                      <ReceiptLineRow
                        kind={ln.kind}
                        sharerIds={ln.sharerIds}
                        slices={perItemResult.perLineByMember.get(ln.id) ?? new Map()}
                        members={trayMembers}
                        expanded={expanded}
                        disabled={isDisabled}
                        formatAmount={(m) => formatMinor(m, groupCurrency, locale)}
                        spreadPercentLabel={spreadPercentLabel}
                        onToggleSharer={(mid) => toggleLineSharer(ln.id, mid)}
                        onChangeKind={(k) => setLineKind(ln.id, k)}
                        t={t}
                        styles={styles}
                      />
                    ) : null}
                  </View>
                );
              });
            })()}

            {/* ───── Who paid & split ───── */}
            <Text style={[styles.cardTitle, { marginTop: 14 }]}>
              {t("aiReceipt.whoPaidAndSplit")}
            </Text>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.splitToolbarScroll}
              contentContainerStyle={styles.splitToolbarInner}
            >
              {([
                { id: "equal", icon: "people-outline", label: t("aiReceipt.modeEqual") },
                { id: "exact", icon: "calculator-outline", label: t("aiReceipt.modePerItem") },
                { id: "percent", icon: "pie-chart-outline", label: t("aiReceipt.modePercent") },
                { id: "shares", icon: "layers-outline", label: t("aiReceipt.modeShares") },
                { id: "adj", icon: "options-outline", label: t("aiReceipt.modeAdj") },
              ] as const).map((tab) => {
                const on = scanSplitMode === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    style={[styles.splitTab, on && styles.splitTabOn]}
                    onPress={() => setScanSplitMode(tab.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={20}
                      color={on ? colors.primary : colors.muted}
                    />
                    <Text
                      style={[styles.splitTabLabel, on && styles.splitTabLabelOn]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.splitModeHeading}>
              {t(`aiReceipt.splitMode_${scanSplitMode}`)}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.tileRow}
            >
              {members.map((m) => {
                const isPayer = m.id === payerId;
                const isIncluded = includedMemberIds.has(m.id);
                const memberOwed = owedByMemberId.get(m.id) ?? 0;
                return (
                  <View key={m.id} style={styles.personTileWrap}>
                    <View
                      style={[
                        styles.personTile,
                        styles.personTilePressFill,
                        isPayer && styles.personTilePayer,
                        !isPayer && !isIncluded && styles.personTileExcluded,
                      ]}
                    >
                      <Pressable
                        style={styles.avatarTap}
                        onPress={() => setPayerId(m.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isPayer }}
                        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                      >
                        <PersonAvatar
                          name={m.name}
                          avatarUri={m.id === myId ? myAvatarUri : null}
                          size={44}
                          containerStyle={[
                            styles.personTileAvatar,
                            isPayer && styles.personTileAvatarPayerRing,
                          ]}
                          letterStyle={styles.personTileAvatarLetter}
                        />
                        <View style={styles.paidBadgeSlot}>
                          {isPayer ? (
                            <View style={styles.paidBadge}>
                              <Ionicons
                                name="wallet-outline"
                                size={15}
                                color="#fff"
                              />
                              <Text style={styles.paidBadgeLabel}>
                                {t("aiReceipt.payerBadge")}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                      <Pressable
                        style={styles.tileBodyTap}
                        onPress={() => togglePersonIncluded(m.id)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: isIncluded }}
                      >
                        <Text
                          style={[
                            styles.personTileName,
                            isPayer && styles.personTileNameOn,
                          ]}
                          numberOfLines={1}
                        >
                          {m.name}
                        </Text>
                        <View
                          style={[
                            styles.includedToggle,
                            isIncluded
                              ? styles.includedToggleOn
                              : styles.includedToggleOff,
                          ]}
                        >
                          <View style={styles.includedIconSlot}>
                            <Ionicons
                              name={
                                isIncluded
                                  ? "checkmark-circle"
                                  : "ellipse-outline"
                              }
                              size={20}
                              color={
                                isIncluded ? colors.primary : colors.muted
                              }
                            />
                          </View>
                          <Text
                            style={[
                              styles.includedToggleLabel,
                              isIncluded
                                ? styles.includedToggleLabelOn
                                : styles.includedToggleLabelOff,
                            ]}
                            numberOfLines={1}
                          >
                            {isIncluded
                              ? t("aiReceipt.includedLabel")
                              : t("aiReceipt.excludedLabel")}
                          </Text>
                        </View>
                      </Pressable>
                      <View style={styles.personTileUnderArea}>
                        {memberOwed > 0 ? (
                          <Text
                            style={[
                              styles.personTileAmount,
                              isPayer && styles.personTileAmountPayer,
                            ]}
                            numberOfLines={1}
                          >
                            {formatMinor(memberOwed, groupCurrency, locale)}
                          </Text>
                        ) : (
                          <Text style={styles.personTileAmountMuted}>—</Text>
                        )}
                        {scanSplitMode === "percent" && isIncluded ? (
                          <View style={styles.tilePercentRow}>
                            <TextInput
                              style={[
                                styles.personTileInputFlex,
                                isPayer && styles.personTileInputPayer,
                              ]}
                              value={percentText[m.id] ?? ""}
                              onChangeText={(text) =>
                                setPercentText((prev) => ({
                                  ...prev,
                                  [m.id]: text,
                                }))
                              }
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={colors.muted}
                              editable
                            />
                            <Text style={styles.pctSuffix}>%</Text>
                          </View>
                        ) : null}
                        {scanSplitMode === "shares" && isIncluded ? (
                          <TextInput
                            style={[
                              styles.personTileInput,
                              isPayer && styles.personTileInputPayer,
                            ]}
                            value={sharesText[m.id] ?? ""}
                            onChangeText={(text) =>
                              setSharesText((prev) => ({
                                ...prev,
                                [m.id]: text,
                              }))
                            }
                            keyboardType="number-pad"
                            placeholder="1"
                            placeholderTextColor={colors.muted}
                            editable
                          />
                        ) : null}
                        {scanSplitMode === "adj" && isIncluded ? (
                          <TextInput
                            style={[
                              styles.personTileAdjInput,
                              isPayer && styles.personTileInputPayer,
                            ]}
                            value={adjText[m.id] ?? ""}
                            onChangeText={(text) =>
                              setAdjText((prev) => ({
                                ...prev,
                                [m.id]: text,
                              }))
                            }
                            keyboardType="numbers-and-punctuation"
                            placeholder="0"
                            placeholderTextColor={colors.muted}
                            editable
                          />
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <Text style={[styles.muted, { marginTop: 10 }]}>
              {t("aiReceipt.assignedTotal", {
                amount: formatMinor(aggregateMinor, groupCurrency, locale),
              })}
            </Text>
            {scanSplitMode === "exact" && unassignedCount > 0 ? (
              <Text style={styles.warn}>
                {t("aiReceipt.itemsNeedPeople", { count: String(unassignedCount) })}
              </Text>
            ) : mismatch ? (
              <Text style={styles.warn}>
                {t("aiReceipt.sumMismatch", { diff: mismatch })}
              </Text>
            ) : null}
            <View style={styles.saveRow}>
              <View style={{ flex: 1 }}>
                <AppButton
                  variant="secondary"
                  fullWidth
                  label={t("aiReceipt.cancel")}
                  onPress={resetReceiptFlow}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  variant="primary"
                  fullWidth
                  label={t("aiReceipt.save")}
                  onPress={() => void saveReceiptExpense()}
                  disabled={
                    aggregateMinor <= 0 ||
                    !members.length ||
                    (scanSplitMode === "exact"
                      ? unassignedCount > 0
                      : owedByMemberId.size === 0)
                  }
                />
              </View>
            </View>
          </View>
        ) : parsed && lines.length === 0 && !busy ? (
          <Text style={styles.warn}>{t("aiReceipt.noLines")}</Text>
        ) : null}

        {groupId && groups.length > 0 && !hasLines ? (
          <View>
            {(() => {
              const inputBusy =
                !hasKey ||
                busy ||
                addingAll ||
                describeBusy ||
                voicePhase !== "idle";
              const tilePhotoOnPress = () => {
                if (Platform.OS === "web") {
                  void pickFromLibrary();
                } else {
                  void pickFromCamera();
                }
              };
              const tiles: {
                key: "photo" | "gallery";
                icon: keyof typeof Ionicons.glyphMap;
                label: string;
                sub: string;
                onPress: () => void;
                disabled: boolean;
                primary: boolean;
              }[] = [
                {
                  key: "photo",
                  icon: "camera-outline",
                  label: t("aiReceipt.tilePhoto"),
                  sub: t("aiReceipt.tilePhotoSub"),
                  onPress: tilePhotoOnPress,
                  disabled: inputBusy,
                  primary: true,
                },
                {
                  key: "gallery",
                  icon: "images-outline",
                  label: t("aiReceipt.tileGallery"),
                  sub: t("aiReceipt.tileGallerySub"),
                  onPress: () => void pickFromLibrary(),
                  disabled: inputBusy,
                  primary: false,
                },
              ];
              return (
                <View style={styles.tilesGrid}>
                  {tiles.map((tile) => (
                    <Pressable
                      key={tile.key}
                      onPress={tile.onPress}
                      disabled={tile.disabled}
                      style={({ pressed }) => [
                        tile.primary ? styles.tileBoxPrimary : styles.tileBox,
                        tile.disabled && styles.tileBoxDisabled,
                        pressed && { opacity: 0.88 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={tile.label}
                    >
                      <View
                        style={
                          tile.primary
                            ? styles.tileIconWrapInverse
                            : styles.tileIconWrap
                        }
                      >
                        <Ionicons
                          name={tile.icon}
                          size={22}
                          color={tile.primary ? "#FFFFFF" : colors.primary}
                        />
                      </View>
                      <Text
                        style={
                          tile.primary
                            ? styles.tileLabelInverse
                            : styles.tileLabel
                        }
                      >
                        {tile.label}
                      </Text>
                      <Text
                        style={
                          tile.primary ? styles.tileSubInverse : styles.tileSub
                        }
                      >
                        {tile.sub}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })()}

            {attachments.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbRow}
              >
                {attachments.map((att, idx) => (
                  <View key={att.id} style={styles.thumbTile}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.thumbTap,
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => setPreviewIndex(idx)}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={t("aiReceipt.previewPhoto")}
                    >
                      <Image
                        source={{ uri: att.uri }}
                        style={styles.thumbImg}
                        resizeMode="cover"
                      />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.thumbClose,
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() =>
                        setAttachments((prev) =>
                          prev.filter((x) => x.id !== att.id),
                        )
                      }
                      disabled={busy}
                      hitSlop={8}
                      accessibilityLabel={t("aiReceipt.removePhoto")}
                    >
                      <Ionicons name="close" size={14} color={colors.text} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <Text style={styles.sectionLabel}>
              {t("aiReceipt.orJustTypeIt")}
            </Text>
            <View style={styles.describeBox}>
              <TextInput
                ref={describeInputRef}
                style={styles.describeBoxInput}
                value={describeText}
                onChangeText={setDescribeText}
                placeholder={t("aiReceipt.describePlaceholder")}
                placeholderTextColor={colors.muted}
                multiline
                editable={
                  !aiGated &&
                  !describeBusy &&
                  !addingAll &&
                  voicePhase !== "recording" &&
                  voicePhase !== "processing"
                }
                onFocus={() => {
                  if (!ensureAiAccess()) {
                    describeInputRef.current?.blur();
                    return;
                  }
                  setTimeout(() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }, 120);
                }}
              />
              <View style={styles.describeFootRow}>
                <Text style={styles.describeHelper} numberOfLines={2}>
                  {t("aiReceipt.tallyFiguresOut")}
                </Text>
                <Pressable
                  onPress={() => void runDescribe()}
                  disabled={
                    describeBusy ||
                    busy ||
                    addingAll ||
                    !hasKey ||
                    members.length === 0 ||
                    voicePhase !== "idle"
                  }
                  style={({ pressed }) => [
                    styles.analyzeChip,
                    (describeBusy ||
                      busy ||
                      addingAll ||
                      !hasKey ||
                      members.length === 0 ||
                      voicePhase !== "idle") &&
                      styles.analyzeChipDisabled,
                    pressed && { opacity: 0.88 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t("aiReceipt.describeAnalyze")}
                >
                  {describeBusy || busy ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Ionicons
                      name="sparkles"
                      size={14}
                      color="#FFFFFF"
                    />
                  )}
                  <Text style={styles.analyzeChipText}>
                    {t("aiReceipt.analyzeShort")}
                  </Text>
                </Pressable>
              </View>
              {aiGated ? (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    ensureAiAccess();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("aiReceipt.describePlaceholder")}
                />
              ) : null}
            </View>

            {voicePhase === "recording" ? (
              <Pressable
                onPress={() => void stopVoiceRecord()}
                style={({ pressed }) => [
                  styles.voiceStatusRow,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t("aiReceipt.voiceStopHint")}
              >
                <Ionicons name="stop-circle" size={18} color={colors.owe} />
                <Text style={styles.voiceStatus}>
                  {t("aiReceipt.voiceRecording")}
                  {" · "}
                  {Math.max(
                    0,
                    Math.floor((recorderState.durationMillis ?? 0) / 1000),
                  )}
                  s
                </Text>
              </Pressable>
            ) : voicePhase === "processing" ? (
              <View style={styles.voiceStatusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.voiceStatus}>
                  {t("aiReceipt.voiceProcessingBody")}
                </Text>
              </View>
            ) : null}

            {voiceMicDenied ? (
              <AppButton
                variant="secondary"
                fullWidth
                label={t("aiReceipt.voiceMicDeniedOpenSettings")}
                onPress={openSystemSettings}
                style={{ marginTop: 8 }}
              />
            ) : null}
            {!hasKey ? (
              <Text style={styles.warn}>{t("aiReceipt.unavailableBuild")}</Text>
            ) : null}
            {describeErr ? (
              <Text style={styles.warn}>{describeErr}</Text>
            ) : null}
            {voiceErr ? <Text style={styles.warn}>{voiceErr}</Text> : null}
          </View>
        ) : null}

        {proposed.length > 0 ? (
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
                      locale,
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
        </View>
      </ScrollView>

      {/* No floating upsell card. Free / signed-out users see the form */}
      {/* exactly like signed-in premium users; the paywall is deferred  */}
      {/* to the actual AI invocation (`runParse` / `runDescribe` /     */}
      {/* `startVoiceRecord`), which routes to Auth or Plans on demand. */}

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
        visible={previewIndex !== null && attachments[previewIndex] != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewIndex(null)}
      >
        <Pressable
          style={styles.imagePreviewBackdrop}
          onPress={() => setPreviewIndex(null)}
        >
          {previewIndex !== null && attachments[previewIndex] ? (
            <Image
              source={{ uri: attachments[previewIndex]!.uri }}
              style={styles.imagePreviewFull}
              resizeMode="contain"
            />
          ) : null}
          <View
            style={[styles.imagePreviewClose, { top: 16 + insets.top }]}
            pointerEvents="box-none"
          >
            <Pressable
              style={({ pressed }) => [
                styles.imagePreviewCloseBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setPreviewIndex(null)}
              hitSlop={12}
              accessibilityLabel={t("aiReceipt.closePreview")}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <AiCreditsPanel
        visible={creditsPanelVisible}
        onClose={() => setCreditsPanelVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}
