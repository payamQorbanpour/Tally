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
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { classifyExpenseCategory } from "../core/classifyExpenseCategory";
import { downscaleReceiptImage } from "../core/downscaleReceiptImage";
import { guessCategoryFromTitle } from "../core/guessCategoryFromTitle";
import { parseReceiptImageBase64 } from "../core/parseReceiptImage";
import { parseExpenseDescription } from "../core/parseExpenseDescription";
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
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { getLocalUserId, newId } from "../db/ids";
import { CloudSyncGateOverlay } from "../components/CloudSyncGateOverlay";
import { PersonAvatar } from "../components/PersonAvatar";
import { useLocalUserAvatar } from "../hooks/useLocalUserAvatar";
import { useTourTarget } from "../hooks/useTourTarget";
import { useLocale } from "../i18n/LocaleContext";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
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
  /** null until the user drags the line onto a person's plate. */
  assigneeId: string | null;
  /** When true the user has switched the line off — kept for re-enable, but
   *  excluded from totals, splits, and the per-line save. */
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

function buildStyles(colors: ThemeColors, isRTL: boolean) {
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
      color: colors.primary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 6,
      marginBottom: 10,
      ...te,
    },
    tilesGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 18,
    },
    tileBox: {
      flexBasis: "48%",
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 18,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    tileBoxDisabled: { opacity: 0.5 },
    tileIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.owedSoft,
    },
    tileLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    tileSub: {
      fontSize: 11,
      color: colors.muted,
      textAlign: "center",
    },
    describeBox: {
      backgroundColor: colors.owedSoft,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 18,
      minHeight: 110,
    },
    describeBoxInput: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
      padding: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
      textAlignVertical: "top",
      minHeight: 86,
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
    /** Wrapper that sits the draggable press-zone next to the remove button so
     *  tapping X doesn't fire the drag-start on the parent. */
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
    /** Subtle affordance on draggable rows — thin left border + soft
     *  fill tells the user the whole row is grabbable in Exact mode. */
    rowDraggable: {
      backgroundColor: colors.owedSoft,
      borderRadius: 8,
      paddingHorizontal: 8,
      marginVertical: 2,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
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
    modalRow: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
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
    personTileHover: {
      backgroundColor: colors.owedSoft,
      borderColor: colors.primary,
      transform: [{ scale: 1.03 }],
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
    rowBeingDragged: { opacity: 0.4 },
    dragGhost: {
      position: "absolute",
      left: 0,
      top: 0,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
        },
        android: { elevation: 8 },
        default: {},
      }),
    },
    dragGhostLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
    dragGhostAmt: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
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
    assignedItemsList: {
      marginTop: 6,
      gap: 4,
      width: "100%",
    },
    assignedItemPill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      width: "100%",
    },
    assignedItemText: {
      flex: 1,
      minWidth: 0,
      fontSize: 11,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
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

function payloadToEditableLines(
  parsed: ParsedReceiptPayload,
  fallbackTotalLabel: string,
): EditableLine[] {
  const out: EditableLine[] = [];
  if (parsed.lines.length > 0) {
    for (const l of parsed.lines) {
      out.push({
        id: newId(),
        label: l.label,
        amountMajor: l.amount,
        assigneeId: null,
      });
    }
    return out;
  }
  if (parsed.total != null && Number.isFinite(parsed.total)) {
    out.push({
      id: newId(),
      label: fallbackTotalLabel,
      amountMajor: parsed.total,
      assigneeId: null,
    });
  }
  return out;
}

export function AiReceiptScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const db = useDatabase();
  const navigation = useNavigation<AiNav>();
  const route = useRoute<RouteProp<MainTabParamList, "AiReceipt">>();
  const premium = usePremium();
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
  const [pickerLineId, setPickerLineId] = useState<string | null>(null);
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
  // --- Inline drag-and-drop from line rows onto person tiles ---------------
  type ScanDrag = {
    lineId: string;
    startX: number;
    startY: number;
    width: number;
    label: string;
    amountMajor: number;
  };
  type Rect = { x: number; y: number; w: number; h: number };
  type ScanSplitMode = "equal" | "exact" | "percent" | "shares" | "adj";
  const [scanSplitMode, setScanSplitMode] = useState<ScanSplitMode>("exact");
  const [drag, setDrag] = useState<ScanDrag | null>(null);
  const [hoverPersonId, setHoverPersonId] = useState<string | null>(null);
  // Keep the latest hover target in a ref so the pan listener doesn't pay for
  // React's reconciliation on every pointer move; we only call setHoverPersonId
  // when the hit-test result actually changes.
  const hoverPersonRef = useRef<string | null>(null);
  const [includedMemberIds, setIncludedMemberIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Per-member text inputs for percent / shares / adjust modes. */
  const [percentText, setPercentText] = useState<Record<string, string>>({});
  const [sharesText, setSharesText] = useState<Record<string, string>>({});
  const [adjText, setAdjText] = useState<Record<string, string>>({});
  const dragPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const personRectsRef = useRef<Record<string, Rect>>({});
  const personRefs = useRef<Record<string, View | null>>({});
  // Snapshot of the drag state captured at drag-start; used from the pan
  // listener without forcing the PanResponder memo to re-create on every
  // state change (which would lose in-flight gesture state).
  const dragRef = useRef<ScanDrag | null>(null);

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
      void createAutoErrorReport(db, e, { context }).catch(() => {
        /* monitoring is best-effort — never block the UI */
      });
      return t("aiReceipt.aiErrorGeneric");
    },
    [db, t],
  );

  const runParse = useCallback(
    async (b64: string, mime: string) => {
      if (!groupId) return;
      if (!authUser?.email || !authUser.email_confirmed_at || !premium.isPremium) {
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
        setLines(payloadToEditableLines(out, t("aiReceipt.fallbackTotalLabel")));
      } catch (e) {
        setErr(toUserFacingAiError(e, "ai:receipt-image"));
      } finally {
        setBusy(false);
      }
    },
    [
      groupCurrency,
      groupId,
      hasKey,
      members,
      myId,
      t,
      toUserFacingAiError,
      premium.isPremium,
    ],
  );

  const pickFromLibrary = useCallback(async () => {
    if (!authUser?.email || !authUser.email_confirmed_at || !premium.isPremium) {
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
        allowsMultipleSelection: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const incoming: Attachment[] = [];
      for (const a of res.assets) {
        if (!a.base64) continue;
        const shrunk = await downscaleReceiptImage({
          uri: a.uri,
          base64: a.base64,
          mimeType: a.mimeType ?? "image/jpeg",
        });
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
  }, [hasKey, t, premium.isPremium]);

  const pickFromCamera = useCallback(async () => {
    if (!authUser?.email || !authUser.email_confirmed_at || !premium.isPremium) {
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
      const shrunk = await downscaleReceiptImage({
        uri: a.uri,
        base64: a.base64,
        mimeType: a.mimeType ?? "image/jpeg",
      });
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
  }, [hasKey, t, premium.isPremium]);

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
    if (!authUser?.email || !authUser.email_confirmed_at || !premium.isPremium) {
      setVoiceErr(t("aiReceipt.premiumRequiredBody"));
      return;
    }
    if (!hasKey) {
      setVoiceErr(t("aiReceipt.unavailableBuild"));
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
      // Populate the text field and stop. The user reviews/edits the
      // transcript, optionally attaches a photo, then explicitly taps Analyze.
      setDescribeText(transcript);
    } catch (e) {
      setVoiceErr(toUserFacingAiError(e, "ai:transcribe"));
    } finally {
      setVoicePhase("idle");
    }
  }, [recorder, t, toUserFacingAiError, voicePhase]);

  /**
   * Honor the `autoRecord` route param from the mic half of the home FAB:
   * once the group + members are ready, kick off recording immediately and
   * clear the flag so a tab switch doesn't retrigger it.
   */
  useEffect(() => {
    if (!route.params?.autoRecord) return;
    if (!groupId || members.length === 0) return;
    if (!hasKey) return;
    if (!authUser?.email || !authUser.email_confirmed_at || !premium.isPremium) return;
    if (voicePhase !== "idle") return;
    navigation.setParams({ autoRecord: undefined });
    void startVoiceRecord();
  }, [
    route.params?.autoRecord,
    groupId,
    members.length,
    hasKey,
    premium.isPremium,
    voicePhase,
    navigation,
    startVoiceRecord,
  ]);

  const runDescribe = useCallback(async () => {
    const prompt = describeText.trim();
    // No text: single image → vision OCR/DnD flow; multi → require a prompt.
    if (!prompt) {
      if (attachments.length === 1) {
        void runParse(attachments[0]!.base64, attachments[0]!.mimeType);
        return;
      }
      setDescribeErr(t("aiReceipt.describeEmpty"));
      return;
    }
    if (!groupId || members.length === 0) return;
    if (!authUser?.email || !authUser.email_confirmed_at || !premium.isPremium) {
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
      setDescribeErr(toUserFacingAiError(e, "ai:describe"));
    } finally {
      setDescribeBusy(false);
    }
  }, [
    attachments,
    describeText,
    groupId,
    groupCurrency,
    hasKey,
    members,
    premium.isPremium,
    runParse,
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

  /** Clear everything related to the current receipt flow (AI input + parse result). */
  const resetReceiptFlow = useCallback(() => {
    setAttachments([]);
    setParsed(null);
    setLines([]);
    setDescribeText("");
    setDescribeErr(null);
    setProposed([]);
    setErr(null);
  }, []);

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
              assigneeId: !l.disabled ? null : l.assigneeId,
            }
          : l,
      ),
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
  const owedByMemberId = useMemo(() => {
    const out = new Map<string, number>();
    if (scanSplitMode === "exact") {
      for (const ln of lines) {
        if (ln.disabled) continue;
        if (!ln.assigneeId) continue;
        const minor = majorFloatToMinor(ln.amountMajor, groupCurrency);
        out.set(ln.assigneeId, (out.get(ln.assigneeId) ?? 0) + minor);
      }
      return out;
    }
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
      let consumed = 0;
      for (let i = 0; i < included.length; i++) {
        const m = included[i]!;
        const isLast = i === included.length - 1;
        const share = isLast
          ? linesTotalMinor - consumed
          : Math.max(0, baseShare + (adjArr[i] ?? 0));
        out.set(m.id, Math.max(0, share));
        consumed += share;
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
    lines,
    linesTotalMinor,
    members,
    percentText,
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
   * Save each enabled line as its own expense (mirrors the "Add expense with
   * AI" describe flow). One global payer; per-line splits depend on mode:
   *  - "exact"  → expense fully owed by the line's assignee
   *  - else     → split equally among included members
   * After all writes the receipt flow is cleared and the user lands on the
   * group detail screen so they can see the new entries.
   */
  const saveReceiptExpense = useCallback(async () => {
    if (!groupId || lines.length === 0 || busy || addingAll) return;
    const enabled = lines.filter((l) => !l.disabled);
    if (enabled.length === 0) return;
    if (scanSplitMode === "exact" && enabled.some((l) => !l.assigneeId)) return;

    const resolvedPayer = members.some((m) => m.id === payerId)
      ? payerId
      : (members[0]?.id ?? myId);
    const includedIds = members
      .filter((m) => includedMemberIds.has(m.id))
      .map((m) => m.id);
    if (scanSplitMode !== "exact" && includedIds.length === 0) return;

    const savedGid = groupId;
    setAddingAll(true);
    try {
      for (const ln of enabled) {
        const amountMinor = majorFloatToMinor(ln.amountMajor, groupCurrency);
        if (amountMinor <= 0) continue;

        const owed = new Map<string, number>();
        if (scanSplitMode === "exact") {
          if (!ln.assigneeId) continue;
          owed.set(ln.assigneeId, amountMinor);
        } else {
          // Equal split among included members; remainder absorbed by the
          // first member so the per-line totals reconcile to the cent.
          const n = includedIds.length;
          const baseShare = Math.floor(amountMinor / n);
          let remainder = amountMinor - baseShare * n;
          for (const uid of includedIds) {
            const extra = remainder > 0 ? 1 : 0;
            owed.set(uid, baseShare + extra);
            if (remainder > 0) remainder -= 1;
          }
        }

        const title = (ln.label.trim() || t("aiReceipt.fallbackTotalLabel")).slice(
          0,
          500,
        );
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
      }
      resetReceiptFlow();
      navigation.navigate("Groups", {
        screen: "GroupDetail",
        params: { groupId: savedGid },
      });
    } finally {
      setAddingAll(false);
    }
  }, [
    addingAll,
    busy,
    db,
    groupCurrency,
    groupId,
    includedMemberIds,
    lines,
    members,
    myId,
    navigation,
    payerId,
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
              l.assigneeId === memberId ? { ...l, assigneeId: null } : l,
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

  const findPersonAtPoint = useCallback(
    (absX: number, absY: number): string | null => {
      const rects = personRectsRef.current;
      for (const id of Object.keys(rects)) {
        const r = rects[id]!;
        if (absX >= r.x && absX <= r.x + r.w && absY >= r.y && absY <= r.y + r.h) {
          return id;
        }
      }
      return null;
    },
    [],
  );

  /** Web-only: detach handle for the window pointer listeners attached in
   *  `startScanDrag`. Cleared in `clearDrag`. */
  const webDragCleanupRef = useRef<(() => void) | null>(null);

  const startScanDrag = useCallback(
    (
      ln: EditableLine,
      pageX: number,
      pageY: number,
      width: number,
    ) => {
      // Re-measure plates right before drop detection runs.
      for (const id of Object.keys(personRefs.current)) {
        const node = personRefs.current[id];
        if (node) {
          node.measureInWindow((x, y, w, h) => {
            personRectsRef.current[id] = { x, y, w, h };
          });
        }
      }
      dragPan.setValue({ x: 0, y: 0 });
      const snap: ScanDrag = {
        lineId: ln.id,
        startX: pageX,
        startY: pageY,
        width,
        label: ln.label,
        amountMajor: ln.amountMajor,
      };
      dragRef.current = snap;

      // Attach the web fallback listeners SYNCHRONOUSLY so the very next
      // pointermove (which can fire before React commits the setDrag()
      // re-render and runs our useEffect) is captured. Without this, the
      // user's first move event after long-press is missed and the gesture
      // appears to "release."
      if (Platform.OS === "web") {
        webDragCleanupRef.current?.();
        webDragCleanupRef.current = attachWebDragListeners(snap);
      }

      setDrag(snap);
    },
    // attachWebDragListeners is stable (defined below as a useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragPan],
  );

  // Included-set stays on a ref so the pan listener can read the latest value
  // without making the PanResponder memo re-create (and drop the gesture).
  const includedRef = useRef(includedMemberIds);
  useEffect(() => {
    includedRef.current = includedMemberIds;
  }, [includedMemberIds]);

  const clearDrag = useCallback(() => {
    if (webDragCleanupRef.current) {
      webDragCleanupRef.current();
      webDragCleanupRef.current = null;
    }
    dragPan.setValue({ x: 0, y: 0 });
    dragRef.current = null;
    hoverPersonRef.current = null;
    setHoverPersonId(null);
    setDrag(null);
  }, [dragPan]);

  // Run the hit-test + assignment on release; shared by the PanResponder
  // (native) and the web pointerup fallback below.
  const finalizeDragAt = useCallback(
    (absX: number, absY: number) => {
      const d = dragRef.current;
      if (!d) {
        clearDrag();
        return;
      }
      const target = findPersonAtPoint(absX, absY);
      if (target && includedRef.current.has(target)) {
        setLines((prev) =>
          prev.map((l) =>
            l.id === d.lineId ? { ...l, assigneeId: target } : l,
          ),
        );
      }
      clearDrag();
    },
    [clearDrag, findPersonAtPoint],
  );

  // Drive the ghost transform via Animated.event (JS-driven, but avoids the
  // per-frame `setValue` round-trip). Hit-test + hover swap read from refs so
  // React only re-renders when the hovered id actually changes.
  const dragPanResponder = useMemo(
    () =>
      PanResponder.create({
        // Capture variants are essential on web — without them, the long-press
        // handoff from Pressable to this PanResponder doesn't fire because the
        // child Pressable still holds the responder when the user starts moving.
        onStartShouldSetPanResponderCapture: () => dragRef.current !== null,
        onMoveShouldSetPanResponderCapture: () => dragRef.current !== null,
        onStartShouldSetPanResponder: () => dragRef.current !== null,
        onMoveShouldSetPanResponder: () => dragRef.current !== null,
        // Don't let a sibling view (ScrollView, parent Pressable) yank the
        // responder back mid-drag.
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: Animated.event(
          [null, { dx: dragPan.x, dy: dragPan.y }],
          {
            useNativeDriver: false,
            listener: (_evt, g) => {
              const d = dragRef.current;
              if (!d) return;
              const gesture = g as { dx: number; dy: number };
              const id = findPersonAtPoint(
                d.startX + gesture.dx,
                d.startY + gesture.dy,
              );
              if (hoverPersonRef.current !== id) {
                hoverPersonRef.current = id;
                setHoverPersonId(id);
              }
            },
          },
        ),
        onPanResponderRelease: (_, g) => {
          const d = dragRef.current;
          if (!d) return;
          finalizeDragAt(d.startX + g.dx, d.startY + g.dy);
        },
        onPanResponderTerminate: () => clearDrag(),
      }),
    [clearDrag, dragPan, finalizeDragAt, findPersonAtPoint],
  );

  /**
   * Attach window-level pointer listeners that drive the drag on web.
   *
   * react-native-web's PanResponder ↔ Pressable handoff is unreliable: when
   * the long-press fires the Pressable still owns the pointer responder, so
   * `onPanResponderMove` never runs and the user-visible "drag" is frozen
   * at the start position. To work around it we listen to the DOM pointer
   * stream directly. Returns a cleanup function the caller stores so it can
   * be invoked from `clearDrag`.
   */
  const attachWebDragListeners = useCallback(
    (snap: ScanDrag): (() => void) => {
      if (Platform.OS !== "web") return () => {};
      const startX = snap.startX;
      const startY = snap.startY;

      const pagePointFromEvent = (
        e: PointerEvent | MouseEvent | TouchEvent,
      ): { x: number; y: number } | null => {
        if ("touches" in e && e.touches.length > 0) {
          const t = e.touches[0]!;
          return { x: t.pageX, y: t.pageY };
        }
        if ("changedTouches" in e && e.changedTouches.length > 0) {
          const t = e.changedTouches[0]!;
          return { x: t.pageX, y: t.pageY };
        }
        if ("pageX" in e && typeof e.pageX === "number") {
          return { x: e.pageX, y: e.pageY };
        }
        return null;
      };

      const onMove = (e: PointerEvent | TouchEvent | MouseEvent) => {
        const p = pagePointFromEvent(e);
        if (!p) return;
        // Suppress browser scroll / text-selection while we're dragging so
        // the cursor stays bound to the ghost and the page doesn't fight us.
        if ((e as Event).cancelable) (e as Event).preventDefault();
        dragPan.setValue({ x: p.x - startX, y: p.y - startY });
        const id = findPersonAtPoint(p.x, p.y);
        if (hoverPersonRef.current !== id) {
          hoverPersonRef.current = id;
          setHoverPersonId(id);
        }
      };
      const onUp = (e: PointerEvent | TouchEvent | MouseEvent) => {
        const p = pagePointFromEvent(e) ?? { x: startX, y: startY };
        finalizeDragAt(p.x, p.y);
      };

      // Capture phase so a child element calling stopPropagation in bubble
      // doesn't hide events from us.
      const opts = {
        capture: true,
        passive: false,
      } as AddEventListenerOptions;
      window.addEventListener("pointermove", onMove as EventListener, opts);
      window.addEventListener("pointerup", onUp as EventListener, opts);
      window.addEventListener("pointercancel", onUp as EventListener, opts);
      window.addEventListener("mousemove", onMove as EventListener, opts);
      window.addEventListener("mouseup", onUp as EventListener, opts);
      window.addEventListener("touchmove", onMove as EventListener, opts);
      window.addEventListener("touchend", onUp as EventListener, opts);
      return () => {
        const rm = { capture: true } as EventListenerOptions;
        window.removeEventListener("pointermove", onMove as EventListener, rm);
        window.removeEventListener("pointerup", onUp as EventListener, rm);
        window.removeEventListener(
          "pointercancel",
          onUp as EventListener,
          rm,
        );
        window.removeEventListener("mousemove", onMove as EventListener, rm);
        window.removeEventListener("mouseup", onUp as EventListener, rm);
        window.removeEventListener("touchmove", onMove as EventListener, rm);
        window.removeEventListener("touchend", onUp as EventListener, rm);
      };
    },
    [dragPan, findPersonAtPoint, finalizeDragAt],
  );

  // Cleanup on unmount: if the user navigates away mid-drag, drop the global
  // listeners so they don't leak past this screen's lifetime.
  useEffect(() => {
    return () => {
      webDragCleanupRef.current?.();
      webDragCleanupRef.current = null;
    };
  }, []);

  // Running totals — the raw sum of every parsed line (used for "Split total"
  // and as the base amount for non-Exact split modes).
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

  // AI features require a signed-in Supabase account with premium. Either
  // missing → dim the whole screen and float a single upsell card on top
  // (the rest of the UI stays mounted in the background so the user can
  // see what they're buying).
  const signInGate = !authUser?.email;
  const premiumGate = !signInGate && !premium.isPremium;
  const aiGate = signInGate || premiumGate;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      {...dragPanResponder.panHandlers}
    >
      <View
        style={[
          styles.headerAnchor,
          { paddingTop: Math.max(8, insets.top) },
        ]}
      >
        <View style={styles.pageTitleRow}>
          <View style={styles.pageTitleSpacer} />
          <Text style={styles.pageTitleText}>{t("aiReceipt.pageTitle")}</Text>
          <View style={styles.pageTitleSpacer} />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.pad,
          { paddingBottom: scrollBottom },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={drag === null}
      >
        <View
          ref={aiTour.ref}
          onLayout={aiTour.onLayout}
          collapsable={false}
          style={aiGate ? { opacity: 0.35 } : null}
          pointerEvents={aiGate ? "none" : "auto"}
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
              styles.addExpenseRow,
              pressed && groups.length > 1 ? { opacity: 0.7 } : null,
            ]}
            onPress={() =>
              groups.length > 1 ? setGroupModalOpen(true) : undefined
            }
            disabled={groups.length <= 1}
            accessibilityRole={groups.length > 1 ? "button" : "text"}
            accessibilityLabel={t("aiReceipt.changeGroup")}
          >
            <Text style={styles.addExpenseLabel}>
              {t("aiReceipt.addExpenseTo")}
            </Text>
            <View style={styles.addExpenseValueWrap}>
              <Text
                style={styles.addExpenseValue}
                numberOfLines={1}
              >
                {groupSummaryText}
              </Text>
              {groups.length > 1 ? (
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={colors.muted}
                />
              ) : null}
            </View>
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

        {!aiGate && parsed && lines.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("aiReceipt.linesHeading")}</Text>
            {parsed.currency && parsed.currency !== groupCurrency ? (
              <Text style={[styles.muted, { marginBottom: 8 }]}>
                {t("aiReceipt.receiptCurrency", { code: parsed.currency })}
              </Text>
            ) : null}
            {(() => {
              // In "exact" mode the assigned lines move onto the person tile;
              // keep them out of this list so the user only sees lines still
              // needing an assignee. In other modes lines don't get assigned,
              // so show them all.
              const rendered =
                scanSplitMode === "exact"
                  ? lines.filter((l) => !l.disabled && !l.assigneeId)
                  : lines;
              return rendered.map((ln, idx) => {
                const being = drag?.lineId === ln.id;
                const draggable = scanSplitMode === "exact";
                const ghostWidth = Math.max(
                  160,
                  Math.min(windowWidth - 40, 360),
                );
                const isDisabled = !!ln.disabled;
                const amountDisplay = ln.amountMajor > 0
                  ? minorToAmountInputString(
                      majorFloatToMinor(ln.amountMajor, groupCurrency),
                      groupCurrency,
                    )
                  : "";
                const rowInner = (
                  <>
                    <Ionicons
                      name="reorder-three-outline"
                      size={18}
                      color={isDisabled ? colors.muted : (draggable ? colors.primary : colors.muted)}
                      style={{
                        marginRight: isRTL ? 0 : 6,
                        marginLeft: isRTL ? 6 : 0,
                      }}
                    />
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
                // Whole-row drag trigger. `onPressIn` fires the drag
                // immediately — no long-press hold required. This blocks
                // vertical scroll while the finger is on the row; users
                // scroll by starting the touch above/below the line list.
                // The remove button sits OUTSIDE the drag Pressable so
                // tapping it doesn't start a drag.
                return draggable && !isDisabled ? (
                  <View
                    key={ln.id}
                    style={[
                      styles.rowOuter,
                      idx === rendered.length - 1 && styles.rowLast,
                    ]}
                  >
                    <Pressable
                      onPressIn={(e) => {
                        const ne = e.nativeEvent;
                        startScanDrag(ln, ne.pageX, ne.pageY, ghostWidth);
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        styles.rowDraggable,
                        styles.rowFlex,
                        being && styles.rowBeingDragged,
                        pressed && { opacity: 0.85 },
                      ]}
                      accessibilityRole="button"
                    >
                      {rowInner}
                    </Pressable>
                    {toggleBtn}
                  </View>
                ) : (
                  <View
                    key={ln.id}
                    style={[
                      styles.row,
                      idx === rendered.length - 1 && styles.rowLast,
                      isDisabled && styles.rowDisabled,
                    ]}
                  >
                    {rowInner}
                    {toggleBtn}
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
                { id: "exact", icon: "calculator-outline", label: t("aiReceipt.modeExact") },
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
              scrollEnabled={drag === null}
              contentContainerStyle={styles.tileRow}
            >
              {members.map((m) => {
                const isPayer = m.id === payerId;
                const isIncluded = includedMemberIds.has(m.id);
                const isHovered = hoverPersonId === m.id;
                const memberOwed = owedByMemberId.get(m.id) ?? 0;
                return (
                  <View
                    key={m.id}
                    ref={(node) => {
                      personRefs.current[m.id] = node;
                    }}
                    onLayout={(e: LayoutChangeEvent) => {
                      void e;
                      const node = personRefs.current[m.id];
                      if (!node) return;
                      node.measureInWindow((x, y, w, h) => {
                        personRectsRef.current[m.id] = { x, y, w, h };
                      });
                    }}
                    style={styles.personTileWrap}
                  >
                    <View
                      style={[
                        styles.personTile,
                        styles.personTilePressFill,
                        isPayer && styles.personTilePayer,
                        !isPayer && !isIncluded && styles.personTileExcluded,
                        isHovered && styles.personTileHover,
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
                            {formatMinor(memberOwed, groupCurrency)}
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
                        {scanSplitMode === "exact" ? (
                          (() => {
                            const assigned = lines.filter(
                              (l) => !l.disabled && l.assigneeId === m.id,
                            );
                            if (assigned.length === 0) return null;
                            return (
                              <View style={styles.assignedItemsList}>
                                {assigned.map((l) => (
                                  <Pressable
                                    key={l.id}
                                    style={styles.assignedItemPill}
                                    onPress={() =>
                                      setLines((prev) =>
                                        prev.map((x) =>
                                          x.id === l.id
                                            ? { ...x, assigneeId: null }
                                            : x,
                                        ),
                                      )
                                    }
                                    accessibilityLabel={t(
                                      "aiReceipt.unassignLineA11y",
                                      { name: m.name },
                                    )}
                                  >
                                    <Text
                                      style={styles.assignedItemText}
                                      numberOfLines={2}
                                    >
                                      {l.label}
                                    </Text>
                                    <Ionicons
                                      name="close"
                                      size={10}
                                      color={colors.primary}
                                    />
                                  </Pressable>
                                ))}
                              </View>
                            );
                          })()
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

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
                    // Exact mode needs every line assigned; other modes need
                    // at least one included member (computed by owedByMemberId).
                    (scanSplitMode === "exact"
                      ? lines.some((l) => !l.disabled && !l.assigneeId)
                      : owedByMemberId.size === 0)
                  }
                />
              </View>
            </View>
          </View>
        ) : !premiumGate && parsed && lines.length === 0 && !busy ? (
          <Text style={styles.warn}>{t("aiReceipt.noLines")}</Text>
        ) : null}

        {groupId && groups.length > 0 && !(parsed && lines.length > 0) ? (
          <View>
            <Text style={styles.sectionLabel}>
              {t("aiReceipt.addWithAi")}
            </Text>

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
              }[] = [
                {
                  key: "photo",
                  icon: "camera-outline",
                  label: t("aiReceipt.tilePhoto"),
                  sub: t("aiReceipt.tilePhotoSub"),
                  onPress: tilePhotoOnPress,
                  disabled: inputBusy,
                },
                {
                  key: "gallery",
                  icon: "images-outline",
                  label: t("aiReceipt.tileGallery"),
                  sub: t("aiReceipt.tileGallerySub"),
                  onPress: () => void pickFromLibrary(),
                  disabled: inputBusy,
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
                        styles.tileBox,
                        tile.disabled && styles.tileBoxDisabled,
                        pressed && { opacity: 0.85 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={tile.label}
                    >
                      <View style={styles.tileIconWrap}>
                        <Ionicons
                          name={tile.icon}
                          size={20}
                          color={colors.primary}
                        />
                      </View>
                      <Text style={styles.tileLabel}>{tile.label}</Text>
                      <Text style={styles.tileSub}>{tile.sub}</Text>
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
              {t("aiReceipt.orDescribe")}
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
                  !describeBusy &&
                  !addingAll &&
                  voicePhase !== "recording" &&
                  voicePhase !== "processing"
                }
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }, 120);
                }}
              />
            </View>

            {voicePhase === "recording" ? (
              <Text style={styles.voiceStatus}>
                {t("aiReceipt.voiceRecording")}
                {" · "}
                {Math.max(
                  0,
                  Math.floor((recorderState.durationMillis ?? 0) / 1000),
                )}
                s
              </Text>
            ) : voicePhase === "processing" ? (
              <View style={styles.voiceStatusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.voiceStatus}>
                  {t("aiReceipt.voiceProcessingBody")}
                </Text>
              </View>
            ) : null}

            <View style={styles.voiceCtaWrap}>
              <Pressable
                style={({ pressed }) => [
                  styles.voiceCircleLarge,
                  voicePhase === "recording" && styles.voiceCircleLargeRecording,
                  (!hasKey ||
                    members.length === 0 ||
                    busy ||
                    describeBusy ||
                    addingAll ||
                    voicePhase === "processing") &&
                    styles.voiceCircleLargeDisabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() =>
                  voicePhase === "recording"
                    ? void stopVoiceRecord()
                    : void startVoiceRecord()
                }
                disabled={
                  !hasKey ||
                  members.length === 0 ||
                  busy ||
                  describeBusy ||
                  addingAll ||
                  voicePhase === "processing"
                }
                accessibilityRole="button"
                accessibilityLabel={
                  voicePhase === "recording"
                    ? t("aiReceipt.voiceStopHint")
                    : t("aiReceipt.voiceStart")
                }
              >
                <Ionicons
                  name={voicePhase === "recording" ? "stop" : "mic"}
                  size={28}
                  color="#fff"
                />
              </Pressable>
              <Text style={styles.voiceCtaLabel}>
                {voicePhase === "recording"
                  ? t("aiReceipt.voiceStopHint")
                  : t("aiReceipt.tapToSpeak")}
              </Text>
            </View>

            <AppButton
              variant="primary"
              fullWidth
              label={
                describeBusy || busy
                  ? t("aiReceipt.describeAnalyzing")
                  : t("aiReceipt.describeAnalyze")
              }
              onPress={() => void runDescribe()}
              disabled={
                describeBusy ||
                busy ||
                addingAll ||
                !hasKey ||
                members.length === 0 ||
                voicePhase !== "idle"
              }
              left={
                describeBusy || busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="sparkles-outline" size={20} color="#fff" />
                )
              }
              style={{ marginBottom: 8 }}
            />

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

        {proposed.length > 0 && !premiumGate ? (
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
        </View>
      </ScrollView>

      {aiGate ? (
        <View style={styles.gateOverlay} pointerEvents="box-none">
          <View style={styles.gateOverlayInner}>
            <CloudSyncGateOverlay
              mode={signInGate ? "signin" : "premium"}
              context="ai"
            />
          </View>
        </View>
      ) : null}

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

      {drag ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragGhost,
            {
              width: drag.width,
              transform: [
                {
                  translateX: Animated.add(
                    dragPan.x,
                    new Animated.Value(drag.startX - drag.width / 2),
                  ),
                },
                {
                  translateY: Animated.add(
                    dragPan.y,
                    new Animated.Value(drag.startY - 24),
                  ),
                },
              ],
            },
          ]}
        >
          <Text style={styles.dragGhostLabel} numberOfLines={1}>
            {drag.label}
          </Text>
          <Text style={styles.dragGhostAmt}>
            {formatMinor(
              majorFloatToMinor(drag.amountMajor, groupCurrency),
              groupCurrency,
            )}
          </Text>
        </Animated.View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
