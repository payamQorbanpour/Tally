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
  type RefObject,
} from "react";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "../ui/AppText";
import { buildExpenseInviteUrl, buildInviteUrl } from "../core/inviteEnv";
import { AppButton } from "../ui/AppButton";
import { JoinQrCard } from "../ui/JoinQrCard";
import { TextInput, type AppTextInputRef } from "../ui/AppTextInput";
import { KeyboardDismissButton } from "../ui/KeyboardDismissButton";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { getLocalUserId } from "../db/ids";
import { PersonAvatar } from "../components/PersonAvatar";
import { useLocalUserAvatar } from "../hooks/useLocalUserAvatar";
import { useAutoStartTour } from "../providers/TourContext";
import type { GroupsStackParamList } from "../navigation/types";
import {
  addExistingUserToGroup,
  addExpenseWithSplits,
  createFriendContact,
  applyDecimalSeparatorToAmountInput,
  stripImeSpuriousZeroDotAfterFocus,
  formatMinor,
  formatSignedMoneyInputDisplay,
  formatUnsignedMoneyInputDisplay,
  getExpenseWithSplits,
  getGroup,
  listFriendContacts,
  listGroups,
  listMembers,
  minorToAmountInputString,
  parseMoneyToMinor,
  parseSignedMoneyToMinor,
  updateExpenseCategory,
  updateExpenseWithSplits,
  type FriendContactRow,
  type GroupRow,
  type MemberRow,
} from "../data/tallyRepo";
import {
  CURRENCY_OPTIONS,
  currencyMinorExponent,
  currencySymbol,
  formatMinorWithSymbol,
} from "../data/currencies";
import { Field } from "../ui/Field";
import { classifyExpenseCategory } from "../core/classifyExpenseCategory";
import { categoryIconName, EXPENSE_CATEGORIES } from "../core/categoryIcons";
import { splitEqualMinor } from "../core/splitEqual";
import {
  splitEqualWithAdjustmentsMinor,
  splitExactMinor,
  splitPercentMinor,
  splitSharesMinor,
} from "../core/splitAdvanced";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import { moneyTextStyle } from "../theme/typography";
import { useNumpadDoneInputProps } from "../providers/NumpadDoneAccessory";
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


function buildAddExpenseStyles(colors: ThemeColors, cardShadow: ShadowStyle) {
  return StyleSheet.create({
  addRoot: { flex: 1, justifyContent: "space-between" as const },
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 28 },
  /** Static row holding the date pill — anchored above the ScrollView so
      it stays put while the form scrolls. Centered horizontally. */
  dateRowOuter: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.bg,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.owedSoft,
  },
  datePillLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.2,
  },
  scrollWide: { paddingHorizontal: 24, maxWidth: 600, alignSelf: "center", width: "100%" },
  chipsBlock: {
    marginTop: 12,
  },
  chipsLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  chipsScroll: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.owedSoft,
  },
  chipAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipLetter: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    maxWidth: 120,
  },
  chipLabelOff: {
    color: colors.muted,
  },
  chipAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: colors.primary,
  },
  chipAddLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    padding: 20,
    ...cardShadow,
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
  categoryScroll: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  categoryPillOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryPillLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.2,
  },
  categoryPillLabelOn: { color: "#fff" },
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
  /**
   * Paid-by row — sits between the chip row / date pill and the splits card.
   * Three variants: small text-link (you = payer, 3+ members), banner pill
   * (someone else paid), inline radios (exactly 2 members).
   */
  paidByBlock: {
    marginTop: 12,
    marginBottom: 4,
  },
  paidByLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  paidByLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  paidByBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.owedSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paidByBannerLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  paidByBannerCta: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  paidByRadios: {
    flexDirection: "row",
    gap: 8,
  },
  paidByRadio: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  paidByRadioOn: {
    borderColor: colors.primary,
    backgroundColor: colors.owedSoft,
  },
  paidByRadioLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  paidByRadioLabelOn: {
    color: colors.primary,
  },
  paidByMicroLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  advancedSplitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  advancedSplitLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.2,
  },
  advancedSplitHint: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
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
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  iosTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  iosModalCancel: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "500",
  },
  /** Time-row sits beneath the inline calendar in the iOS date sheet. */
  iosTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  iosTimeLabel: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  iosModalDone: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPayerRing: {
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
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

  /* ── Kit-aligned header (Cancel / Add expense / Save text-buttons) ─ */
  kitHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 4,
    minHeight: 52,
  },
  kitHeaderSide: {
    minWidth: 80,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  kitHeaderSideRight: {
    minWidth: 80,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "flex-end",
  },
  kitHeaderCancel: { fontSize: 16, fontWeight: "600", color: colors.primary },
  kitHeaderSave: { fontSize: 16, fontWeight: "700", color: colors.primary },
  kitHeaderTitleCol: {
    flex: 1,
    alignItems: "center",
    paddingTop: 8,
  },
  kitHeaderTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  kitHeaderSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  kitHeaderSubtitle: { fontSize: 12, color: colors.muted, fontWeight: "600" },

  /* ── Big amount block (centered, kit style) ───────────────────── */
  amountBlock: {
    paddingVertical: 12,
    alignItems: "center",
  },
  amountEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.6,
  },
  amountFlexRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 8,
  },
  amountSymbolBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  amountSymbol: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.muted,
  },
  amountBigInput: {
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -1,
    color: colors.text,
    textAlign: "center",
    minWidth: 120,
    padding: 0,
    backgroundColor: "transparent",
    fontVariant: ["tabular-nums"],
  },

  /* ── Filled-mint Field input (description) ────────────────────── */
  filledFieldInput: {
    backgroundColor: colors.inputSurface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    borderWidth: 0,
  },

  /* ── Paid by card (vertical avatar list with checkmark) ───────── */
  paidByCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    overflow: "hidden",
  },
  paidByRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  paidByRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  paidByAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.owedSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  paidByAvatarLetter: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  paidByName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },

  /* ── Split equally banner ─────────────────────────────────────── */
  splitBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.owedSoft,
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  splitBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  splitBannerCol: { flex: 1 },
  splitBannerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  splitBannerAmount: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  splitBannerErr: { backgroundColor: colors.oweSoft },
  splitBannerIconErr: { backgroundColor: colors.owe },

  /* ── Advanced disclosure header ───────────────────────────────── */
  advancedHeader: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  advancedTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  advancedSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginRight: 6,
  },

  /* ── Split-method chips ───────────────────────────────────────── */
  splitMethodChips: {
    flexDirection: "row",
    gap: 8,
  },
  splitMethodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  splitMethodChipOn: {
    backgroundColor: colors.owedSoft,
    borderColor: colors.primary,
  },
  splitMethodChipLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  splitMethodChipLabelOn: { color: colors.primary },

  /* ── Per-member split rows card ───────────────────────────────── */
  memberSplitCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    overflow: "hidden",
    ...cardShadow,
  },
  memberSplitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  memberSplitRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  /** Trailing "Add people" affordance inside the per-member split card. */
  memberSplitAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  memberSplitAddIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.owedSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  memberSplitAddLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  /**
   * Saved-friends quick-add row that mirrors CreateGroup's people picker
   * (search box + scrollable list). Sits between the existing-member
   * rows and the "+ Add a person" inline composer for net-new contacts.
   */
  savedFriendsSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.inputSurface,
  },
  savedFriendsSearchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
  },
  savedFriendsScroll: { maxHeight: 5 * 56 },
  savedFriendsItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  savedFriendsName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  savedFriendsAddBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  savedFriendsEmpty: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  savedFriendsEmptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  memberSplitName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  memberSplitPreview: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  memberSplitInputBase: {
    fontSize: 14,
    fontWeight: "700",
    backgroundColor: colors.inputSurface,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    width: 84,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    borderWidth: 0,
  },
  memberSplitChecker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  memberSplitCheckerOn: { backgroundColor: colors.primary },
  memberSplitCheckerOff: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  memberStepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputSurface,
    borderRadius: 10,
    padding: 2,
  },
  memberStepperBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  memberStepperValue: {
    minWidth: 24,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },

  /* ── Live-totals footer for the split card ────────────────────── */
  splitFooter: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  splitFooterOk: { backgroundColor: colors.owedSoft },
  splitFooterErr: { backgroundColor: colors.oweSoft },
  splitFooterLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  splitFooterValue: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },

  /* ── Category chips strip (lives inside Advanced) ─────────────── */
  catStrip: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 4,
  },
  catTile: {
    alignItems: "center",
    gap: 4,
  },
  catLabel: {
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
  },

  /* ── Section label inside scroll ──────────────────────────────── */
  scrollEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
    paddingLeft: 2,
  },
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
  const { groupId, expenseId, receiptPrefill } = route.params;
  // First-run tour auto-start. Suppressed when editing an existing expense
  // (the tour speaks to the empty-form first-run experience). The hook is
  // idempotent and persists `tour_done` once the user finishes or skips.
  useAutoStartTour({ enabled: !expenseId });
  const db = useDatabase();
  const { dataRevision } = useTallyData();
  const { t, locale: appLocale, isRTL } = useLocale();
  const { colors, resolvedScheme, shadows } = useTheme();
  const styles = useMemo(
    () => buildAddExpenseStyles(colors, shadows.card),
    [colors, shadows.card],
  );

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

  /**
   * Short labels for the chip row in Advanced split-method picker.
   * "Equal", "Exact", "%", "Shares", "Adj" — kit-aligned, fits 5-up on a
   * narrow screen without overflow. The longer `splitLabels` are still
   * used for the disclosure subtitle ("Split: Split equally").
   */
  const splitChipLabels = useMemo(
    (): Record<SplitMode, string> => ({
      equal: t("addExpense.toolEqual"),
      exact: t("addExpense.toolExact"),
      percent: t("addExpense.toolPercent"),
      shares: t("addExpense.toolShares"),
      adjust: t("addExpense.toolAdj"),
    }),
    [t],
  );

  const [members, setMembers] = useState<MemberRow[]>([]);
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
  /**
   * Timestamp (ms) of the most recent focus on any money field. Used to let
   * `stripImeSpuriousZeroDotAfterFocus` swallow the IME's in-focus trailing-dot
   * event (e.g. `"10"` → `"10."`) without eating a legitimate user-typed `.`.
   */
  const numericFieldJustFocusedAtRef = useRef(0);
  const isNumericFieldJustFocused = () =>
    Date.now() - numericFieldJustFocusedAtRef.current < 600;
  const markNumericFieldFocused = () => {
    numericFieldJustFocusedAtRef.current = Date.now();
  };
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  // Soft-lock for premium split modes — shown when the user picks a
  // non-equal split on a *new* expense without an active pass. Editing
  // an existing expense never trips the gate (we never downgrade old
  // data). See `isPremiumSplitMode` below.
  const [expenseAt, setExpenseAt] = useState(() => new Date());
  const [iosDatePicker, setIosDatePicker] = useState(false);
  /** Snapshot of `expenseAt` taken when the iOS date sheet opens, used
      to revert if the user taps Cancel instead of Done. */
  const datePickerCommitRef = useRef<Date | null>(null);
  const [webDatePicker, setWebDatePicker] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [allGroups, setAllGroups] = useState<GroupRow[]>([]);
  const [addPersonInline, setAddPersonInline] = useState(false);
  const [addPersonName, setAddPersonName] = useState("");
  const [addPersonBusy, setAddPersonBusy] = useState(false);
  const addPersonInputRef = useRef<AppTextInputRef>(null);
  /**
   * Saved-friends roster (image #18 / #21 design). Members already in the
   * group are filtered out; the rest become "+ to add" rows under the WHO
   * IS IN list, mirrored from CreateGroup.
   */
  const [savedFriends, setSavedFriends] = useState<FriendContactRow[]>([]);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [joinQrOpen, setJoinQrOpen] = useState(false);
  /**
   * Hide the split-mode toolbar (Exact/Percent/Shares/Adjust) by default —
   * Equal covers the vast majority of cases (Hick's Law / progressive
   * disclosure). The toolbar comes back when the user opts into Advanced,
   * or automatically when an existing non-equal expense is loaded.
   */
  const [advancedSplitOpen, setAdvancedSplitOpen] = useState(false);
  /** Picker sheet for "Who paid?" — only opened from the Paid-by pill. */
  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  /** When group id or member set changes on a new expense, reset split fields; on refocus with same context, preserve. */
  const loadedNewExpenseSplitCtxRef = useRef<string | null>(null);
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
  const { avatarUri: myAvatarUri } = useLocalUserAvatar();
  useEffect(() => {
    setPayerId((prev) =>
      members.some((x) => x.id === prev) ? prev : (members[0]?.id ?? myId),
    );
  }, [dataRevision, myId, members]);

  const onPressSetExpenseTime = useCallback(() => {
    if (busy) return;
    // Snapshot the current value so Cancel reverts the in-modal edits.
    datePickerCommitRef.current = expenseAt;
    if (Platform.OS === "web") {
      setWebDatePicker(true);
      return;
    }
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
    const groups = await listGroups(db);
    setAllGroups(groups);

    const m = await listMembers(db, groupId);
    setMembers(m);
    const friends = await listFriendContacts(db);
    setSavedFriends(friends);
    const g = await getGroup(db, groupId);
    const curCurrency = g?.currency ?? "USD";
    if (g) {
      setCurrency(g.currency);
      setGroupCurrency(g.currency);
      setGroupName(g.name);
    }

    if (expenseId) {
      const data = await getExpenseWithSplits(db, groupId, expenseId);
      if (!data) {
        navigation.goBack();
        return;
      }
      const { expense, splits } = data;
      setDescription(expense.description);
      setAmountText(minorToAmountInputString(expense.amount_minor, curCurrency));
      setPayerId(
        m.some((x) => x.id === expense.payer_id)
          ? expense.payer_id
          : (m[0]?.id ?? getLocalUserId()),
      );
      setCategory(expense.category);
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
      return;
    }

    const memberIdsKeySorted = m.map((x) => x.id).sort().join("\n");
    const splitCtx = `${groupId}\n${memberIdsKeySorted}`;
    const sameSplitCtx = loadedNewExpenseSplitCtxRef.current === splitCtx;

    if (!sameSplitCtx) {
      loadedNewExpenseSplitCtxRef.current = splitCtx;
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
  }, [db, groupId, expenseId, navigation]);

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

  /**
   * Surface the advanced split toolbar when the form is in any non-equal
   * mode — covers both edit (existing expense had Exact / Percent / etc.)
   * and AI-receipt prefill (forces Exact). New equal-split expenses keep
   * it collapsed.
   */
  useEffect(() => {
    if (splitMode !== "equal" && !advancedSplitOpen) {
      setAdvancedSplitOpen(true);
    }
  }, [splitMode, advancedSplitOpen]);

  /**
   * Apply the AI-receipt prefill exactly once after members have loaded.
   * The receipt flow hands us totals, per-person exact splits, payer and a
   * suggested title/category — the user still commits (or cancels) via the
   * standard Save/Back on this screen, so no DB write happens until they
   * confirm here.
   */
  const receiptPrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (!receiptPrefill || receiptPrefillAppliedRef.current) return;
    if (expenseId) return; // prefill is only for new-expense flow
    if (members.length === 0) return;

    receiptPrefillAppliedRef.current = true;
    const { description: desc, amountMinor, payerId: pid, exactByUserId, category: cat } =
      receiptPrefill;
    setDescription(desc);
    setAmountText(minorToAmountInputString(amountMinor, groupCurrency));
    setCurrency(groupCurrency);
    if (members.some((m) => m.id === pid)) setPayerId(pid);
    if (cat !== undefined) setCategory(cat ?? null);
    setSplitMode("exact");
    setExactText(() => {
      const next: Record<string, string> = {};
      for (const m of members) {
        const minor = exactByUserId[m.id] ?? 0;
        next[m.id] = minor > 0
          ? minorToAmountInputString(minor, groupCurrency)
          : "";
      }
      return next;
    });
    setEqualOn(() => {
      const next: Record<string, boolean> = {};
      for (const m of members) next[m.id] = (exactByUserId[m.id] ?? 0) > 0;
      return next;
    });
  }, [receiptPrefill, expenseId, members, groupCurrency]);

  // Stable forwarders so the headerRight (set inside the first
  // useLayoutEffect, before `save` is declared further down) can call into
  // the always-fresh handlers without re-rendering the header.
  const saveRef = useRef<() => Promise<void> | void>(() => {});
  const canSaveRef = useRef<boolean>(false);
  const busyRef = useRef<boolean>(false);

  // The custom in-screen <ScreenHeader/> below replaces React Navigation's
  // header on this screen — needed because the native floating-pill style
  // wouldn't keep the right actions flush right when the group name is short.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Initial focus order matches the kit: Amount first (the most specific
  // and required field), then Description on submit/return — see the
  // amount input's `onSubmitEditing` below for the hop-back to title.
  // We re-push an empty string a few frames *after* focus to defeat the
  // iOS decimal-pad "0." flash that the IME paints into a programmatically
  // focused empty numeric field.
  useFocusEffect(
    useCallback(() => {
      if (expenseId) return;
      const focusId = setTimeout(() => amountInputRef.current?.focus(), 160);
      const clearIds = [220, 320, 480, 700, 1000, 1500].map((delay) =>
        setTimeout(() => {
          if (amountInputRef.current && !amountText) {
            amountInputRef.current.setNativeProps?.({ text: "" });
          }
        }, delay),
      );
      return () => {
        clearTimeout(focusId);
        clearIds.forEach(clearTimeout);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenseId]),
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
      const allEmpty = members.every((m) => !(prev[m.id] ?? "").trim());
      if (!allEmpty) return prev;
      const map = splitEqualMinor(
        amountMinor,
        members.map((m) => m.id),
      );
      const next = { ...prev };
      for (const m of members) {
        next[m.id] = minorToAmountInputString(map.get(m.id) ?? 0, currency);
      }
      return next;
    });
  }, [expenseId, splitMode, amountMinor, memberIdsKey, currency, members]);

  /** Fill missing percent slots only; keep values when switching split modes. */
  useEffect(() => {
    if (splitMode !== "percent" || members.length === 0) return;
    setPercentText((prev) => {
      const parts = equalIntegerPercents(members.length);
      const next = { ...prev };
      let changed = false;
      members.forEach((m, idx) => {
        const cur = prev[m.id];
        if (cur === undefined || cur === "") {
          next[m.id] = String(parts[idx] ?? 0);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [splitMode, memberIdsKey, members]);

  /** Default share counts for new members only; do not reset when changing split mode. */
  useEffect(() => {
    if (members.length === 0) return;
    setSharesText((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of members) {
        if (next[m.id] === undefined || next[m.id] === "") {
          next[m.id] = "1";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [memberIdsKey, members]);

  const amountFieldPlaceholder = minorToAmountInputString(0, currency);

  const validationErrorKey = useMemo((): string | null => {
    if (amountMinor === null || members.length === 0) return null;
    if (splitMode === "equal") {
      const sel = members.filter((m) => equalOn[m.id]);
      if (sel.length === 0) return "addExpense.errSelectSplit";
      return null;
    }
    if (splitMode === "exact") {
      let sum = 0;
      let anyPositive = false;
      for (const m of members) {
        const raw = (exactText[m.id] ?? "").trim();
        if (raw === "") continue;
        const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
        if (v === null) return "addExpense.errExactEach";
        if (v > 0) anyPositive = true;
        sum += v;
      }
      if (!anyPositive) return "addExpense.errSelectSplit";
      if (sum !== amountMinor) return "addExpense.errExactSum";
      return null;
    }
    if (splitMode === "percent") {
      let sum = 0;
      let anyPositive = false;
      for (const m of members) {
        const raw = (percentText[m.id] ?? "").trim();
        if (raw === "") continue;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return "addExpense.errPercentRange";
        }
        if (n > 0) anyPositive = true;
        sum += n;
      }
      if (!anyPositive) return "addExpense.errSelectSplit";
      if (sum !== 100) return "addExpense.errPercentSum";
      return null;
    }
    if (splitMode === "shares") {
      let sum = 0;
      for (const m of members) {
        const raw = (sharesText[m.id] ?? "").trim();
        if (raw === "") continue;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0) {
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

  const validationError = useMemo((): string | null => {
    if (!validationErrorKey) return null;
    // Exact split: sum gap is "Remaining: …"; empty fields count as 0 — no "Enter a valid amount…" line.
    if (validationErrorKey === "addExpense.errExactSum") return null;
    if (validationErrorKey === "addExpense.errExactEach" && splitMode === "exact")
      return null;
    return t(validationErrorKey);
  }, [validationErrorKey, splitMode, t]);

  /**
   * Live-totals summary footer for the advanced split card. Always-on box
   * under the per-member rows: green when the split balances against the
   * amount, red when it doesn't (e.g. percentages over 100, exact sum off,
   * adjustments not zero). Intentionally separate from validation gate.
   */
  const advancedSplitSummary = useMemo<{
    ok: boolean;
    label: string;
    value: string;
  } | null>(() => {
    if (members.length === 0) return null;
    const target = amountMinor ?? 0;
    if (splitMode === "equal") {
      const includedCount = members.filter((m) => equalOn[m.id]).length;
      const ok = includedCount > 0;
      const firstId = members.find((m) => equalOn[m.id])?.id;
      const each =
        ok && liveEqualAdjustShares && firstId
          ? liveEqualAdjustShares.get(firstId) ?? 0
          : 0;
      return {
        ok,
        label: t("addExpense.equalSummaryIncluded", {
          count: String(includedCount),
          total: String(members.length),
        }),
        value: ok
          ? t("addExpense.equalSummaryEach", {
              amount: formatMinorWithSymbol(each, currency),
            })
          : "",
      };
    }
    if (splitMode === "exact") {
      let sum = 0;
      let allValid = true;
      for (const m of members) {
        const raw = (exactText[m.id] ?? "").trim();
        if (raw === "") continue;
        const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
        if (v === null) {
          allValid = false;
          break;
        }
        sum += v;
      }
      const ok = allValid && sum === target;
      const sumLabel = formatMinorWithSymbol(sum, currency);
      const targetLabel = formatMinorWithSymbol(target, currency);
      let suffix = "";
      if (ok) {
        suffix = ` · ${t("addExpense.exactBalanced")}`;
      } else if (allValid) {
        const diff = target - sum;
        if (diff > 0) {
          suffix = ` · ${t("addExpense.exactRemaining", {
            amount: formatMinorWithSymbol(diff, currency),
          })}`;
        } else if (diff < 0) {
          suffix = ` · ${t("addExpense.exactOver", {
            amount: formatMinorWithSymbol(-diff, currency),
          })}`;
        }
      }
      return {
        ok,
        label: t("addExpense.totalLabel"),
        value: `${sumLabel} / ${targetLabel}${suffix}`,
      };
    }
    if (splitMode === "percent") {
      let sum = 0;
      for (const m of members) {
        const v = Number.parseInt((percentText[m.id] ?? "").trim(), 10);
        if (Number.isFinite(v)) sum += v;
      }
      const ok = sum === 100;
      let status: string;
      if (ok) status = t("addExpense.summaryBalanced");
      else if (sum > 100)
        status = t("addExpense.summaryPercentOver", {
          percent: String(sum - 100),
        });
      else
        status = t("addExpense.summaryPercentUnder", {
          percent: String(100 - sum),
        });
      return {
        ok,
        label: t("addExpense.totalLabel"),
        value: `${sum}% / 100% · ${status}`,
      };
    }
    if (splitMode === "shares") {
      let sum = 0;
      for (const m of members) {
        const v = Number.parseInt((sharesText[m.id] ?? "").trim(), 10);
        if (Number.isFinite(v) && v > 0) sum += v;
      }
      const ok = sum > 0;
      const perShare = ok && target > 0 ? Math.round(target / sum) : 0;
      return {
        ok,
        label: t("addExpense.totalSharesLabel"),
        value: ok
          ? t("addExpense.sharesSummaryLine", {
              count: String(sum),
              amount: formatMinorWithSymbol(perShare, currency),
            })
          : "",
      };
    }
    if (splitMode === "adjust") {
      let sum = 0;
      let allValid = true;
      for (const m of members) {
        if (!equalOn[m.id]) continue;
        const v = parseSignedMoneyToMinor(adjText[m.id] ?? "", currency);
        if (v === null) {
          allValid = false;
          break;
        }
        sum += v;
      }
      const ok = allValid && sum === 0;
      let status: string;
      if (!allValid) {
        status = t("addExpense.errAdjEach");
      } else if (ok) {
        status = t("addExpense.summaryBalanced");
      } else if (sum > 0) {
        status = t("addExpense.summaryAdjustOver", {
          amount: formatMinorWithSymbol(sum, currency),
        });
      } else {
        status = t("addExpense.summaryAdjustUnder", {
          amount: formatMinorWithSymbol(-sum, currency),
        });
      }
      return {
        ok,
        label: t("addExpense.totalLabel"),
        value: status,
      };
    }
    return null;
  }, [
    splitMode,
    members,
    equalOn,
    amountMinor,
    currency,
    exactText,
    percentText,
    sharesText,
    adjText,
    liveEqualAdjustShares,
    t,
  ]);

  /**
   * What the user still needs to do before the expense can be persisted.
   * The Save button stays enabled at all times so a tap always produces
   * useful feedback (focus the missing field, open Add Person, or save).
   * Order matters: focus walks down the form top-to-bottom.
   */
  const missingFor: "description" | "amount" | "members" | "split" | null =
    !description.trim()
      ? "description"
      : amountMinor === null || amountMinor <= 0
        ? "amount"
        : members.length === 0
          ? "members"
          : validationErrorKey !== null
            ? "split"
            : null;
  const canSave = !busy && missingFor === null;

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
        minor: parseMoneyToMinor(exactText[m.id] ?? "", currency) ?? 0,
      }));
      return splitExactMinor(amountMinor, parts);
    }
    if (splitMode === "percent") {
      const parts = members.map((m) => ({
        userId: m.id,
        percent:
          Number.parseInt((percentText[m.id] ?? "").trim(), 10) || 0,
      }));
      return splitPercentMinor(amountMinor, parts);
    }
    // Shares: every member is a candidate; share count of 0 = excluded.
    // Equal-tab inclusion no longer gates this so a person toggled off in
    // Equal still keeps the share count they were given here.
    const shareParts = members.map((m) => ({
      userId: m.id,
      shares: Number.parseInt((sharesText[m.id] ?? "").trim(), 10) || 0,
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

  const save = async () => {
    if (busy || !canSave || amountMinor === null) return;
    setBusy(true);
    // Tracks whether we navigated away (or otherwise consider this a
    // successful save). On success the screen is unmounting, so leaving
    // `busy = true` prevents the green checkmark from flashing back in
    // during the transition. We only reset busy on early-return / error
    // paths where the user stays on this screen.
    let succeeded = false;
    try {
      let owed: Map<string, number>;
      try {
        owed = buildOwedMap();
      } catch {
        return;
      }
      let newExpenseId: string | null = null;
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
        newExpenseId = await addExpenseWithSplits(db, groupId, {
          description,
          amountMinor,
          payerId,
          expenseDate: formatLocalDateTimeForInput(expenseAt),
          owedByUserId: owed,
          category,
        });
      }
      if (newExpenseId) {
        const savedId = newExpenseId;
        const savedGid = groupId;
        const savedTitle = description;
        void classifyExpenseCategory(savedTitle)
          .then((cat) => updateExpenseCategory(db, savedGid, savedId, cat))
          .catch(() => {
            /* classification is best-effort; keep the default */
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
        succeeded = true;
        navigation.goBack();
        return;
      }
      // New-expense path: navigate straight back to the previous screen
      // (typically GroupDetail) without the post-save share sheet — that
      // sheet was removed for being a friction-y interruption. Users can
      // share later from the expense's detail view.
      if (newExpenseId) {
        succeeded = true;
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
        if (prev?.name === "GroupDetail" && prevGid === groupId) {
          navigation.goBack();
        } else {
          navigation.replace("GroupDetail", { groupId });
        }
        return;
      }
      succeeded = true;
    } finally {
      if (!succeeded) setBusy(false);
    }
  };

  /**
   * Keep the header refs in sync with each render. The header callback
   * reads from these refs so the title + actions are mounted together
   * (no flicker), and React Navigation re-renders the header on every
   * `setOptions` call below to refresh icon color / disabled state.
   */
  useLayoutEffect(() => {
    saveRef.current = save;
    canSaveRef.current = canSave;
    busyRef.current = busy;
    // Touch a no-op option so the header re-runs the function components
    // and picks up the latest `canSave` / `busy` colors. Title text is
    // unchanged so RN doesn't trigger a layout reflow.
    navigation.setOptions({});
  }, [navigation, save, canSave, busy]);

  const allowMoneyDecimals = currencyMinorExponent(currency) > 0;
  const insertAmountDecimal = useCallback(() => {
    setAmountText((prev) =>
      applyDecimalSeparatorToAmountInput(prev, currency),
    );
  }, [currency]);

  const clearSpuriousAmountFocusFill = useCallback(() => {
    // Title→amount via the keyboard "Next" key: explicit transfer flag.
    if (amountFocusTransferredFromTitleRef.current) {
      amountFocusTransferredFromTitleRef.current = false;
      setAmountText("");
      amountInputRef.current?.setNativeProps?.({ text: "" });
      requestAnimationFrame(() => {
        amountInputRef.current?.setNativeProps?.({ text: "" });
      });
      return;
    }
    // Tap-focus path: iOS decimal-pad can paint a stray "." after focus
    // (empty → "0." flash; non-empty → "123."). Re-push the canonical state
    // value to native a few frames *after* the focus settles so the IME's
    // injected dot is overwritten without racing the user's first keypress.
    const value = amountText;
    [16, 80, 200, 400, 800, 1300].forEach((delay) => {
      setTimeout(() => {
        amountInputRef.current?.setNativeProps?.({ text: value });
      }, delay);
    });
  }, [amountText]);

  const amountTextOnChange = useCallback(
    (text: string) => {
      const formatted = formatUnsignedMoneyInputDisplay(text, currency);
      let nextOverride: string | null = null;
      setAmountText((prev) => {
        const next = stripImeSpuriousZeroDotAfterFocus(
          prev,
          formatted,
          isNumericFieldJustFocused(),
        );
        if (next !== formatted) nextOverride = next;
        return next;
      });
      // When the strip eats the IME's spurious `0.`, React state stays put
      // so no re-render fires — and on iOS the native TextInput keeps
      // painting the IME's text. Push the stripped value to native here
      // (outside the updater so the side effect is reliable) and retry on
      // the next frame in case the IME re-injects after our first clear.
      if (nextOverride !== null) {
        const target: string = nextOverride;
        amountInputRef.current?.setNativeProps?.({ text: target });
        requestAnimationFrame(() => {
          amountInputRef.current?.setNativeProps?.({ text: target });
        });
      }
    },
    [currency],
  );

  const amountNumpadProps = useNumpadDoneInputProps({
    onFocus: () => {
      markNumericFieldFocused();
      clearSpuriousAmountFocusFill();
      scheduleCaretToEnd(amountInputRef, 0);
    },
    ...(allowMoneyDecimals ? { onDecimalInsert: insertAmountDecimal } : {}),
  });

  /**
   * If the user excludes the current payer from the split via the chip
   * row, the form would otherwise be in an awkward state ("Bob paid but
   * isn't in the split"). Reassign the payer to the first remaining
   * included member so the next render reflects a coherent default. The
   * user can still change the payer back via the Paid-by pill if Bob
   * really did pay for everyone else.
   */
  const toggleMemberIncluded = useCallback(
    (memberId: string) => {
      // Keep `payerId` untouched even when the payer toggles themselves
      // out of the split. Someone can pay for a meal they don't eat —
      // auto-reassigning surprised users by silently overwriting their
      // chosen payer.
      // Each split mode owns its own inclusion: Exact / Percent / Shares
      // mode reads the value the user typed for that mode (>0 = in), so
      // toggling Equal off no longer overwrites those values. Adjust still
      // piggybacks on Equal because it's an equal-split + adjustment.
      setEqualOn((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
    },
    [],
  );

  const wide = windowWidth >= WIDE_LAYOUT;

  const onSelectGroupFromModal = useCallback(
    (g: GroupRow) => {
      setGroupPickerOpen(false);
      if (g.id !== groupId) navigation.setParams({ groupId: g.id });
    },
    [groupId, navigation],
  );

  const openAddPerson = useCallback(() => {
    setAddPersonInline(true);
    requestAnimationFrame(() => addPersonInputRef.current?.focus());
  }, []);

  const cancelAddPersonInline = useCallback(() => {
    setAddPersonInline(false);
    setAddPersonName("");
  }, []);

  const submitAddPersonInline = useCallback(async () => {
    const name = addPersonName.trim();
    if (!name || addPersonBusy) return;
    setAddPersonBusy(true);
    try {
      const id = await createFriendContact(db, { name });
      await addExistingUserToGroup(db, groupId, id);
      const m = await listMembers(db, groupId);
      setMembers(m);
      // Newly-added members start included in the split. Without seeding
      // equalOn / the per-mode text maps here, the row would render
      // "Not included" until the user manually checked it.
      setEqualOn((prev) => ({ ...prev, [id]: true }));
      setExactText((prev) =>
        prev[id] === undefined ? { ...prev, [id]: "" } : prev,
      );
      setPercentText((prev) =>
        prev[id] === undefined ? { ...prev, [id]: "" } : prev,
      );
      setSharesText((prev) =>
        prev[id] === undefined ? { ...prev, [id]: "1" } : prev,
      );
      setAdjText((prev) =>
        prev[id] === undefined ? { ...prev, [id]: "" } : prev,
      );
      setAddPersonName("");
      setAddPersonInline(false);
    } finally {
      setAddPersonBusy(false);
    }
  }, [addPersonName, addPersonBusy, db, groupId]);

  /**
   * The Save button always reacts. If something's missing, focus the relevant
   * field (or open the add-person sheet) so the user gets a forward-pointing
   * cue rather than an inert button. Only when nothing's missing do we run the
   * actual save → share-on-save handoff.
   */
  const attemptSave = useCallback(async () => {
    if (busy) return;
    if (missingFor === "description") {
      titleInputRef.current?.focus();
      return;
    }
    if (missingFor === "amount") {
      amountInputRef.current?.focus();
      return;
    }
    if (missingFor === "members") {
      Keyboard.dismiss();
      void openAddPerson();
      return;
    }
    if (missingFor === "split") {
      Keyboard.dismiss();
      return;
    }
    await save();
  }, [busy, missingFor, openAddPerson, save]);

  /**
   * Suggested-friends list shown under WHO IS IN. Saved friends not yet in
   * the group, narrowed by the in-card search query (name or email).
   */
  const suggestedFriends = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    const q = peopleSearch.trim().toLowerCase();
    return savedFriends.filter((f) => {
      if (memberIds.has(f.id)) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [savedFriends, members, peopleSearch]);

  /**
   * Adds a saved friend to the group + this expense's split. Mirrors
   * `submitAddPersonInline` but skips the createFriendContact call since
   * the contact already exists in `users`.
   */
  const addSavedFriendToExpense = useCallback(
    async (friend: FriendContactRow) => {
      if (busy || addPersonBusy) return;
      setAddPersonBusy(true);
      try {
        await addExistingUserToGroup(db, groupId, friend.id);
        const m = await listMembers(db, groupId);
        setMembers(m);
        setEqualOn((prev) => ({ ...prev, [friend.id]: true }));
        setExactText((prev) =>
          prev[friend.id] === undefined
            ? { ...prev, [friend.id]: "" }
            : prev,
        );
        setPercentText((prev) =>
          prev[friend.id] === undefined
            ? { ...prev, [friend.id]: "" }
            : prev,
        );
        setSharesText((prev) =>
          prev[friend.id] === undefined
            ? { ...prev, [friend.id]: "1" }
            : prev,
        );
        setAdjText((prev) =>
          prev[friend.id] === undefined
            ? { ...prev, [friend.id]: "" }
            : prev,
        );
      } finally {
        setAddPersonBusy(false);
      }
    },
    [busy, addPersonBusy, db, groupId],
  );

  const displayName = groupName.trim() || t("groupDetail.titleFallback");
  const isEditing = !!expenseId;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.addRoot}>
        {/* Kit-aligned header — Cancel / Add expense / Save (text-buttons). */}
        <View style={[styles.kitHeader, { paddingTop: Math.max(8, insets.top) }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            disabled={busy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("addExpense.cancel")}
            style={({ pressed }) => [styles.kitHeaderSide, pressed && styles.pressed]}
          >
            <Text style={styles.kitHeaderCancel}>{t("addExpense.cancel")}</Text>
          </Pressable>
          <View style={styles.kitHeaderTitleCol}>
            <Text style={styles.kitHeaderTitle} numberOfLines={1}>
              {isEditing ? displayName : t("addExpense.title")}
            </Text>
            {!isEditing ? (
              <Pressable
                onPress={() => {
                  if (busy) return;
                  Keyboard.dismiss();
                  setGroupPickerOpen(true);
                }}
                disabled={busy}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${t("nav.group")}: ${displayName}`}
                style={({ pressed }) => [
                  styles.kitHeaderSubtitleRow,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={styles.kitHeaderSubtitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {displayName}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => void attemptSave()}
            disabled={busy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={
              busy
                ? t("addExpense.saving")
                : missingFor === "description"
                  ? t("addExpense.needDescription")
                  : missingFor === "amount"
                    ? t("addExpense.needAmount")
                    : missingFor === "members"
                      ? t("addExpense.needSomeoneToSplit")
                      : t("addExpense.save")
            }
            style={({ pressed }) => [
              styles.kitHeaderSideRight,
              !canSave && styles.disabled,
              pressed && canSave && styles.pressed,
            ]}
          >
            <Text style={styles.kitHeaderSave}>{t("addExpense.save")}</Text>
          </Pressable>
        </View>

        {/* Date pill (centered, mint owedSoft bg) */}
        <View style={styles.dateRowOuter}>
          <Pressable
            onPress={onPressSetExpenseTime}
            disabled={busy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`${t("addExpense.date")} ${expenseAtLabel}`}
            style={({ pressed }) => [
              styles.datePill,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text style={styles.datePillLabel} numberOfLines={1}>
              {expenseAtLabel}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Big amount block — eyebrow + currency-prefixed amount. */}
          <View style={styles.amountBlock}>
            <Text style={styles.amountEyebrow}>
              {t("addExpense.amountLabel").toUpperCase()}
            </Text>
            <View style={styles.amountFlexRow}>
              <Pressable
                onPress={openCurrencyPicker}
                disabled={busy}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${t("addExpense.currencyModalTitle")}: ${currency}`}
                style={({ pressed }) => [
                  styles.amountSymbolBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.amountSymbol}>{currencySymbol(currency)}</Text>
              </Pressable>
              <TextInput
                ref={amountInputRef}
                style={[styles.amountBigInput, { fontSize: amountHeroFontSize }]}
                value={amountText}
                onChangeText={amountTextOnChange}
                placeholder={amountFieldPlaceholder}
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                {...(Platform.OS === "web" && allowMoneyDecimals
                  ? ({ inputMode: "decimal" } as Record<string, string>)
                  : {})}
                {...amountNumpadProps}
                multiline={false}
                editable={!busy}
              />
            </View>
          </View>

          {/* What was this for? — filled mint input below the amount.
              Focus chain: Amount → (numpad Done) → user taps here →
              Return dismisses, since the remaining fields are tap-only. */}
          <Field label={t("addExpense.fieldDescriptionLabel")} topGap={18}>
            <TextInput
              ref={titleInputRef}
              style={styles.filledFieldInput}
              value={description}
              onChangeText={setDescription}
              placeholder={t("addExpense.placeholderDescription")}
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              editable={!busy}
            />
          </Field>

          {/* Paid by — vertical card, avatar + name + checkmark on the active row. */}
          <Field label={t("addExpense.paidBy").toUpperCase()} topGap={18}>
            <View style={styles.paidByCard}>
              {members.map((m, i) => {
                const on = m.id === payerId;
                const isMe = m.id === myId;
                const display = isMe
                  ? t("addExpense.chipsYouLabel")
                  : (m.name || t("addExpense.memberFallback"));
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setPayerId(m.id)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={display}
                    style={({ pressed }) => [
                      styles.paidByRow,
                      i === 0 ? null : styles.paidByRowDivider,
                      pressed && styles.pressed,
                    ]}
                  >
                    <PersonAvatar
                      name={m.name}
                      avatarUri={isMe ? myAvatarUri : null}
                      size={32}
                      containerStyle={styles.paidByAvatar}
                      letterStyle={styles.paidByAvatarLetter}
                      letterOverride={initial(m.name)}
                    />
                    <Text style={styles.paidByName} numberOfLines={1}>
                      {display}
                    </Text>
                    {on ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {/* Split summary banner — content reflects the active split mode. */}
          <View
            style={[
              styles.splitBanner,
              advancedSplitSummary && !advancedSplitSummary.ok
                ? styles.splitBannerErr
                : null,
            ]}
          >
            <View
              style={[
                styles.splitBannerIcon,
                advancedSplitSummary && !advancedSplitSummary.ok
                  ? styles.splitBannerIconErr
                  : null,
              ]}
            >
              <Ionicons
                name={SPLIT_MODE_ICONS[splitMode]}
                size={20}
                color="#fff"
              />
            </View>
            <View style={styles.splitBannerCol}>
              <Text
                style={[
                  styles.splitBannerLabel,
                  advancedSplitSummary && !advancedSplitSummary.ok
                    ? { color: colors.owe }
                    : null,
                ]}
              >
                {splitLabels[splitMode].toUpperCase()}
              </Text>
              <Text style={styles.splitBannerAmount} numberOfLines={1}>
                {(() => {
                  if (splitMode === "equal") {
                    const includedCount =
                      members.filter((m) => equalOn[m.id]).length || 1;
                    const eq = liveEqualAdjustShares;
                    const perPerson = eq
                      ? eq.get(members[0]?.id ?? "") ?? 0
                      : 0;
                    const each = formatMinorWithSymbol(perPerson, currency);
                    return t("addExpense.splitEqualEach", {
                      each,
                      count: String(includedCount),
                    });
                  }
                  return advancedSplitSummary?.value ?? "";
                })()}
              </Text>
            </View>
          </View>

          {/* Advanced disclosure header. */}
          <Pressable
            onPress={() => setAdvancedSplitOpen((v) => !v)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ expanded: advancedSplitOpen }}
            style={({ pressed }) => [styles.advancedHeader, pressed && styles.pressed]}
          >
            <Ionicons name="options-outline" size={18} color={colors.muted} />
            <Text style={styles.advancedTitle}>
              {t("addExpense.advancedSplitToggle")}
            </Text>
            <Text style={styles.advancedSubtitle} numberOfLines={1}>
              {splitLabels[splitMode]}
            </Text>
            <Ionicons
              name={advancedSplitOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.muted}
            />
          </Pressable>

          {advancedSplitOpen ? (
            <>
              {/* SPLIT METHOD chips */}
              <Text style={styles.scrollEyebrow}>
                {t("addExpense.splitMethod").toUpperCase()}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.splitMethodChips}
              >
                {(["equal", "exact", "percent", "shares", "adjust"] as SplitMode[]).map(
                  (mode) => {
                    const on = splitMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => setSplitMode(mode)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [
                          styles.splitMethodChip,
                          on && styles.splitMethodChipOn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name={SPLIT_MODE_ICONS[mode]}
                          size={16}
                          color={on ? colors.primary : colors.muted}
                        />
                        <Text
                          style={[
                            styles.splitMethodChipLabel,
                            on && styles.splitMethodChipLabelOn,
                          ]}
                        >
                          {splitChipLabels[mode]}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </ScrollView>

              {/* Per-member split rows — anatomy varies by mode. */}
              <Text style={styles.scrollEyebrow}>
                {(splitMode === "equal"
                  ? t("addExpense.whoIsIn")
                  : splitMode === "exact"
                    ? t("addExpense.exactAmounts")
                    : splitMode === "percent"
                      ? t("addExpense.percentages")
                      : splitMode === "shares"
                        ? t("addExpense.sharesSection")
                        : t("addExpense.adjustments")
                ).toUpperCase()}
              </Text>
              <View style={styles.memberSplitCard}>
                {members.map((m, i) => {
                  const isMe = m.id === myId;
                  const display = isMe
                    ? t("addExpense.chipsYouLabel")
                    : (m.name || t("addExpense.memberFallback"));
                  const included = !!equalOn[m.id];
                  let preview = "";
                  if (splitMode === "equal") {
                    preview = included
                      ? formatMinorWithSymbol(
                          liveEqualAdjustShares?.get(m.id) ?? 0,
                          currency,
                        )
                      : t("addExpense.notIncluded");
                  } else if (splitMode === "exact") {
                    const minor =
                      parseMoneyToMinor(exactText[m.id] ?? "", currency) ?? 0;
                    preview = formatMinorWithSymbol(minor, currency);
                  } else if (splitMode === "percent") {
                    const pct = parseFloat(percentText[m.id] ?? "") || 0;
                    const amt = parseMoneyToMinor(amountText, currency) ?? 0;
                    preview = formatMinorWithSymbol(
                      Math.round((amt * pct) / 100),
                      currency,
                    );
                  } else if (splitMode === "shares") {
                    const v = sharesText[m.id] ?? "0";
                    preview = `${v} ${t("addExpense.sharesUnit")}`;
                  } else if (splitMode === "adjust") {
                    const adj = adjText[m.id] ?? "";
                    preview = adj
                      ? `${adj.startsWith("-") ? "" : "+"}${adj}`
                      : t("addExpense.adjustZero");
                  }
                  return (
                    <View
                      key={m.id}
                      style={[
                        styles.memberSplitRow,
                        i === 0 ? null : styles.memberSplitRowDivider,
                      ]}
                    >
                      <PersonAvatar
                        name={m.name}
                        avatarUri={isMe ? myAvatarUri : null}
                        size={32}
                        containerStyle={styles.paidByAvatar}
                        letterStyle={styles.paidByAvatarLetter}
                        letterOverride={initial(m.name)}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.memberSplitName} numberOfLines={1}>
                          {display}
                        </Text>
                        <Text style={styles.memberSplitPreview} numberOfLines={1}>
                          {preview}
                        </Text>
                      </View>
                      {splitMode === "equal" ? (
                        <Pressable
                          onPress={() => toggleMemberIncluded(m.id)}
                          disabled={busy}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: included }}
                          style={({ pressed }) => [
                            styles.memberSplitChecker,
                            included
                              ? styles.memberSplitCheckerOn
                              : styles.memberSplitCheckerOff,
                            pressed && styles.pressed,
                          ]}
                        >
                          {included ? (
                            <Ionicons name="checkmark" size={18} color="#fff" />
                          ) : null}
                        </Pressable>
                      ) : null}
                      {splitMode === "exact" ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
                            {currencySymbol(currency)}
                          </Text>
                          <TextInput
                            ref={(r) => {
                              splitNumericInputRefs.current[`exact:${m.id}`] = r;
                            }}
                            style={styles.memberSplitInputBase}
                            value={exactText[m.id] ?? ""}
                            onChangeText={(text) =>
                              setExactText((prev) => ({
                                ...prev,
                                [m.id]: stripImeSpuriousZeroDotAfterFocus(
                                  prev[m.id] ?? "",
                                  formatUnsignedMoneyInputDisplay(text, currency),
                                  isNumericFieldJustFocused(),
                                ),
                              }))
                            }
                            keyboardType="decimal-pad"
                            {...(Platform.OS === "web" && allowMoneyDecimals
                              ? ({ inputMode: "decimal" } as Record<string, string>)
                              : {})}
                            onFocus={markNumericFieldFocused}
                            editable={!busy}
                          />
                        </View>
                      ) : null}
                      {splitMode === "percent" ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <TextInput
                            ref={(r) => {
                              splitNumericInputRefs.current[`pct:${m.id}`] = r;
                            }}
                            style={[styles.memberSplitInputBase, { width: 64 }]}
                            value={percentText[m.id] ?? ""}
                            onChangeText={(text) =>
                              setPercentText((prev) => ({ ...prev, [m.id]: text }))
                            }
                            keyboardType="number-pad"
                            onFocus={markNumericFieldFocused}
                            editable={!busy}
                          />
                          <Text
                            style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}
                          >
                            %
                          </Text>
                        </View>
                      ) : null}
                      {splitMode === "shares" ? (
                        <View style={styles.memberStepper}>
                          <Pressable
                            disabled={busy}
                            onPress={() =>
                              setSharesText((prev) => {
                                const cur = parseInt(prev[m.id] ?? "0", 10) || 0;
                                return {
                                  ...prev,
                                  [m.id]: String(Math.max(0, cur - 1)),
                                };
                              })
                            }
                            style={styles.memberStepperBtn}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={t("addExpense.decrementShare")}
                          >
                            <Ionicons name="remove" size={16} color={colors.primary} />
                          </Pressable>
                          <Text style={styles.memberStepperValue}>
                            {sharesText[m.id] ?? "0"}
                          </Text>
                          <Pressable
                            disabled={busy}
                            onPress={() =>
                              setSharesText((prev) => {
                                const cur = parseInt(prev[m.id] ?? "0", 10) || 0;
                                return { ...prev, [m.id]: String(cur + 1) };
                              })
                            }
                            style={styles.memberStepperBtn}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={t("addExpense.incrementShare")}
                          >
                            <Ionicons name="add" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                      ) : null}
                      {splitMode === "adjust" ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
                            {currencySymbol(currency)}
                          </Text>
                          <TextInput
                            ref={(r) => {
                              splitNumericInputRefs.current[`adj:${m.id}`] = r;
                            }}
                            style={styles.memberSplitInputBase}
                            value={adjText[m.id] ?? ""}
                            onChangeText={(text) =>
                              setAdjText((prev) => ({
                                ...prev,
                                [m.id]: stripImeSpuriousZeroDotAfterFocus(
                                  prev[m.id] ?? "",
                                  formatSignedMoneyInputDisplay(text, currency),
                                  isNumericFieldJustFocused(),
                                ),
                              }))
                            }
                            keyboardType="decimal-pad"
                            {...(Platform.OS === "web" && allowMoneyDecimals
                              ? ({ inputMode: "decimal" } as Record<string, string>)
                              : {})}
                            onFocus={markNumericFieldFocused}
                            placeholder="0.00"
                            placeholderTextColor={colors.muted}
                            editable={!busy}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <View style={styles.savedFriendsSearchRow}>
                  <Ionicons
                    name="search-outline"
                    size={16}
                    color={colors.muted}
                  />
                  <TextInput
                    style={styles.savedFriendsSearchInput}
                    value={peopleSearch}
                    onChangeText={setPeopleSearch}
                    placeholder={t("createGroup.searchFriendsPlaceholder")}
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy && !addPersonBusy}
                  />
                  {peopleSearch.length > 0 ? (
                    <Pressable
                      onPress={() => setPeopleSearch("")}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t("addExpense.cancel")}
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={colors.muted}
                      />
                    </Pressable>
                  ) : null}
                </View>
                {suggestedFriends.length > 0 ? (
                  <ScrollView
                    style={styles.savedFriendsScroll}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {suggestedFriends.map((f) => (
                      <View key={f.id} style={styles.savedFriendsItem}>
                        <PersonAvatar
                          name={f.name}
                          avatarUri={null}
                          size={32}
                          containerStyle={styles.paidByAvatar}
                          letterStyle={styles.paidByAvatarLetter}
                          letterOverride={initial(f.name)}
                        />
                        <Text
                          style={styles.savedFriendsName}
                          numberOfLines={1}
                        >
                          {f.name}
                        </Text>
                        <Pressable
                          onPress={() => void addSavedFriendToExpense(f)}
                          disabled={busy || addPersonBusy}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.savedFriendsAddBtn,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={t("createGroup.link")}
                        >
                          <Ionicons
                            name="add"
                            size={18}
                            color={colors.primary}
                          />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                ) : peopleSearch.trim().length > 0 ? (
                  <View style={styles.savedFriendsEmpty}>
                    <Text style={styles.savedFriendsEmptyText}>
                      {t("groupDetail.noMatchingFriends")}
                    </Text>
                  </View>
                ) : null}
                {addPersonInline ? (
                  <View style={styles.memberSplitAddRow}>
                    <View style={styles.memberSplitAddIcon}>
                      <Ionicons
                        name="add"
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <TextInput
                      ref={addPersonInputRef}
                      value={addPersonName}
                      onChangeText={setAddPersonName}
                      placeholder={t("addExpense.addPersonNamePlaceholder")}
                      placeholderTextColor={colors.muted}
                      style={[
                        styles.memberSplitAddLabel,
                        { flex: 1, color: colors.text, fontWeight: "500" },
                      ]}
                      onSubmitEditing={() => void submitAddPersonInline()}
                      returnKeyType="done"
                      autoFocus
                      editable={!addPersonBusy && !busy}
                      accessibilityLabel={t("addExpense.addPersonNamePlaceholder")}
                    />
                    <Pressable
                      onPress={() => void submitAddPersonInline()}
                      disabled={addPersonBusy || !addPersonName.trim() || busy}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t("addExpense.addPersonTitle")}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={26}
                        color={
                          addPersonName.trim() && !addPersonBusy
                            ? colors.primary
                            : colors.muted
                        }
                      />
                    </Pressable>
                    <Pressable
                      onPress={cancelAddPersonInline}
                      disabled={addPersonBusy}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t("addExpense.cancel")}
                    >
                      <Ionicons
                        name="close-circle"
                        size={26}
                        color={colors.muted}
                      />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={openAddPerson}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t("addExpense.addPersonTitle")}
                    style={({ pressed }) => [
                      styles.memberSplitAddRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.memberSplitAddIcon}>
                      <Ionicons
                        name="add"
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <Text style={styles.memberSplitAddLabel}>
                      {t("addExpense.addPersonTitle")}
                    </Text>
                  </Pressable>
                )}
              </View>

              {advancedSplitSummary ? (
                <View
                  style={[
                    styles.splitFooter,
                    advancedSplitSummary.ok
                      ? styles.splitFooterOk
                      : styles.splitFooterErr,
                  ]}
                >
                  <Ionicons
                    name={
                      advancedSplitSummary.ok
                        ? "checkmark-circle"
                        : "alert-circle"
                    }
                    size={18}
                    color={
                      advancedSplitSummary.ok ? colors.primary : colors.owe
                    }
                  />
                  <Text style={styles.splitFooterLabel}>
                    {advancedSplitSummary.label}
                  </Text>
                  <Text
                    style={[
                      styles.splitFooterValue,
                      {
                        color: advancedSplitSummary.ok
                          ? colors.text
                          : colors.owe,
                      },
                    ]}
                  >
                    {advancedSplitSummary.value}
                  </Text>
                </View>
              ) : null}
              {validationError ? (
                <View style={[styles.splitFooter, styles.splitFooterErr]}>
                  <Ionicons name="alert-circle" size={18} color={colors.owe} />
                  <Text style={styles.splitFooterLabel}>{validationError}</Text>
                </View>
              ) : null}

              {/* Category */}
              <Text style={styles.scrollEyebrow}>
                {t("addExpense.category").toUpperCase()}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.catStrip}
              >
                {EXPENSE_CATEGORIES.map((cat) => {
                  const on = (category ?? "general") === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(cat === "general" ? null : cat)}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.catTile,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          backgroundColor: on ? colors.primary : colors.owedSoft,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons
                          name={categoryIconName(cat)}
                          size={20}
                          color={on ? "#fff" : colors.primary}
                        />
                      </View>
                      <Text style={styles.catLabel}>{t(`categories.${cat}`)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}
        </ScrollView>
        {Platform.OS === "ios" ? (
          <Modal
            visible={iosDatePicker}
            transparent
            animationType="none"
            onRequestClose={() => setIosDatePicker(false)}
          >
            <View style={styles.iosModalBase}>
              <Pressable
                style={styles.iosDim}
                onPress={() => {
                  if (datePickerCommitRef.current) {
                    setExpenseAt(datePickerCommitRef.current);
                  }
                  setIosDatePicker(false);
                }}
                accessibilityLabel={t("addExpense.cancel")}
              />
              <View style={styles.iosSheet}>
                <View style={styles.iosTopBar}>
                  <Pressable
                    onPress={() => {
                      if (datePickerCommitRef.current) {
                        setExpenseAt(datePickerCommitRef.current);
                      }
                      setIosDatePicker(false);
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel={t("addExpense.cancel")}
                  >
                    <Text style={styles.iosModalCancel}>
                      {t("addExpense.cancel")}
                    </Text>
                  </Pressable>
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
                  mode="date"
                  display="inline"
                  onChange={(_e, d) => {
                    if (d) {
                      setExpenseAt(mergeDatePart(expenseAt, d));
                    }
                  }}
                  accentColor={colors.primary}
                  textColor={colors.text}
                  themeVariant={resolvedScheme === "dark" ? "dark" : "light"}
                />
                <View style={styles.iosTimeRow}>
                  <Text style={styles.iosTimeLabel}>
                    {t("addExpense.time")}
                  </Text>
                  <DateTimePicker
                    value={expenseAt}
                    mode="time"
                    display="default"
                    onChange={(_e, d) => {
                      if (d) {
                        setExpenseAt(mergeTimePart(expenseAt, d));
                      }
                    }}
                    accentColor={colors.primary}
                    textColor={colors.text}
                    themeVariant={resolvedScheme === "dark" ? "dark" : "light"}
                  />
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
        {Platform.OS === "web" ? (
          <Modal
            visible={webDatePicker}
            transparent
            animationType="fade"
            onRequestClose={() => setWebDatePicker(false)}
          >
            <View style={styles.iosModalBase}>
              <Pressable
                style={styles.iosDim}
                onPress={() => {
                  if (datePickerCommitRef.current) {
                    setExpenseAt(datePickerCommitRef.current);
                  }
                  setWebDatePicker(false);
                }}
                accessibilityLabel={t("addExpense.cancel")}
              />
              <View style={styles.iosSheet}>
                <View style={styles.iosTopBar}>
                  <Pressable
                    onPress={() => {
                      if (datePickerCommitRef.current) {
                        setExpenseAt(datePickerCommitRef.current);
                      }
                      setWebDatePicker(false);
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel={t("addExpense.cancel")}
                  >
                    <Text style={styles.iosModalCancel}>
                      {t("addExpense.cancel")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setWebDatePicker(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel={t("createGroup.done")}
                  >
                    <Text style={styles.iosModalDone}>
                      {t("createGroup.done")}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ padding: 16 }}>
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
                  } as Parameters<typeof createElement>[1])}
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
        <Modal
          visible={joinQrOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setJoinQrOpen(false)}
        >
          <View style={styles.groupModalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setJoinQrOpen(false)}
              accessibilityLabel={t("joinQr.closeButton")}
            />
            <View
              style={[
                styles.groupModalSheet,
                {
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: Math.max(16, insets.bottom),
                },
              ]}
            >
              <JoinQrCard
                url={
                  expenseId
                    ? buildExpenseInviteUrl(expenseId)
                    : buildInviteUrl(groupId)
                }
                subtitle={
                  expenseId
                    ? t("joinQr.expenseSubtitle")
                    : t("joinQr.groupSubtitle")
                }
                size={220}
              />
              <AppButton
                variant="secondary"
                fullWidth
                label={t("joinQr.closeButton")}
                onPress={() => setJoinQrOpen(false)}
                style={{ marginTop: 14 }}
              />
            </View>
          </View>
        </Modal>
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
                ListFooterComponent={
                  <Pressable
                    style={styles.groupModalRow}
                    onPress={() => {
                      setGroupPickerOpen(false);
                      navigation.navigate("CreateGroup");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("nav.newGroup")}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={22}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.groupModalRowText,
                        { color: colors.primary, marginLeft: 8 },
                      ]}
                      numberOfLines={1}
                    >
                      {t("nav.newGroup")}
                    </Text>
                  </Pressable>
                }
              />
            </View>
          </View>
        </Modal>
        <Modal
          visible={payerPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPayerPickerOpen(false)}
        >
          <View style={styles.groupModalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPayerPickerOpen(false)}
              accessibilityLabel={t("addExpense.cancel")}
            />
            <View
              style={[
                styles.groupModalSheet,
                { paddingBottom: Math.max(12, insets.bottom) },
              ]}
            >
              <Text style={styles.groupModalTitle}>
                {t("addExpense.payerPickerTitle")}
              </Text>
              <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const on = item.id === payerId;
                  const display = item.id === myId
                    ? t("addExpense.chipsYouLabel")
                    : item.name || t("addExpense.memberFallback");
                  return (
                    <Pressable
                      style={[
                        styles.groupModalRow,
                        on && styles.groupModalRowOn,
                      ]}
                      onPress={() => {
                        setPayerId(item.id);
                        setPayerPickerOpen(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <PersonAvatar
                        name={item.name}
                        avatarUri={item.id === myId ? myAvatarUri : null}
                        size={28}
                        containerStyle={styles.chipAvatar}
                        letterStyle={styles.chipLetter}
                        letterOverride={initial(item.name)}
                      />
                      <Text
                        style={styles.groupModalRowText}
                        numberOfLines={1}
                      >
                        {display}
                      </Text>
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
            </View>
            <TextInput
              style={[styles.input, styles.currencySearchField]}
              value={currencySearch}
              onChangeText={setCurrencySearch}
              placeholder={t("addExpense.currencySearchPlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
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
      </View>
    </KeyboardAvoidingView>
  );
}

function initial(name: string): string {
  const s = name.trim();
  return s ? s.slice(0, 1).toUpperCase() : "?";
}

