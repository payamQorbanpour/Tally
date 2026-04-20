import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";
import { TextInput, type AppTextInputRef } from "../ui/AppTextInput";
import { KeyboardDismissButton } from "../ui/KeyboardDismissButton";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { getLocalUserId } from "../db/ids";
import type { GroupsStackParamList } from "../navigation/types";
import {
  addExpenseWithSplits,
  applyDecimalSeparatorToAmountInput,
  stripImeSpuriousZeroDotAfterFocus,
  deleteExpense,
  formatMinor,
  formatSignedMoneyInputDisplay,
  formatUnsignedMoneyInputDisplay,
  getExpenseWithSplits,
  getGroup,
  getLocalUserProfile,
  listGroups,
  listMembers,
  minorToAmountInputString,
  parseMoneyToMinor,
  parseSignedMoneyToMinor,
  updateExpenseWithSplits,
  type GroupRow,
  type MemberRow,
} from "../data/tallyRepo";
import { CURRENCY_OPTIONS, currencyMinorExponent } from "../data/currencies";
import { categoryIconName } from "../core/categoryIcons";
import { guessCategoryFromTitle } from "../core/guessCategoryFromTitle";
import { splitEqualMinor } from "../core/splitEqual";
import {
  splitEqualWithAdjustmentsMinor,
  splitExactMinor,
  splitPercentMinor,
  splitSharesMinor,
} from "../core/splitAdvanced";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { moneyTextStyle } from "../theme/typography";
import {
  buildNumpadDoneInputProps,
  useNumpadDoneAccessoryContext,
  useNumpadDoneInputProps,
} from "../providers/NumpadDoneAccessory";
import Ionicons from "@expo/vector-icons/Ionicons";

type Props = NativeStackScreenProps<GroupsStackParamList, "AddExpense">;

type SplitMode = "equal" | "exact" | "percent" | "shares" | "adjust";

const SPLIT_MODE_ICONS: Record<SplitMode, keyof typeof Ionicons.glyphMap> = {
  equal: "people-outline",
  exact: "calculator-outline",
  percent: "pie-chart-outline",
  shares: "layers-outline",
  adjust: "options-outline",
};

const WIDE_LAYOUT = 768;

/** After focus, move caret to end of value (numpad amount UX). */
function scheduleCaretToEndOnInput(input: AppTextInputRef | null, textLength: number) {
  if (!input) return;
  const end = Math.max(0, textLength);
  const withSelection = input as AppTextInputRef & {
    setSelection?: (start: number, end: number) => void;
  };
  if (typeof withSelection.setSelection === "function") {
    withSelection.setSelection(end, end);
  } else {
    input.setNativeProps?.({ selection: { start: end, end } });
  }
}

function scheduleCaretToEnd(
  inputRef: RefObject<AppTextInputRef | null>,
  textLength: number,
) {
  requestAnimationFrame(() => {
    scheduleCaretToEndOnInput(inputRef.current, textLength);
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

/**
 * Nested horizontal ScrollViews inside the page ScrollView do not reliably receive
 * wheel / trackpad deltas on web — the parent scrolls vertically instead.
 * Map wheel movement to horizontal scroll for the strip (react-native-web).
 */
function useWebHorizontalWheelScroll() {
  const ref = useRef<ScrollView>(null);
  const offsetX = useRef(0);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetX.current = e.nativeEvent.contentOffset.x;
    },
    [],
  );
  const onWheel = useCallback((e: unknown) => {
    if (Platform.OS !== "web") return;
    const ev = e as {
      nativeEvent?: { deltaX?: number; deltaY?: number; shiftKey?: boolean };
      preventDefault?: () => void;
      stopPropagation?: () => void;
    };
    const ne = ev.nativeEvent ?? (e as { deltaX?: number; deltaY?: number; shiftKey?: boolean });
    const deltaX = typeof ne.deltaX === "number" ? ne.deltaX : 0;
    const deltaY = typeof ne.deltaY === "number" ? ne.deltaY : 0;
    const shiftKey =
      "shiftKey" in ne && typeof (ne as { shiftKey?: boolean }).shiftKey === "boolean"
        ? (ne as { shiftKey: boolean }).shiftKey
        : false;
    const dominantHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const delta = dominantHorizontal ? deltaX : shiftKey ? deltaY : deltaY;
    if (delta === 0) return;
    const next = offsetX.current + delta;
    offsetX.current = next;
    ref.current?.scrollTo({ x: Math.max(0, next), animated: false });
    ev.preventDefault?.();
    ev.stopPropagation?.();
  }, []);
  return { ref, onScroll, onWheel };
}

function buildAddExpenseStyles(colors: ThemeColors) {
  return StyleSheet.create({
  addRoot: { flex: 1, justifyContent: "space-between" as const },
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 28 },
  scrollWide: { paddingHorizontal: 24, maxWidth: 600, alignSelf: "center", width: "100%" },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardRim,
    padding: 20,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    paddingBottom: 12,
    minWidth: 0,
  },
  /** Lets the amount field shrink on narrow screens / web so text can scroll instead of clipping. */
  amountInputWrap: {
    flex: 1,
    minWidth: 0,
    /** Isolate amount field so digits + commas stay left-to-right in RTL (esp. Android). */
    direction: "ltr",
    ...Platform.select({
      web: { maxWidth: "100%" as const },
      default: {},
    }),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardRim,
    padding: 16,
  },
  heroTitle: {
    fontSize: 17,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.inputSurface,
    color: colors.text,
  },
  currencyToggle: {
    flexShrink: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  currencyToggleText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
  catScrollInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  logicSpacer: { height: 28 },
  groupPickMeta: { fontSize: 12, fontWeight: "600", color: colors.muted },
  currencyModalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  currencyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  currencyModalTitle: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  currencyModalDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
  currencyFlatList: { flex: 1 },
  currencyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  currencyRowSelected: { backgroundColor: colors.owedSoft },
  currencyRowCode: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    width: 44,
    fontVariant: ["tabular-nums"],
  },
  currencyRowLabel: { flex: 1, fontSize: 15, color: colors.text },
  currencyEmpty: { padding: 24, textAlign: "center", color: colors.muted, fontSize: 15 },
  currencySearchField: { marginBottom: 12, color: colors.text },
  groupModalBackdrop: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.45)",
    justifyContent: Platform.OS === "web" ? "center" : "flex-end",
    padding: Platform.OS === "web" ? 24 : 0,
  },
  groupModalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%" as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        borderRadius: 14,
        maxWidth: 400,
        width: "100%" as const,
        alignSelf: "center",
      },
      default: {},
    }),
  },
  groupModalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  groupModalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  groupModalRowOn: { backgroundColor: colors.owedSoft },
  groupModalRowText: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.text, minWidth: 0 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  payerScroll: {
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
  payerScrollInner: {
    flexDirection: "row",
    /** Stretch so every split tile matches the tallest (included vs excluded content differs in height). */
    alignItems: "stretch",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  splitToolbarScroll: {
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
  toolBtn: {
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
  },
  toolBtnOn: {
    backgroundColor: colors.owedSoft,
    borderColor: colors.primary,
  },
  toolBtnLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },
  toolBtnLabelOn: { color: colors.primary, fontWeight: "700" },
  splitModeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  exactRemainLine: {
    fontSize: 15,
    fontWeight: "700" as const,
    marginTop: 8,
    textAlign: "right" as const,
  },
  exactRemainOk: { color: colors.owed },
  exactRemainNeed: { color: colors.owe },
  footerRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 0,
    padding: 16,
    paddingBottom: 20,
    backgroundColor: colors.bg,
  },
  footerRowShadow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...Platform.select({
      web: {
        // Use border tone on web to avoid a neon/“vibrating” green glow on dark surfaces.
        boxShadow: "0 0 24px rgba(29, 69, 68, 0.55)",
      } as const,
      default: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 6,
      },
    }),
  },
  footerBtn: { flex: 1, marginTop: 0 },
  footerSave: { backgroundColor: colors.primary, borderColor: colors.primary, borderWidth: 0 },
  secondaryNav: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryNavText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    width: "100%",
  },
  bigAmount: {
    width: "100%",
    minWidth: 0,
    fontWeight: "700",
    /** Right-aligned so long values stay visible at the “money” end; digits stay LTR in RTL locales. */
    textAlign: "right",
    writingDirection: "ltr",
    direction: "ltr",
    color: colors.text,
    paddingVertical: 4,
    ...moneyTextStyle(),
  },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.inputSurface,
  },
  dateTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateTimeValue: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
    paddingRight: 8,
  },
  dateTimeChev: { fontSize: 20, color: colors.muted, fontWeight: "200" },
  webDatetimeRow: { width: "100%" as const },
  iosModalBase: { flex: 1 },
  iosDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  iosSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
  },
  iosTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  iosModalDone: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  catRowScroll: {
    marginTop: 16,
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
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  catChipOn: { backgroundColor: colors.owedSoft, borderColor: colors.primary },
  catChipText: { fontSize: 14, color: colors.text },
   catChipTextOn: { fontWeight: "600", color: colors.owed },
  block: { marginTop: 12 },
  hint: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  splitHintsBelow: { marginTop: 10 },
  hintHelpBlock: { gap: 8, marginBottom: 10 },
  hintHelpRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  hintHelpIcon: { marginTop: 2 },
  hintHelpText: { flex: 1, fontSize: 13, color: colors.muted },
  checkShareMuted: { color: colors.muted, fontWeight: "500" },
  pctSuffix: { width: 20, fontSize: 16, color: colors.muted },
  errText: { color: colors.owe, marginTop: 10, fontSize: 14 },
  personTileWrap: {
    position: "relative" as const,
    ...Platform.select({
      web: { width: 120 },
      default: { width: 100 },
    }),
    marginHorizontal: 2,
    flexDirection: "column",
  },
  /** Fill stretched height from `payerScrollInner` so all tiles are the same outer size. */
  personTilePressFill: {
    flex: 1,
    minHeight: 0,
  },
  personTilePress: {
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
  personTilePressPayer: {
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
  personTilePressOut: {
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
  /** Amount / sub-fields below name+include row (not inside toggle Pressable — web click targets). */
  personTileUnderArea: {
    width: "100%",
    alignItems: "center",
    flex: 1,
    minHeight: 0,
    justifyContent: "flex-start",
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  avatarPayerRing: {
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
  },
  /** Fixed height so payer vs non-payer tiles stay the same size */
  paidBadgeSlot: {
    height: 36,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
  },
  paidBadgePill: {
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
  paidBadgePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  inclusionRow: {
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
  inclusionIconSlot: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  inclusionRowOn: {
    backgroundColor: colors.owedSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  inclusionRowOff: {
    backgroundColor: colors.inputSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  inclusionRowLabel: {
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
  inclusionRowLabelOn: { color: colors.primary },
  inclusionRowLabelOff: { color: colors.muted },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  avatarName: { fontSize: 11, color: colors.muted, marginTop: 4, maxWidth: "100%" },
  /** Payer tile: bold name */
  avatarNameOn: { color: colors.text, fontWeight: "800", fontSize: 12 },
  personTileAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
    textAlign: "center",
    width: "100%",
    ...moneyTextStyle(),
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
    ...moneyTextStyle(),
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
    ...moneyTextStyle(),
  },
  /** Payer’s numeric fields: slightly heavier */
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
    ...moneyTextStyle(),
  },
  personTileSubMoney: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 4,
    textAlign: "center",
    width: "100%",
    ...moneyTextStyle(),
  },
  primaryBtn: {
    marginTop: 0,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 120,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.88 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
}

function formatLocalDateTimeForInput(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
}

/** Fills the add-expense field; supports legacy date-only and sync ISO variants. */
function parseStoredExpenseToInput(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return `${t}T00:00`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})/.exec(t);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  }
  if (t.includes("T") || t.includes(" ")) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      return formatLocalDateTimeForInput(d);
    }
  }
  return formatLocalDateTimeForInput(new Date());
}

function parseStoredExpenseToDate(raw: string): Date {
  const s = parseStoredExpenseToInput(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      0,
      0,
    );
  }
  const t = new Date(raw);
  if (!Number.isNaN(t.getTime())) {
    return t;
  }
  return new Date();
}

function mergeDatePart(base: Date, picked: Date): Date {
  return new Date(
    picked.getFullYear(),
    picked.getMonth(),
    picked.getDate(),
    base.getHours(),
    base.getMinutes(),
    0,
    0,
  );
}

function mergeTimePart(base: Date, picked: Date): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    picked.getHours(),
    picked.getMinutes(),
    0,
    0,
  );
}

export function AddExpenseScreen({ navigation, route }: Props) {
  const { groupId, expenseId } = route.params;
  const db = useDatabase();
  const { dataRevision } = useTallyData();
  const { t, locale: appLocale, isRTL } = useLocale();
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(() => buildAddExpenseStyles(colors), [colors]);

  const splitLabels = useMemo(
    (): Record<SplitMode, string> => ({
      equal: t("addExpense.splitEqual"),
      exact: t("addExpense.splitExact"),
      percent: t("addExpense.splitPercent"),
      shares: t("addExpense.splitShares"),
      adjust: t("addExpense.splitAdjust"),
    }),
    [t],
  );

  const categoryOptions = useMemo(
    () =>
      [
        { key: null, labelKey: "categories.general" as const },
        { key: "food" as const, labelKey: "categories.food" as const },
        { key: "snack" as const, labelKey: "categories.snack" as const },
        { key: "drink" as const, labelKey: "categories.drink" as const },
        { key: "home" as const, labelKey: "categories.home" as const },
        { key: "transport" as const, labelKey: "categories.transport" as const },
      ].map((c) => ({ ...c, label: t(c.labelKey) })),
    [t],
  );
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [myAvatarUri, setMyAvatarUri] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [payerId, setPayerId] = useState(() => getLocalUserId());
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [equalOn, setEqualOn] = useState<Record<string, boolean>>({});
  const [exactText, setExactText] = useState<Record<string, string>>({});
  const [percentText, setPercentText] = useState<Record<string, string>>({});
  const [sharesText, setSharesText] = useState<Record<string, string>>({});
  const [adjText, setAdjText] = useState<Record<string, string>>({});
  const [groupName, setGroupName] = useState("");
  const [groupCurrency, setGroupCurrency] = useState("USD");
  const titleInputRef = useRef<AppTextInputRef>(null);
  const amountInputRef = useRef<AppTextInputRef>(null);
  const amountFocusTransferredFromTitleRef = useRef(false);
  const splitNumericInputRefs = useRef<Record<string, AppTextInputRef | null>>({});
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [expenseAt, setExpenseAt] = useState(() => new Date());
  const [iosDatePicker, setIosDatePicker] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const keyboardAccessoryId = "addExpenseKeyboardAccessory";
  const [allGroups, setAllGroups] = useState<GroupRow[]>([]);
  const [initialLoadPending, setInitialLoadPending] = useState(() => Boolean(expenseId));
  /** When group id or member set changes on a new expense, reset split fields; on refocus with same context, preserve. */
  const loadedNewExpenseSplitCtxRef = useRef<string | null>(null);
  /** When true, title changes do not overwrite the chosen category (new expenses only). */
  const categoryManualRef = useRef(false);
  const { width: windowWidth } = useWindowDimensions();

  /**
   * Scale hero amount with both character count and screen width so long values are not clipped
   * on narrow devices; still capped at 44 when there is room.
   */
  const amountHeroFontSize = useMemo(() => {
    const cap = 44;
    const n = amountText.length;
    if (n === 0) return cap;
    // Reserve: horizontal padding, hero card, currency pill, gaps (approx.)
    const reserve = 112;
    const avail = Math.max(96, windowWidth - reserve);
    const byLen = Math.floor(520 / n);
    // Tabular monospace digits: ~0.62× fontSize per character at these sizes
    const byWidth = Math.floor((avail * 0.92) / (n * 0.62));
    return Math.max(12, Math.min(cap, Math.min(byLen, byWidth)));
  }, [amountText, windowWidth]);

  const bcpForLocale = useMemo(() => {
    if (appLocale === "fa") return "fa-IR";
    if (appLocale === "es") return "es";
    return "en-GB";
  }, [appLocale]);

  const expenseAtLabel = useMemo(
    () =>
      expenseAt.toLocaleString(bcpForLocale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [expenseAt, bcpForLocale],
  );

  const myId = getLocalUserId();
  const lastReceiptPrefillAppliedKey = useRef<string>("");

  useEffect(() => {
    lastReceiptPrefillAppliedKey.current = "";
  }, [groupId]);

  useEffect(() => {
    const p = route.params.receiptPrefill;
    if (expenseId || !p || p.v !== 1) return;
    if (members.length === 0) return;
    const key = `${groupId}:${JSON.stringify(p)}`;
    if (lastReceiptPrefillAppliedKey.current === key) return;
    lastReceiptPrefillAppliedKey.current = key;

    navigation.setParams({ receiptPrefill: undefined });

    setDescription(p.description);
    setAmountText(minorToAmountInputString(p.amountMinor, currency));
    setPayerId(
      members.some((x) => x.id === p.payerId)
        ? p.payerId
        : (members[0]?.id ?? getLocalUserId()),
    );
    if (p.category !== undefined) {
      setCategory(p.category);
      categoryManualRef.current = true;
    }
    setSplitMode("exact");
    setEqualOn(() => {
      const next: Record<string, boolean> = {};
      for (const x of members) {
        const owed = p.exactByUserId[x.id] ?? 0;
        next[x.id] = owed > 0;
      }
      return next;
    });
    setExactText(() => {
      const next: Record<string, string> = {};
      for (const x of members) {
        const owed = p.exactByUserId[x.id] ?? 0;
        next[x.id] = minorToAmountInputString(owed, currency);
      }
      return next;
    });
    setPercentText((prev) => {
      const next = { ...prev };
      for (const x of members) {
        if (next[x.id] === undefined) next[x.id] = "";
      }
      return next;
    });
    setSharesText((prev) => {
      const next = { ...prev };
      for (const x of members) {
        if (next[x.id] === undefined) next[x.id] = "1";
      }
      return next;
    });
    setAdjText((prev) => {
      const next = { ...prev };
      for (const x of members) {
        if (next[x.id] === undefined) next[x.id] = "";
      }
      return next;
    });
  }, [expenseId, route.params.receiptPrefill, members, groupId, currency, navigation]);

  useEffect(() => {
    setPayerId((prev) =>
      members.some((x) => x.id === prev) ? prev : (members[0]?.id ?? myId),
    );
  }, [dataRevision, myId, members]);

  useEffect(() => {
    let live = true;
    void getLocalUserProfile(db).then((p) => {
      if (live) setMyAvatarUri(p.avatarUri);
    });
    return () => {
      live = false;
    };
  }, [db, dataRevision]);

  const onPressSetExpenseTime = useCallback(() => {
    if (Platform.OS === "web" || busy) return;
    if (Platform.OS === "ios") {
      setIosDatePicker(true);
      return;
    }
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: expenseAt,
        mode: "date",
        onChange: (e: DateTimePickerEvent, d) => {
          if (e.type === "dismissed" || !d) return;
          const withDate = mergeDatePart(expenseAt, d);
          DateTimePickerAndroid.open({
            value: withDate,
            mode: "time",
            is24Hour: true,
            onChange: (e2: DateTimePickerEvent, timePicked) => {
              if (e2.type === "dismissed" || !timePicked) return;
              setExpenseAt(mergeTimePart(withDate, timePicked));
            },
          });
        },
      });
    }
  }, [busy, expenseAt]);

  const load = useCallback(async () => {
    const [groups, m, g, expenseData, profile] = await Promise.all([
      listGroups(db),
      listMembers(db, groupId),
      getGroup(db, groupId),
      expenseId ? getExpenseWithSplits(db, groupId, expenseId) : Promise.resolve(null),
      getLocalUserProfile(db),
    ]);

    setAllGroups(groups);
    setMembers(m);
    setMyAvatarUri(profile.avatarUri);
    const curCurrency = g?.currency ?? "USD";
    if (g) {
      setCurrency(g.currency);
      setGroupCurrency(g.currency);
      setGroupName(g.name);
    }

    if (expenseId) {
      if (!expenseData) {
        setInitialLoadPending(false);
        navigation.goBack();
        return;
      }
      const { expense, splits } = expenseData;
      setDescription(expense.description);
      setAmountText(minorToAmountInputString(expense.amount_minor, curCurrency));
      setPayerId(
        m.some((x) => x.id === expense.payer_id)
          ? expense.payer_id
          : (m[0]?.id ?? getLocalUserId()),
      );
      setCategory(expense.category);
      categoryManualRef.current = true;
      setExpenseAt(parseStoredExpenseToDate(expense.expense_date));
      
      // Detect the original split mode: if all members have equal owed amounts, it was an equal split
      const splitMap = new Map(splits.map((s) => [s.user_id, s.owed_minor]));
      const nonZeroAmounts = splits.map((s) => s.owed_minor).filter((a) => a > 0);
      const firstNonZeroAmount = nonZeroAmounts[0];
      const isEqualSplit = nonZeroAmounts.length > 0 && 
        nonZeroAmounts.every((amount) => amount === firstNonZeroAmount);
      setSplitMode(isEqualSplit ? "equal" : "exact");
      
      let memberSum = 0;
      const nextExact: Record<string, string> = {};
      for (const x of m) {
        const owed = splitMap.get(x.id) ?? 0;
        memberSum += owed;
        nextExact[x.id] = minorToAmountInputString(owed, curCurrency);
      }
      const remainder = expense.amount_minor - memberSum;
      if (remainder !== 0 && m.some((x) => x.id === expense.payer_id)) {
        const pid = expense.payer_id;
        const prevMinor = splitMap.get(pid) ?? 0;
        nextExact[pid] = minorToAmountInputString(prevMinor + remainder, curCurrency);
      }
      setExactText((prev) => {
        const merged = { ...prev };
        for (const x of m) merged[x.id] = nextExact[x.id] ?? "";
        return merged;
      });
      setEqualOn((prev) => {
        const next: Record<string, boolean> = {};
        for (const x of m) {
          // Include member if they have a non-zero owed amount in the saved split
          const owed = splitMap.get(x.id) ?? 0;
          next[x.id] = owed > 0;
        }
        return next;
      });
      setPercentText((prev) => {
        const next = { ...prev };
        for (const x of m) if (next[x.id] === undefined) next[x.id] = "";
        return next;
      });
      setSharesText((prev) => {
        const next = { ...prev };
        for (const x of m) if (next[x.id] === undefined) next[x.id] = "1";
        return next;
      });
      setAdjText((prev) => {
        const next = { ...prev };
        for (const x of m) if (next[x.id] === undefined) next[x.id] = "";
        return next;
      });
      setInitialLoadPending(false);
      return;
    }

    const memberIdsKeySorted = m.map((x) => x.id).sort().join("\n");
    const splitCtx = `${groupId}\n${memberIdsKeySorted}`;
    const sameSplitCtx = loadedNewExpenseSplitCtxRef.current === splitCtx;

    if (!sameSplitCtx) {
      loadedNewExpenseSplitCtxRef.current = splitCtx;
      categoryManualRef.current = false;
      setExpenseAt(new Date());
      setPayerId((prev) =>
        m.some((x) => x.id === prev) ? prev : (m[0]?.id ?? getLocalUserId()),
      );
      setEqualOn(() => {
        const next: Record<string, boolean> = {};
        for (const x of m) next[x.id] = true;
        return next;
      });
      setExactText(() => {
        const next: Record<string, string> = {};
        for (const x of m) next[x.id] = "";
        return next;
      });
      setPercentText(() => {
        const next: Record<string, string> = {};
        for (const x of m) next[x.id] = "";
        return next;
      });
      setSharesText(() => {
        const next: Record<string, string> = {};
        for (const x of m) next[x.id] = "1";
        return next;
      });
      setAdjText(() => {
        const next: Record<string, string> = {};
        for (const x of m) next[x.id] = "";
        return next;
      });
      return;
    }

    setPayerId((prev) =>
      m.some((x) => x.id === prev) ? prev : (m[0]?.id ?? getLocalUserId()),
    );
    setEqualOn((prev) => {
      const next: Record<string, boolean> = {};
      for (const x of m) next[x.id] = prev[x.id] ?? true;
      return next;
    });
    setExactText((prev) => {
      const next = { ...prev };
      for (const x of m) if (next[x.id] === undefined) next[x.id] = "";
      return next;
    });
    setPercentText((prev) => {
      const next = { ...prev };
      for (const x of m) if (next[x.id] === undefined) next[x.id] = "";
      return next;
    });
    setSharesText((prev) => {
      const next = { ...prev };
      for (const x of m) if (next[x.id] === undefined) next[x.id] = "1";
      return next;
    });
    setAdjText((prev) => {
      const next = { ...prev };
      for (const x of m) if (next[x.id] === undefined) next[x.id] = "";
      return next;
    });
    setInitialLoadPending(false);
  }, [db, groupId, expenseId, navigation]);

  useEffect(() => {
    setInitialLoadPending(Boolean(expenseId));
  }, [expenseId]);

  useEffect(() => {
    setAmountText((prev) => {
      const p = parseMoneyToMinor(prev, currency);
      return p !== null ? minorToAmountInputString(p, currency) : prev;
    });
  }, [currency]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const [deletingExpense, setDeletingExpense] = useState(false);

  const performDeleteExpense = useCallback(async () => {
    if (!expenseId) return;
    setDeletingExpense(true);
    try {
      await deleteExpense(db, groupId, expenseId);
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("groupDetail.cannotRemoveTitle");
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("groupDetail.cannotRemoveTitle"), msg);
      }
    } finally {
      setDeletingExpense(false);
    }
  }, [db, groupId, expenseId, navigation, t]);

  const confirmDeleteFromEditor = useCallback(() => {
    if (!expenseId) return;
    if (deletingExpense || busy) return;
    const d = description.trim() || t("aiReceipt.defaultDescription");
    const message = t("groupDetail.deleteExpenseMessage", { description: d });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(
        `${t("groupDetail.deleteExpenseTitle")}\n\n${message}`,
      )) {
        void performDeleteExpense();
      }
      return;
    }
    Alert.alert(t("groupDetail.deleteExpenseTitle"), message, [
      { text: t("friends.cancel"), style: "cancel" },
      {
        text: t("groupDetail.delete"),
        style: "destructive",
        onPress: () => void performDeleteExpense(),
      },
    ]);
  }, [deletingExpense, busy, description, expenseId, performDeleteExpense, t]);

  useLayoutEffect(() => {
    const displayName = groupName.trim() || t("groupDetail.titleFallback");
    const backLabel = t("nav.back");
    const deleteDisabled = deletingExpense || busy || !expenseId;

    if (expenseId) {
      navigation.setOptions({
        title: displayName,
        headerTitle: displayName,
        headerBackTitle: backLabel,
        headerRight: () => (
          <Pressable
            onPress={confirmDeleteFromEditor}
            disabled={deleteDisabled}
            hitSlop={10}
            style={({ pressed }) => (pressed && !deleteDisabled ? { opacity: 0.85 } : null)}
            accessibilityRole="button"
            accessibilityLabel={t("groupDetail.deleteExpenseA11y", { description: description.trim() || t("aiReceipt.defaultDescription") })}
          >
            <Ionicons
              name="trash-outline"
              size={22}
              color={deleteDisabled ? colors.muted : colors.owe}
            />
          </Pressable>
        ),
      });
      return;
    }

    navigation.setOptions({
      title: displayName,
      headerBackTitle: backLabel,
      headerRight: undefined,
      headerTitle: () => (
        <Pressable
          onPress={() => {
            if (allGroups.length <= 1 || busy) return;
            Keyboard.dismiss();
            setGroupPickerOpen(true);
          }}
          disabled={busy || allGroups.length <= 1}
          accessibilityRole={allGroups.length > 1 ? "button" : "text"}
          accessibilityLabel={`${t("nav.group")}: ${displayName}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            maxWidth: 280,
            justifyContent: "center",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 17,
              fontWeight: "600",
              color: colors.text,
              flexShrink: 1,
            }}
          >
            {displayName}
          </Text>
          {allGroups.length > 1 ? (
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          ) : (
            <Text style={styles.groupPickMeta}>{groupCurrency}</Text>
          )}
        </Pressable>
      ),
    });
  }, [
    navigation,
    groupName,
    t,
    expenseId,
    allGroups.length,
    busy,
    groupCurrency,
    colors.text,
    colors.muted,
    colors.owe,
    description,
    confirmDeleteFromEditor,
    deletingExpense,
    styles.groupPickMeta,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (expenseId) return;
      if (route.params.receiptPrefill) return;
      const id = setTimeout(() => titleInputRef.current?.focus(), 160);
      return () => clearTimeout(id);
    }, [expenseId, route.params.receiptPrefill]),
  );

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return [...CURRENCY_OPTIONS];
    return CURRENCY_OPTIONS.filter(
      (x) =>
        x.code.toLowerCase().includes(q) || x.label.toLowerCase().includes(q),
    );
  }, [currencySearch]);

  const openCurrencyPicker = useCallback(() => {
    if (busy) return;
    Keyboard.dismiss();
    setCurrencySearch("");
    setCurrencyPickerOpen(true);
  }, [busy]);

  const pickExpenseCurrency = useCallback((code: string) => {
    setCurrency(code);
    setCurrencyPickerOpen(false);
  }, []);

  const amountMinor = parseMoneyToMinor(amountText, currency);

  const memberIdsKey = useMemo(
    () => members.map((m) => m.id).join("\n"),
    [members],
  );

  /** Seed exact split from equal total only when every per-person field is still empty (new expense). */
  useEffect(() => {
    if (expenseId) return;
    if (splitMode !== "exact" || amountMinor === null || members.length === 0) {
      return;
    }
    setExactText((prev) => {
      const included = members.filter((m) => equalOn[m.id]);
      const allEmpty = included.every((m) => !(prev[m.id] ?? "").trim());
      if (!allEmpty) return prev;
      if (included.length === 0) return prev;
      const map = splitEqualMinor(
        amountMinor,
        included.map((m) => m.id),
      );
      const next = { ...prev };
      for (const m of members) {
        next[m.id] = equalOn[m.id]
          ? minorToAmountInputString(map.get(m.id) ?? 0, currency)
          : minorToAmountInputString(0, currency);
      }
      return next;
    });
  }, [expenseId, splitMode, amountMinor, memberIdsKey, currency, members, equalOn]);

  /** Fill missing percent slots only; keep values when switching split modes. */
  useEffect(() => {
    if (splitMode !== "percent" || members.length === 0) return;
    setPercentText((prev) => {
      const inc = members.filter((m) => equalOn[m.id]);
      const parts = equalIntegerPercents(inc.length);
      const next = { ...prev };
      let changed = false;
      members.forEach((m) => {
        if (!equalOn[m.id]) {
          if ((next[m.id] ?? "") !== "0") {
            next[m.id] = "0";
            changed = true;
          }
          return;
        }
        const idx = inc.findIndex((x) => x.id === m.id);
        const cur = prev[m.id];
        if (cur === undefined || cur === "") {
          next[m.id] = String(parts[idx] ?? 0);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [splitMode, memberIdsKey, members, equalOn]);

  /** Default share counts for new members only; do not reset when changing split mode. */
  useEffect(() => {
    if (members.length === 0) return;
    setSharesText((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of members) {
        if (!equalOn[m.id]) {
          if ((next[m.id] ?? "") !== "0") {
            next[m.id] = "0";
            changed = true;
          }
          continue;
        }
        if (next[m.id] === undefined || next[m.id] === "") {
          next[m.id] = "1";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [memberIdsKey, members, equalOn]);

  const amountFieldPlaceholder = minorToAmountInputString(0, currency);

  const validationErrorKey = useMemo((): string | null => {
    if (amountMinor === null || members.length === 0) return null;
    if (splitMode === "equal") {
      const sel = members.filter((m) => equalOn[m.id]);
      if (sel.length === 0) return "addExpense.errSelectSplit";
      return null;
    }
    if (splitMode === "exact") {
      const sel = members.filter((m) => equalOn[m.id]);
      if (sel.length === 0) return "addExpense.errSelectSplit";
      let sum = 0;
      for (const m of members) {
        if (!equalOn[m.id]) {
          const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
          if (v === null) {
            if ((exactText[m.id] ?? "").trim() !== "") {
              return "addExpense.errExactEach";
            }
            continue;
          }
          if (v !== 0) return "addExpense.errExactEach";
          continue;
        }
        const raw = (exactText[m.id] ?? "").trim();
        if (raw === "") {
          sum += 0;
          continue;
        }
        const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
        if (v === null) return "addExpense.errExactEach";
        sum += v;
      }
      if (sum !== amountMinor) return "addExpense.errExactSum";
      return null;
    }
    if (splitMode === "percent") {
      const sel = members.filter((m) => equalOn[m.id]);
      if (sel.length === 0) return "addExpense.errSelectSplit";
      let sum = 0;
      for (const m of members) {
        const raw = (percentText[m.id] ?? "").trim();
        const n = Number.parseInt(raw, 10);
        if (!equalOn[m.id]) {
          if (!Number.isFinite(n) || n !== 0) {
            return "addExpense.errPercentRange";
          }
          continue;
        }
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return "addExpense.errPercentRange";
        }
        sum += n;
      }
      if (sum !== 100) return "addExpense.errPercentSum";
      return null;
    }
    if (splitMode === "shares") {
      const sel = members.filter((m) => equalOn[m.id]);
      if (sel.length === 0) return "addExpense.errSelectSplit";
      let sum = 0;
      for (const m of members) {
        const raw = (sharesText[m.id] ?? "").trim();
        const n = Number.parseInt(raw, 10);
        if (!equalOn[m.id]) {
          if (!Number.isFinite(n) || n !== 0) {
            return "addExpense.errSharesPositive";
          }
          continue;
        }
        if (!Number.isFinite(n) || n <= 0) {
          return "addExpense.errSharesPositive";
        }
        sum += n;
      }
      if (sum <= 0) return "addExpense.errSharesSum";
      return null;
    }
    if (splitMode === "adjust") {
      const sel = members.filter((m) => equalOn[m.id]);
      if (sel.length === 0) return "addExpense.errSelectSplit";
      let adjSum = 0;
      for (const m of sel) {
        const v = parseSignedMoneyToMinor(adjText[m.id] ?? "", currency);
        if (v === null) return "addExpense.errAdjEach";
        adjSum += v;
      }
      if (adjSum !== 0) return "addExpense.errAdjSum";
      return null;
    }
    return null;
  }, [
    amountMinor,
    currency,
    members,
    splitMode,
    equalOn,
    exactText,
    percentText,
    sharesText,
    adjText,
  ]);

  const exactRemainingMinor = useMemo(() => {
    if (splitMode !== "exact" || amountMinor === null) return null;
    let allValid = true;
    let sum = 0;
    for (const m of members) {
      if (!equalOn[m.id]) continue;
      const raw = (exactText[m.id] ?? "").trim();
      if (raw === "") {
        sum += 0;
        continue;
      }
      const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
      if (v === null) {
        allValid = false;
        break;
      }
      sum += v;
    }
    if (!allValid) return null;
    return amountMinor - sum;
  }, [splitMode, amountMinor, members, exactText, currency, equalOn]);

  const validationError = useMemo((): string | null => {
    if (!validationErrorKey) return null;
    // Exact split: sum gap is "Remaining: …"; empty fields count as 0 — no "Enter a valid amount…" line.
    if (validationErrorKey === "addExpense.errExactSum") return null;
    if (validationErrorKey === "addExpense.errExactEach" && splitMode === "exact")
      return null;
    return t(validationErrorKey);
  }, [validationErrorKey, splitMode, t]);

  const canSave =
    Boolean(description.trim()) &&
    amountMinor !== null &&
    amountMinor > 0 &&
    !busy &&
    members.length > 0 &&
    validationErrorKey === null;

  const buildOwedMap = (): Map<string, number> => {
    if (amountMinor === null) throw new Error("Invalid amount");
    if (splitMode === "adjust") {
      const ids = members.filter((m) => equalOn[m.id]).map((m) => m.id);
      const adj = new Map<string, number>();
      for (const id of ids) {
        adj.set(id, parseSignedMoneyToMinor(adjText[id] ?? "", currency) ?? 0);
      }
      return splitEqualWithAdjustmentsMinor(amountMinor, ids, adj);
    }
    if (splitMode === "equal") {
      const ids = members.filter((m) => equalOn[m.id]).map((m) => m.id);
      return splitEqualMinor(amountMinor, ids);
    }
    if (splitMode === "exact") {
      const parts = members.map((m) => ({
        userId: m.id,
        minor: equalOn[m.id]
          ? (parseMoneyToMinor(exactText[m.id] ?? "", currency) ?? 0)
          : 0,
      }));
      return splitExactMinor(amountMinor, parts);
    }
    if (splitMode === "percent") {
      const parts = members.map((m) => ({
        userId: m.id,
        percent: equalOn[m.id]
          ? Number.parseInt((percentText[m.id] ?? "").trim(), 10)
          : 0,
      }));
      return splitPercentMinor(amountMinor, parts);
    }
    const included = members.filter((m) => equalOn[m.id]);
    const shareParts = included.map((m) => ({
      userId: m.id,
      shares: Number.parseInt((sharesText[m.id] ?? "").trim(), 10),
    }));
    const shareMap = splitSharesMinor(amountMinor, shareParts);
    const out = new Map<string, number>();
    for (const m of members) {
      out.set(m.id, shareMap.get(m.id) ?? 0);
    }
    return out;
  };

  /**
   * Equal/adjust row amounts: updates as soon as total or selection changes,
   * without waiting on unrelated validation (e.g. description).
   */
  const liveEqualAdjustShares = useMemo(() => {
    if (amountMinor === null || members.length === 0) return null;
    if (splitMode !== "equal" && splitMode !== "adjust") return null;
    const ids = members.filter((m) => equalOn[m.id]).map((m) => m.id);
    if (ids.length === 0) return null;
    try {
      if (splitMode === "equal") {
        return splitEqualMinor(amountMinor, ids);
      }
      const adj = new Map<string, number>();
      for (const id of ids) {
        adj.set(id, parseSignedMoneyToMinor(adjText[id] ?? "", currency) ?? 0);
      }
      return splitEqualWithAdjustmentsMinor(amountMinor, ids, adj);
    } catch {
      return null;
    }
  }, [amountMinor, members, splitMode, equalOn, adjText, currency]);

  const liveExactMoney = useMemo(() => {
    if (amountMinor === null || members.length === 0 || splitMode !== "exact") {
      return null;
    }
    let sum = 0;
    const minors: { userId: string; minor: number }[] = [];
    for (const m of members) {
      if (!equalOn[m.id]) {
        minors.push({ userId: m.id, minor: 0 });
        continue;
      }
      const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
      if (v === null) {
        const inc = members.filter((x) => equalOn[x.id]).map((x) => x.id);
        if (inc.length === 0) return null;
        return splitEqualMinor(amountMinor, inc);
      }
      minors.push({ userId: m.id, minor: v });
      sum += v;
    }
    if (sum === amountMinor) {
      return new Map(minors.map((p) => [p.userId, p.minor]));
    }
    const inc = members.filter((x) => equalOn[x.id]).map((x) => x.id);
    if (inc.length === 0) return null;
    return splitEqualMinor(amountMinor, inc);
  }, [amountMinor, members, splitMode, exactText, currency, equalOn]);

  const livePercentMoney = useMemo(() => {
    if (amountMinor === null || members.length === 0 || splitMode !== "percent") {
      return null;
    }
    try {
      const parts = members.map((m) => ({
        userId: m.id,
        percent: equalOn[m.id]
          ? Number.parseInt((percentText[m.id] ?? "").trim(), 10)
          : 0,
      }));
      if (parts.some((p) => !Number.isFinite(p.percent) || p.percent < 0)) {
        throw new Error("invalid");
      }
      return splitPercentMinor(amountMinor, parts);
    } catch {
      try {
        const inc = members.filter((m) => equalOn[m.id]);
        const n = inc.length;
        if (n === 0) return null;
        const eq = equalIntegerPercents(n);
        const parts = members.map((m) => {
          const idx = inc.findIndex((x) => x.id === m.id);
          return {
            userId: m.id,
            percent:
              equalOn[m.id] && idx >= 0 ? (eq[idx] ?? 0) : 0,
          };
        });
        return splitPercentMinor(amountMinor, parts);
      } catch {
        return null;
      }
    }
  }, [amountMinor, members, splitMode, percentText, currency, equalOn]);

  const liveSharesMoney = useMemo(() => {
    if (amountMinor === null || members.length === 0 || splitMode !== "shares") {
      return null;
    }
    try {
      const included = members.filter((m) => equalOn[m.id]);
      if (included.length === 0) return null;
      const sharesInvalid = included.some((m) => {
        const n = Number.parseInt((sharesText[m.id] ?? "").trim(), 10);
        return !Number.isFinite(n) || n <= 0;
      });
      if (sharesInvalid) {
        return splitSharesMinor(
          amountMinor,
          included.map((m) => ({ userId: m.id, shares: 1 })),
        );
      }
      const shareParts = included.map((m) => ({
        userId: m.id,
        shares: Number.parseInt((sharesText[m.id] ?? "").trim(), 10),
      }));
      const inner = splitSharesMinor(amountMinor, shareParts);
      const out = new Map<string, number>();
      for (const m of members) {
        out.set(m.id, inner.get(m.id) ?? 0);
      }
      return out;
    } catch {
      return null;
    }
  }, [amountMinor, members, splitMode, sharesText, currency, equalOn]);

  const save = async () => {
    if (busy || !canSave || amountMinor === null) return;
    setBusy(true);
    try {
      let owed: Map<string, number>;
      try {
        owed = buildOwedMap();
      } catch {
        setBusy(false);
        return;
      }
      if (expenseId) {
        await updateExpenseWithSplits(db, groupId, expenseId, {
          description,
          amountMinor,
          payerId,
          expenseDate: formatLocalDateTimeForInput(expenseAt),
          owedByUserId: owed,
          category,
        });
      } else {
        await addExpenseWithSplits(db, groupId, {
          description,
          amountMinor,
          payerId,
          expenseDate: formatLocalDateTimeForInput(expenseAt),
          owedByUserId: owed,
          category,
        });
      }
      if (Platform.OS !== "web") {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        } catch {
          /* optional */
        }
      }
      if (expenseId) {
        navigation.goBack();
        return;
      }
      const savedGroupId = groupId;
      const navState = navigation.getState();
      const idx = navState?.index ?? 0;
      const routes = navState?.routes ?? [];
      const prev = idx > 0 ? routes[idx - 1] : undefined;
      const prevGid =
        prev?.name === "GroupDetail" &&
        prev.params &&
        typeof prev.params === "object" &&
        "groupId" in prev.params
          ? String((prev.params as { groupId: string }).groupId)
          : undefined;
      if (prev?.name === "GroupDetail" && prevGid === savedGroupId) {
        navigation.goBack();
      } else {
        navigation.replace("GroupDetail", { groupId: savedGroupId });
      }
    } finally {
      setBusy(false);
    }
  };

  const numpadCtx = useNumpadDoneAccessoryContext();
  const categoryHScroll = useWebHorizontalWheelScroll();
  const splitToolbarHScroll = useWebHorizontalWheelScroll();
  const payerHScroll = useWebHorizontalWheelScroll();
  const allowMoneyDecimals = currencyMinorExponent(currency) > 0;
  const insertAmountDecimal = useCallback(() => {
    setAmountText((prev) =>
      applyDecimalSeparatorToAmountInput(prev, currency),
    );
  }, [currency]);

  const clearSpuriousAmountFocusFill = useCallback(() => {
    if (!amountFocusTransferredFromTitleRef.current) return;
    amountFocusTransferredFromTitleRef.current = false;
    setAmountText("");
    amountInputRef.current?.setNativeProps?.({ text: "" });
  }, []);

  const amountTextOnChange = useCallback(
    (text: string) => {
      setAmountText((prev) => {
        const next = stripImeSpuriousZeroDotAfterFocus(
          prev,
          formatUnsignedMoneyInputDisplay(text, currency),
        );
        return next;
      });
    },
    [currency],
  );

  const amountNumpadProps = useNumpadDoneInputProps({
    onFocus: () => {
      clearSpuriousAmountFocusFill();
      scheduleCaretToEnd(amountInputRef, 0);
    },
    ...(allowMoneyDecimals ? { onDecimalInsert: insertAmountDecimal } : {}),
  });

  const toggleMemberIncluded = useCallback(
    (memberId: string) => {
      setEqualOn((prev) => {
        const nextIncluded = !prev[memberId];
        if (!nextIncluded) {
          setExactText((e) => ({
            ...e,
            [memberId]: minorToAmountInputString(0, currency),
          }));
          setPercentText((e) => ({ ...e, [memberId]: "0" }));
          setSharesText((e) => ({ ...e, [memberId]: "0" }));
        }
        return { ...prev, [memberId]: nextIncluded };
      });
    },
    [currency],
  );

  const wide = windowWidth >= WIDE_LAYOUT;
  const splitModeKeys = useMemo(
    (): SplitMode[] => ["equal", "exact", "percent", "shares", "adjust"],
    [],
  );
  const percentApprox =
    members.length > 0 ? (100 / members.length).toFixed(2) : "—";

  const onSelectGroupFromModal = useCallback(
    (g: GroupRow) => {
      setGroupPickerOpen(false);
      if (g.id !== groupId) navigation.setParams({ groupId: g.id });
    },
    [groupId, navigation],
  );

  if (expenseId && initialLoadPending) {
    return (
      <View
        style={[
          styles.flex,
          { alignItems: "center", justifyContent: "center", padding: 24 },
        ]}
      >
        <ActivityIndicator size="small" color={colors.muted} />
        <View style={{ height: 10 }} />
        <Text style={{ color: colors.muted }}>
          {t("addExpense.loadingExpense")}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.addRoot}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <TextInput
            ref={titleInputRef}
            style={styles.heroTitle}
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              if (expenseId || categoryManualRef.current) return;
              setCategory(guessCategoryFromTitle(text));
            }}
            placeholder={t("addExpense.placeholderDescription")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              amountFocusTransferredFromTitleRef.current = true;
              amountInputRef.current?.focus();
            }}
            editable={!busy}
            inputAccessoryViewID={keyboardAccessoryId}
          />
          <View style={styles.amountRow}>
            <View style={styles.amountInputWrap}>
              <TextInput
                ref={amountInputRef}
                style={[styles.bigAmount, { fontSize: amountHeroFontSize }]}
                value={amountText}
                onChangeText={amountTextOnChange}
                placeholder={amountFieldPlaceholder}
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                {...(Platform.OS === "web" && allowMoneyDecimals
                  ? ({ inputMode: "decimal" } as Record<string, string>)
                  : {})}
                {...amountNumpadProps}
                scrollEnabled
                multiline={false}
                editable={!busy}
              />
            </View>
            <Pressable
              onPress={openCurrencyPicker}
              style={({ pressed }) => [
                styles.currencyToggle,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${t("addExpense.currencyModalTitle")}: ${currency}`}
            >
              <Text style={styles.currencyToggleText}>{currency}</Text>
            </Pressable>
          </View>
          <ScrollView
            ref={categoryHScroll.ref}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.catRowScroll}
            contentContainerStyle={styles.catScrollInner}
            onScroll={categoryHScroll.onScroll}
            scrollEventThrottle={16}
            {...(Platform.OS === "web"
              ? { onWheel: categoryHScroll.onWheel }
              : {})}
          >
            {categoryOptions.map((c) => {
              const on = category === c.key;
              const iconColor = on ? colors.primary : colors.muted;
              return (
                <Pressable
                  key={c.key === null ? "g" : c.key}
                  style={[styles.catChip, on && styles.catChipOn]}
                  onPress={() => {
                    categoryManualRef.current = true;
                    setCategory(c.key);
                  }}
                  accessibilityLabel={c.label}
                >
                  <Ionicons
                    name={categoryIconName(c.key)}
                    size={18}
                    color={iconColor}
                  />
                  <Text
                    style={[
                      styles.catChipText,
                      on && styles.catChipTextOn,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.logicSpacer} />
        {Platform.OS === "web" ? (
          <View style={styles.webDatetimeRow}>
            {createElement("input", {
              "aria-label": t("addExpense.date"),
              type: "datetime-local",
              disabled: busy,
              value: formatLocalDateTimeForInput(expenseAt),
              onChange: (e: { currentTarget: { value: string } }) => {
                const v = e.currentTarget.value;
                if (v) {
                  const p = new Date(v);
                  if (!Number.isNaN(p.getTime())) {
                    setExpenseAt(p);
                  }
                }
              },
              style: {
                width: "100%",
                boxSizing: "border-box",
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: 12,
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.surface,
                opacity: busy ? 0.5 : 1,
              },
            } as any)}
          </View>
        ) : (
          <>
            <Pressable
              onPress={onPressSetExpenseTime}
              style={({ pressed }) => [
                styles.input,
                styles.dateTimeRow,
                busy && styles.disabled,
                pressed && !busy && styles.pressed,
              ]}
              disabled={busy}
              accessibilityLabel={`${t("addExpense.date")} ${expenseAtLabel}`}
            >
              <Text
                style={styles.dateTimeValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {expenseAtLabel}
              </Text>
              <Text style={styles.dateTimeChev}>›</Text>
            </Pressable>
            {Platform.OS === "ios" && (
              <Modal
                visible={iosDatePicker}
                transparent
                animationType="none"
                onRequestClose={() => setIosDatePicker(false)}
              >
                <View style={styles.iosModalBase}>
                  <Pressable
                    style={styles.iosDim}
                    onPress={() => setIosDatePicker(false)}
                    accessibilityLabel={t("addExpense.cancel")}
                  />
                  <View style={styles.iosSheet}>
                    <View style={styles.iosTopBar}>
                      <Pressable
                        onPress={() => setIosDatePicker(false)}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityLabel={t("createGroup.done")}
                      >
                        <Text style={styles.iosModalDone}>
                          {t("createGroup.done")}
                        </Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={expenseAt}
                      mode="datetime"
                      display="spinner"
                      onChange={(_e, d) => {
                        if (d) setExpenseAt(d);
                      }}
                      textColor={colors.text}
                      themeVariant={
                        resolvedScheme === "dark" ? "dark" : "light"
                      }
                    />
                  </View>
                </View>
              </Modal>
            )}
          </>
        )}

        <View style={styles.logicSpacer} />

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t("addExpense.payerAndSplit")}</Text>
          <ScrollView
            ref={splitToolbarHScroll.ref}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.splitToolbarScroll}
            contentContainerStyle={styles.splitToolbarInner}
            onScroll={splitToolbarHScroll.onScroll}
            scrollEventThrottle={16}
            {...(Platform.OS === "web"
              ? { onWheel: splitToolbarHScroll.onWheel }
              : {})}
          >
            {splitModeKeys.map((modeKey) => {
              const active = splitMode === modeKey;
              const iconColor = active ? colors.primary : colors.muted;
              return (
                <Pressable
                  key={modeKey}
                  style={[styles.toolBtn, active && styles.toolBtnOn]}
                  onPress={() => setSplitMode(modeKey)}
                >
                  <Ionicons
                    name={SPLIT_MODE_ICONS[modeKey]}
                    size={20}
                    color={iconColor}
                  />
                  <Text
                    style={[
                      styles.toolBtnLabel,
                      active && styles.toolBtnLabelOn,
                    ]}
                    numberOfLines={1}
                  >
                    {modeKey === "equal"
                      ? t("addExpense.toolEqual")
                      : modeKey === "exact"
                        ? t("addExpense.toolExact")
                        : modeKey === "percent"
                          ? t("addExpense.toolPercent")
                          : modeKey === "shares"
                            ? t("addExpense.toolShares")
                            : t("addExpense.toolAdj")}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.splitModeTitle}>{splitLabels[splitMode]}</Text>

          <ScrollView
            ref={payerHScroll.ref}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.payerScroll}
            contentContainerStyle={styles.payerScrollInner}
            onScroll={payerHScroll.onScroll}
            scrollEventThrottle={16}
            {...(Platform.OS === "web"
              ? { onWheel: payerHScroll.onWheel }
              : {})}
          >
            {members.map((m) => {
              const isPayer = payerId === m.id;
              const included = equalOn[m.id];

              let underSquare: ReactNode = null;
              if (splitMode === "equal") {
                const eqMap = liveEqualAdjustShares;
                underSquare =
                  included && eqMap ? (
                    <Text
                      style={[
                        styles.personTileAmount,
                        isPayer && styles.personTileAmountPayer,
                      ]}
                      numberOfLines={1}
                    >
                      {formatMinor(eqMap.get(m.id) ?? 0, currency)}
                    </Text>
                  ) : (
                    <Text style={styles.personTileAmountMuted}>—</Text>
                  );
              } else if (splitMode === "adjust") {
                underSquare = !included ? (
                  <Text style={styles.personTileAmountMuted}>—</Text>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.personTileAmount,
                        isPayer && styles.personTileAmountPayer,
                      ]}
                      numberOfLines={1}
                    >
                      {liveEqualAdjustShares
                        ? formatMinor(
                            liveEqualAdjustShares.get(m.id) ?? 0,
                            currency,
                          )
                        : "—"}
                    </Text>
                    <TextInput
                      ref={(r) => {
                        splitNumericInputRefs.current[`adj:${m.id}`] = r;
                      }}
                      style={[
                        styles.personTileAdjInput,
                        isPayer && styles.personTileInputPayer,
                      ]}
                      value={adjText[m.id] ?? ""}
                      onChangeText={(text) =>
                        setAdjText((prev) => {
                          const p = prev[m.id] ?? "";
                          return {
                            ...prev,
                            [m.id]: stripImeSpuriousZeroDotAfterFocus(
                              p,
                              formatSignedMoneyInputDisplay(text, currency),
                            ),
                          };
                        })
                      }
                      keyboardType="decimal-pad"
                      {...(Platform.OS === "web" && allowMoneyDecimals
                        ? ({ inputMode: "decimal" } as Record<string, string>)
                        : {})}
                      {...buildNumpadDoneInputProps(numpadCtx, {
                        onFocus: () => {
                          const len = (adjText[m.id] ?? "").length;
                          requestAnimationFrame(() =>
                            scheduleCaretToEndOnInput(
                              splitNumericInputRefs.current[`adj:${m.id}`] ??
                                null,
                              len,
                            ),
                          );
                        },
                        ...(allowMoneyDecimals
                          ? {
                              onDecimalInsert: () =>
                                setAdjText((prev) => {
                                  const cur = prev[m.id] ?? "";
                                  if (!cur.trim()) {
                                    return {
                                      ...prev,
                                      [m.id]: applyDecimalSeparatorToAmountInput(
                                        "",
                                        currency,
                                      ),
                                    };
                                  }
                                  return {
                                    ...prev,
                                    [m.id]: formatSignedMoneyInputDisplay(
                                      `${cur}.`,
                                      currency,
                                    ),
                                  };
                                }),
                            }
                          : {}),
                      })}
                      multiline={false}
                      placeholder={amountFieldPlaceholder}
                      placeholderTextColor={colors.muted}
                      editable={!busy}
                    />
                  </>
                );
              } else if (splitMode === "exact") {
                underSquare = !included ? (
                  <Text style={styles.personTileAmountMuted}>—</Text>
                ) : (
                  <TextInput
                    ref={(r) => {
                      splitNumericInputRefs.current[`exact:${m.id}`] = r;
                    }}
                    style={[
                      styles.personTileInput,
                      isPayer && styles.personTileInputPayer,
                    ]}
                    value={exactText[m.id] ?? ""}
                    onChangeText={(text) =>
                      setExactText((prev) => {
                        const p = prev[m.id] ?? "";
                        return {
                          ...prev,
                          [m.id]: stripImeSpuriousZeroDotAfterFocus(
                            p,
                            formatUnsignedMoneyInputDisplay(text, currency),
                          ),
                        };
                      })
                    }
                    keyboardType="decimal-pad"
                    {...(Platform.OS === "web" && allowMoneyDecimals
                      ? ({ inputMode: "decimal" } as Record<string, string>)
                      : {})}
                    {...buildNumpadDoneInputProps(numpadCtx, {
                      onFocus: () => {
                        const len = (exactText[m.id] ?? "").length;
                        requestAnimationFrame(() =>
                          scheduleCaretToEndOnInput(
                            splitNumericInputRefs.current[`exact:${m.id}`] ??
                              null,
                            len,
                          ),
                        );
                      },
                      ...(allowMoneyDecimals
                        ? {
                            onDecimalInsert: () =>
                              setExactText((prev) => ({
                                ...prev,
                                [m.id]: applyDecimalSeparatorToAmountInput(
                                  prev[m.id] ?? "",
                                  currency,
                                ),
                              })),
                          }
                        : {}),
                    })}
                    multiline={false}
                    placeholder={amountFieldPlaceholder}
                    placeholderTextColor={colors.muted}
                    editable={!busy}
                  />
                );
              } else if (splitMode === "percent") {
                underSquare = !included ? (
                  <Text style={styles.personTileAmountMuted}>0%</Text>
                ) : (
                  <>
                    <View style={styles.tilePercentRow}>
                      <TextInput
                        ref={(r) => {
                          splitNumericInputRefs.current[`percent:${m.id}`] = r;
                        }}
                        style={[
                          styles.personTileInputFlex,
                          isPayer && styles.personTileInputPayer,
                        ]}
                        value={percentText[m.id] ?? ""}
                        onChangeText={(text) =>
                          setPercentText((prev) => ({ ...prev, [m.id]: text }))
                        }
                        keyboardType="number-pad"
                        {...buildNumpadDoneInputProps(numpadCtx, {
                          onFocus: () => {
                            const len = (percentText[m.id] ?? "").length;
                            requestAnimationFrame(() =>
                              scheduleCaretToEndOnInput(
                                splitNumericInputRefs.current[
                                  `percent:${m.id}`
                                ] ?? null,
                                len,
                              ),
                            );
                          },
                        })}
                        multiline={false}
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                        editable={!busy}
                      />
                      <Text style={styles.pctSuffix}>%</Text>
                    </View>
                    {livePercentMoney ? (
                      <Text style={styles.personTileSubMoney} numberOfLines={1}>
                        {formatMinor(
                          livePercentMoney.get(m.id) ?? 0,
                          currency,
                        )}
                      </Text>
                    ) : null}
                  </>
                );
              } else {
                underSquare = !included ? (
                  <Text style={styles.personTileAmountMuted}>—</Text>
                ) : (
                  <>
                    <TextInput
                      ref={(r) => {
                        splitNumericInputRefs.current[`shares:${m.id}`] = r;
                      }}
                      style={[
                        styles.personTileInput,
                        isPayer && styles.personTileInputPayer,
                      ]}
                      value={sharesText[m.id] ?? ""}
                      onChangeText={(text) =>
                        setSharesText((prev) => ({ ...prev, [m.id]: text }))
                      }
                      keyboardType="number-pad"
                      {...buildNumpadDoneInputProps(numpadCtx, {
                        onFocus: () => {
                          const len = (sharesText[m.id] ?? "").length;
                          requestAnimationFrame(() =>
                            scheduleCaretToEndOnInput(
                              splitNumericInputRefs.current[`shares:${m.id}`] ??
                                null,
                              len,
                            ),
                          );
                        },
                      })}
                      multiline={false}
                      placeholder="1"
                      placeholderTextColor={colors.muted}
                      editable={!busy}
                    />
                    {liveSharesMoney ? (
                      <Text style={styles.personTileSubMoney} numberOfLines={1}>
                        {formatMinor(
                          liveSharesMoney.get(m.id) ?? 0,
                          currency,
                        )}
                      </Text>
                    ) : null}
                  </>
                );
              }

              const cardStyle = [
                styles.personTilePress,
                isPayer && styles.personTilePressPayer,
                !isPayer && !included && styles.personTilePressOut,
              ];

              return (
                  <View key={m.id} style={styles.personTileWrap}>
                    <View style={[cardStyle, styles.personTilePressFill]}>
                      <Pressable
                        style={styles.avatarTap}
                        onPress={() => setPayerId(m.id)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isPayer
                            ? `${m.name}, ${t("addExpense.paidBadge")}`
                            : t("addExpense.a11yAvatarTapPayer", {
                                name: m.name,
                              })
                        }
                        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                      >
                        <View
                          style={[
                            styles.avatarCircle,
                            isPayer && styles.avatarPayerRing,
                          ]}
                        >
                          {m.id === myId && myAvatarUri ? (
                            <Image
                              source={{ uri: myAvatarUri }}
                              style={{ width: 52, height: 52 }}
                              accessibilityIgnoresInvertColors
                            />
                          ) : (
                            <Text style={styles.avatarLetter}>
                              {initial(m.name)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.paidBadgeSlot}>
                          {isPayer ? (
                            <View style={styles.paidBadgePill}>
                              <Ionicons
                                name="wallet-outline"
                                size={15}
                                color="#fff"
                              />
                              <Text style={styles.paidBadgePillText}>
                                {t("addExpense.paidBadge")}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                      <Pressable
                        style={styles.tileBodyTap}
                        onPress={() => toggleMemberIncluded(m.id)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: included }}
                        accessibilityLabel={`${m.name}, ${
                          included
                            ? t("addExpense.a11yIncluded")
                            : t("addExpense.a11yNotIncluded")
                        } ${t("addExpense.inSplit")}`}
                      >
                        <Text
                          style={[
                            styles.avatarName,
                            isPayer && styles.avatarNameOn,
                          ]}
                          numberOfLines={1}
                        >
                          {m.name}
                        </Text>
                        <View
                          style={[
                            styles.inclusionRow,
                            included
                              ? styles.inclusionRowOn
                              : styles.inclusionRowOff,
                          ]}
                        >
                          <View style={styles.inclusionIconSlot}>
                            <Ionicons
                              name={
                                included
                                  ? "checkmark-circle"
                                  : "ellipse-outline"
                              }
                              size={20}
                              color={
                                included ? colors.primary : colors.muted
                              }
                            />
                          </View>
                          <Text
                            style={[
                              styles.inclusionRowLabel,
                              included
                                ? styles.inclusionRowLabelOn
                                : styles.inclusionRowLabelOff,
                            ]}
                            numberOfLines={1}
                          >
                            {included
                              ? t("addExpense.inSplitShort")
                              : t("addExpense.outOfSplitShort")}
                          </Text>
                        </View>
                      </Pressable>
                      <View style={styles.personTileUnderArea}>
                        {underSquare}
                      </View>
                    </View>
                  </View>
                );
            })}
          </ScrollView>

          {splitMode === "exact" && exactRemainingMinor !== null ? (
            <Text
              style={[
                styles.exactRemainLine,
                exactRemainingMinor === 0
                  ? styles.exactRemainOk
                  : styles.exactRemainNeed,
              ]}
              numberOfLines={2}
            >
              {t("addExpense.exactRemaining", {
                amount: formatMinor(exactRemainingMinor, currency),
              })}
            </Text>
          ) : null}

          <View style={styles.splitHintsBelow}>
            {splitMode === "adjust" ? (
              <Text style={styles.hint}>{t("addExpense.adjustHint")}</Text>
            ) : null}
            <View style={styles.hintHelpBlock}>
              <View style={styles.hintHelpRow}>
                <Ionicons
                  name="person-circle-outline"
                  size={16}
                  color={colors.muted}
                  style={styles.hintHelpIcon}
                />
                <Text style={styles.hintHelpText}>
                  {t("addExpense.splitHelpPayerLine")}
                </Text>
              </View>
              <View style={styles.hintHelpRow}>
                <Ionicons
                  name="checkbox-outline"
                  size={16}
                  color={colors.muted}
                  style={styles.hintHelpIcon}
                />
                <Text style={styles.hintHelpText}>
                  {t("addExpense.splitHelpIncludeLine")}
                </Text>
              </View>
            </View>
            {splitMode === "percent" ? (
              <Text style={styles.hint}>
                {t("addExpense.percentHint", { pct: percentApprox })}
              </Text>
            ) : null}
            {splitMode === "shares" ? (
              <Text style={styles.hint}>{t("addExpense.sharesHint")}</Text>
            ) : null}
          </View>

          {validationError ? (
            <Text style={styles.errText}>{validationError}</Text>
          ) : null}
        </View>

      </ScrollView>
        <Modal
          visible={groupPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setGroupPickerOpen(false)}
        >
          <View style={styles.groupModalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setGroupPickerOpen(false)}
              accessibilityLabel={t("addExpense.cancel")}
            />
            <View
              style={[
                styles.groupModalSheet,
                { paddingBottom: Math.max(12, insets.bottom) },
              ]}
            >
              <Text style={styles.groupModalTitle}>
                {t("addExpense.chooseGroup")}
              </Text>
              <FlatList
                data={allGroups}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const on = item.id === groupId;
                  return (
                    <Pressable
                      style={[styles.groupModalRow, on && styles.groupModalRowOn]}
                      onPress={() => onSelectGroupFromModal(item)}
                    >
                      <Text style={styles.groupModalRowText} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.groupPickMeta}>{item.currency}</Text>
                      {on ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={colors.primary}
                        />
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            </View>
          </View>
        </Modal>
        <Modal
          visible={currencyPickerOpen}
          animationType="slide"
          onRequestClose={() => setCurrencyPickerOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.currencyModalRoot}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.currencyModalHeader}>
              <Pressable onPress={() => setCurrencyPickerOpen(false)} hitSlop={12}>
                <Ionicons
                  name={isRTL ? "chevron-forward" : "chevron-back"}
                  size={24}
                  color={colors.text}
                />
              </Pressable>
              <Text style={styles.currencyModalTitle}>
                {t("addExpense.currencyModalTitle")}
              </Text>
              <Pressable onPress={() => setCurrencyPickerOpen(false)} hitSlop={12}>
                <Text style={styles.currencyModalDone}>
                  {t("addExpense.currencyModalDone")}
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, styles.currencySearchField]}
              value={currencySearch}
              onChangeText={setCurrencySearch}
              placeholder={t("addExpense.currencySearchPlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              inputAccessoryViewID={keyboardAccessoryId}
            />
            <KeyboardDismissButton colors={colors} isRTL={isRTL} style={{ marginBottom: 12 }} />
            <FlatList
              style={styles.currencyFlatList}
              data={filteredCurrencies}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.currencyRow,
                    item.code === currency.trim().toUpperCase() &&
                      styles.currencyRowSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => pickExpenseCurrency(item.code)}
                >
                  <Text style={styles.currencyRowCode}>{item.code}</Text>
                  <Text style={styles.currencyRowLabel}>{item.label}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.currencyEmpty}>
                  {t("addExpense.currencyEmpty")}
                </Text>
              }
            />
          </KeyboardAvoidingView>
        </Modal>
        <View
          style={[
            styles.footerRow,
            styles.footerRowShadow,
            { paddingBottom: Math.max(20, 12 + insets.bottom) },
          ]}
        >
          <AppButton
            variant="secondary"
            label={t("addExpense.cancel")}
            onPress={() => navigation.goBack()}
            disabled={busy}
            style={[styles.secondaryNav, styles.footerBtn]}
            textStyle={styles.secondaryNavText}
          />
          <AppButton
            variant="primary"
            label={busy ? t("addExpense.saving") : t("addExpense.save")}
            onPress={save}
            disabled={!canSave}
            style={[styles.primaryBtn, styles.footerBtn, styles.footerSave]}
            textStyle={styles.primaryBtnText}
          />
        </View>
      </View>

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={keyboardAccessoryId}>
          <KeyboardDismissButton colors={colors} isRTL={isRTL} />
        </InputAccessoryView>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function initial(name: string): string {
  const s = name.trim();
  return s ? s.slice(0, 1).toUpperCase() : "?";
}

