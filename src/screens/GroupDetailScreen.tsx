import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTallyQuery } from "../sync/useTallyQuery";
import {
  Alert,
  FlatList,
  I18nManager,
  Image,
  InputAccessoryView,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  UIManager,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector, ScrollView as GHScrollView } from "react-native-gesture-handler";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";
import { SwipeableDeleteRow, webMergedDeleteRowContentStyle } from "../ui/SwipeableDeleteRow";
import { AppSwitch } from "../ui/AppSwitch";
import { TextInput } from "../ui/AppTextInput";
import { KeyboardDismissButton } from "../ui/KeyboardDismissButton";
import type { SimplifiedPayment } from "../core/types";
import { simplifyDebts } from "../core/simplifyDebts";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type { GroupsStackParamList } from "../navigation/types";
import { CURRENCY_OPTIONS, currencyLabel } from "../data/currencies";
import {
  isValidEmail,
  isValidOptionalEmail,
  normalizeEmail,
} from "../data/emailValidation";
import {
  addExistingUserToGroup,
  addPersonToGroup,
  createOrUpdateGroupInvite,
  deleteExpense,
  deleteGroup,
  formatMinor,
  getGroup,
  getGroupBalances,
  getGroupDirectPayments,
  SQL_LIST_EXPENSES_WITH_MY_SHARE,
  listMembers,
  getLocalUserId,
  removeMemberFromGroup,
  searchFriendsNotInGroup,
  updateGroup,
  type ExpenseRowWithMyShare,
  type GroupMemberRole,
  type GroupRow,
  type GroupType,
  type MemberRow,
} from "../data/tallyRepo";
import { SegmentedControl } from "../components/SegmentedControl";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { GroupExportReportSnapshot } from "../components/GroupExportReportSnapshot";
import { GroupExpensesEmptyState } from "../components/GroupExpensesEmptyState";
import { GroupTotalsBreakdown } from "../components/GroupTotalsBreakdown";
import { SimplifyDebtsIllustration } from "../components/SimplifyDebtsIllustration";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { fitMoneyListFontSize, moneyTextStyle, uiSansTextStyle } from "../theme/typography";
import { isSupabaseSyncConfigured } from "../sync/config";
import { captureGroupExportPng } from "../core/captureGroupPng";
import {
  buildGroupExportCsv,
  buildGroupExportJsonPayload,
  buildGroupExportReportHtml,
  buildGroupReportModel,
  buildSuggestedSettlementsExportHtml,
  loadGroupExportBundle,
  safeGroupExportFileStem,
  stringifyGroupExportJson,
  type GroupPngSnapshot,
  type SuggestedSettlementsReportModel,
} from "../core/groupExport";
import {
  getTallySloganImageDataUri,
  getTallySloganImageUrlOnWeb,
} from "../core/groupExportBrandImage";
import { categoryIconName } from "../core/categoryIcons";
import { captureReportHtmlAsPng } from "../core/groupExportHtmlToPng";
import { shareGroupPdfFromHtml, shareFileUri, shareTextFile } from "../core/shareExportFile";

type Props = NativeStackScreenProps<GroupsStackParamList, "GroupDetail">;

type DetailTab = "expenses" | "balances" | "totals";

type Translate = (path: string, vars?: Record<string, string>) => string;

/** `MM-DD` and optional time on a second line for the expense list. */
function shortExpenseListDate(stored: string): string {
  const t = /(\d{4})-(\d{2})-(\d{2})/.exec(stored);
  if (!t) return stored;
  const day = `${t[2]}-${t[3]}`;
  const hm = /[Tt\s](\d{2}):(\d{2})/.exec(stored);
  if (hm) {
    return `${day}\n${hm[1]}:${hm[2]}`;
  }
  return day;
}

function formatSectionMonth(ym: string, appLocale: AppLocale): string {
  const t = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!t) return ym;
  const d = new Date(Number(t[1]), Number(t[2]) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  const loc =
    appLocale === "fa" ? "fa-IR" : appLocale === "es" ? "es" : "en-US";
  return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(
    d,
  );
}

function buildGroupDetailStyles(colors: ThemeColors, appLocale: AppLocale) {
  return StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: colors.bg },
  scrollFlex: { flex: 1 },
  scroll: { paddingBottom: 100, backgroundColor: colors.bg },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  fabDisabled: { opacity: 0.45 },
  fabPressed: { opacity: 0.88 },
  fabText: { color: "#fff", fontSize: 32, fontWeight: "300", marginTop: -2 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginRight: 4,
  },
  headerIconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  segmentWrap: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 11,
  },
  segmentOn: {
    backgroundColor: colors.owedSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  segmentText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  segmentTextOn: { color: colors.primary },
  balanceDash: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  balanceDashTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  balanceDashTotalLeft: { flex: 1, minWidth: 0 },
  balanceDashTotalLabelRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  balanceDashTotalLabel: { fontSize: 14, fontWeight: "800", color: colors.text },
  balanceDashSubLine: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: "600" },
  balanceDashTotalAmt: {
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    ...moneyTextStyle(),
    writingDirection: "ltr",
    direction: "ltr",
    textAlign: "right",
    flexShrink: 0,
  },
  balanceDashRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  balanceDashPill: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.inputSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  balanceDashPillLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", marginBottom: 6 },
  balanceDashPillAmt: { fontSize: 21, fontWeight: "800", fontVariant: ["tabular-nums"], ...moneyTextStyle() },
  balancesSummaryStrip: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.owedSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  balancesSummaryStripText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    lineHeight: 20,
  },
  balanceDashOwed: { color: colors.owed },
  balanceDashOwe: { color: colors.owe },
  balanceDashNeutral: { color: colors.muted },
  balanceDashSyncBtn: { padding: 4 },
  simplifyAchievement: {
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.owedSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  simplifyAchievementTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  simplifyAchievementSub: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 8,
  },
  sectionTitleInline: { marginBottom: 0 },
  subtleAddBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  subtleAddText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  memberRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  memberMinusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.owe,
    alignItems: "center",
    justifyContent: "center",
  },
  memberMinusBtnText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "300",
    marginTop: -2,
  },
  peoplePicker: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 10,
  },
  pickerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  friendRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "500",
    color: colors.text,
  },
  friendAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  friendAddBtnText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "300",
    marginTop: -2,
  },
  newPersonLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  muted: { color: colors.muted, lineHeight: 20 },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  person: { fontSize: 16 },
  balanceAmt: { fontSize: 15, color: colors.text },
  pos: { color: colors.owed },
  neg: { color: colors.owe },
  box: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  boxFirst: { marginTop: 4 },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 16,
    marginBottom: 6,
  },
  boxTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 4 },
  boxSub: { fontSize: 12, color: colors.muted, marginBottom: 10 },
  suggestedHeroTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  suggestedHeroSub: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  suggestedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  /** Title next to share control: allow wrapping, no extra bottom gap (row has margin). */
  suggestedHeroTitleInRow: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  suggestedShareBtn: {
    padding: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  settlementsBrandCardBox: {
    marginTop: 12,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
  },
  settlementsAccent: {
    height: 4,
    width: "100%",
    backgroundColor: colors.primary,
  },
  settlementsBrandInner: {
    padding: 12,
    backgroundColor: colors.inputSurface,
  },
  settleCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.inputSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
  },
  settleCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  /** From / to avatars with names beneath (matches AddExpense person tiles). */
  settlePartiesCluster: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  settlePersonCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    alignItems: "center",
  },
  /** Vertically centers the arrow with the 40px avatar row only (not the name line). */
  settleArrowMid: {
    height: 40,
    justifyContent: "center",
    flexShrink: 0,
  },
  settleNameUnder: {
    marginTop: 4,
    textAlign: "center",
    width: "100%",
    minHeight: 32,
  },
  settleNameUnderFrom: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 16,
  },
  settleNameUnderTo: { fontSize: 12, color: colors.muted, lineHeight: 16 },
  settleRightCol: { alignItems: "flex-end", flexShrink: 0, gap: 6 },
  settleAmountLg: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    fontVariant: ["tabular-nums"],
    ...moneyTextStyle(),
  },
  remindBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  remindText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  everyoneToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  everyoneToggleLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  everyoneToggleTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  everyoneToggleHint: { fontSize: 13, fontWeight: "600", color: colors.primary },
  balanceRowWithAvatar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  balanceRowWithAvatarLast: { borderBottomWidth: 0 },
  balancePersonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  balancePersonAvatarLetter: { fontSize: 16, fontWeight: "800" },
  balancePersonMid: { flex: 1, minWidth: 0 },
  balancePersonName: { fontSize: 16, fontWeight: "700", color: colors.text },
  balanceAmtLg: {
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    ...moneyTextStyle(),
    maxWidth: "52%",
    textAlign: "right",
  },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  newPersonBlock: { gap: 6 },
  newPersonEmailField: { marginTop: 0 },
  inviteBlock: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.inputSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 8,
  },
  inviteSectionTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  inviteHint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  inviteSegMargin: { marginTop: 2 },
  flex1: { flex: 1 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.inputSurface,
  },
  secondaryBtnText: { fontWeight: "600" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  linkBtn: { paddingVertical: 4 },
  link: { fontSize: 16, fontWeight: "600", color: colors.primary },
  disabledText: { color: colors.muted },
  /** Spacing between expense cards — must wrap SwipeableDeleteRow, not the card, so the delete strip height matches. */
  expRowListItemWrap: {
    marginBottom: 10,
  },
  expRowOuter: {
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    overflow: "hidden",
  },
  expRow: {
    flex: 1,
    flexDirection: "column",
    flexWrap: "nowrap",
    alignItems: "stretch",
    paddingVertical: 10,
    paddingRight: 4,
    minHeight: 64,
    minWidth: 0,
    gap: 10,
  },
  expRowNum: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    opacity: 0.92,
    marginRight: 8,
    marginTop: 0,
    flexShrink: 0,
  },
  expTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },
  expTopLeft: { flex: 1, minWidth: 0, justifyContent: "center" },
  expDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    opacity: 0.9,
    marginTop: 2,
  },
  expBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  expPeopleCol: { flex: 1, minWidth: 0 },
  expRowFirst: { marginTop: 0 },
  expRowHi: { backgroundColor: colors.inputSurface },
  sectionHeader: {
    backgroundColor: colors.bg,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sectionHeaderText: { fontSize: 13, fontWeight: "700", color: colors.muted, letterSpacing: 0.4 },
  expMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  expDateCol: {
    width: 52,
    alignItems: "center",
    paddingRight: 2,
    flexShrink: 0,
  },
  expDate: { fontSize: 11, color: colors.muted, marginTop: 2, textAlign: "center" },
  catIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 26,
  },
  catIcon: { fontSize: 18, marginTop: 4 },
  expCenter: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
    justifyContent: "center",
  },
  expTitleBold: {
    fontSize: 15,
    color: colors.text,
    ...uiSansTextStyle({ fontWeight: "700" }, appLocale),
  },
  expRightCol: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    flexShrink: 0,
    flexGrow: 0,
    maxWidth: "50%",
    minWidth: 0,
    paddingLeft: 8,
    paddingRight: 14,
  },
  expAmtLg: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    fontVariant: ["tabular-nums"],
    maxWidth: "100%",
    writingDirection: "ltr",
    direction: "ltr",
    textAlign: "right",
    ...moneyTextStyle(),
  },
  expStatus: { fontSize: 11, fontWeight: "600", marginTop: 2, textAlign: "right" },
  expStatusLent: { color: colors.owed },
  expStatusOwe: { color: colors.owe },
  expStatusNeutral: { color: colors.muted },
  expLeft: { flex: 1, minWidth: 0, paddingRight: 8 },
  expRight: { alignItems: "flex-end", paddingLeft: 6 },
  chev: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  expTitle: { fontSize: 16, fontWeight: "500" },
  expMeta: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 3,
    ...uiSansTextStyle({ fontWeight: "400" }, appLocale),
  },
  expPeopleStrip: {
    marginTop: 0,
    /** Stretch to full available width of the expense card. */
    alignSelf: "stretch",
    width: "100%",
    /**
     * Pull to the edges of the center column so the strip feels as wide as the card area,
     * matching the list-row padding.
     */
    marginHorizontal: 0,
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
  expPeopleInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  expPersonWrap: { width: 54, alignItems: "center" },
  expPersonPaidSlot: { height: 18, alignSelf: "stretch", justifyContent: "center", alignItems: "center" },
  expPaidPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    alignSelf: "stretch",
    width: "100%",
  },
  expPaidPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  expAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  expAvatarCirclePayer: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  expAvatarLetter: { fontSize: 16, fontWeight: "800", color: colors.text },
  expAvatarName: {
    marginTop: 4,
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
    width: "100%",
  },
  expAvatarNamePayer: { color: colors.text, fontWeight: "800" },
  expYou: { fontSize: 13, color: colors.text, marginTop: 4, fontWeight: "500" },
  expAmt: { fontSize: 16, fontWeight: "600" },
  mutedSmall: { fontSize: 12, color: colors.muted },
  groupAvatarWrap: { alignSelf: "center", marginBottom: 8 },
  groupAvatarImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  groupAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  groupAvatarPlus: {
    fontSize: 24,
    fontWeight: "300",
    color: colors.primary,
    marginBottom: 2,
  },
  groupAvatarHint: { fontSize: 11, color: colors.muted },
  clearGroupPhoto: { alignSelf: "center", marginBottom: 12 },
  clearGroupPhotoText: { fontSize: 13, color: colors.owe, fontWeight: "600" },
  settingsFieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  groupTextInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  typeChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  currencyPickerField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  currencyPickerText: { flex: 1, fontSize: 16, color: colors.text },
  currencyPickerChevron: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  settingsSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingVertical: 8,
    gap: 12,
  },
  balancesSimplifyCard: {
    marginTop: 4,
    marginBottom: 16,
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
  balancesSimplifySwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingsSwitchLabel: { flex: 1 },
  settingsSwitchTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  settingsSwitchSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 16,
  },
  simplifyBenefitLine: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 6,
    lineHeight: 18,
  },
  saveGroupBtn: { marginTop: 20 },
  saveGroupBtnText: { fontSize: 16, fontWeight: "600" },
  exportSectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 8,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  exportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  exportBtn: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 120,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: 6,
  },
  /** Must stay in the main screen tree (not inside a closed Modal) so view-shot can rasterize on iOS. */
  pngCaptureOuter: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 720,
    /** Not fully 0 — some iOS versions skip compositing opacity-0 views, yielding blank PNGs. */
    opacity: 0.02,
    zIndex: -1,
    pointerEvents: "none",
  },
  currencyModalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  currencyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  currencyModalTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
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
  membersModalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  membersModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  membersModalTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  membersModalDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
  membersModalScroll: { paddingBottom: 40 },
  groupSettingsModalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  groupSettingsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  groupSettingsModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  groupSettingsHeaderActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupSettingsDeleteIconBtn: { padding: 4 },
  groupSettingsModalDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
  groupSettingsModalScroll: { paddingBottom: 48 },
});
}

export function GroupDetailScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const db = useDatabase();
  const bumpGroupsList = useBumpGroupsList();
  const { colors, resolvedScheme } = useTheme();
  const { t, locale, isRTL } = useLocale();
  const styles = useMemo(
    () => buildGroupDetailStyles(colors, locale),
    [colors, locale],
  );
  const groupTypeChips = useMemo(
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
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const myUserId = getLocalUserId();
  const shareParams = useMemo(
    () => [myUserId, groupId],
    [myUserId, groupId],
  );
  const expenses = useTallyQuery<ExpenseRowWithMyShare>(SQL_LIST_EXPENSES_WITH_MY_SHARE, shareParams, {
    tables: ["expenses", "splits", "users"],
  });
  const expenseSections = useMemo((): { title: string; data: ExpenseRowWithMyShare[] }[] => {
    if (expenses.length === 0) return [];
    const by = new Map<string, ExpenseRowWithMyShare[]>();
    for (const e of expenses) {
      const k = e.expense_date.slice(0, 7);
      const list = by.get(k) ?? [];
      list.push(e);
      by.set(k, list);
    }
    return Array.from(by.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, data]) => ({
        title: formatSectionMonth(k, locale),
        data: data.sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
      }));
  }, [expenses, locale]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [directPayments, setDirectPayments] = useState<SimplifiedPayment[]>([]);
  const [tab, setTab] = useState<DetailTab>("expenses");
  const [everyoneExpanded, setEveryoneExpanded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [newPersonInviteRole, setNewPersonInviteRole] =
    useState<GroupMemberRole>("collaborator");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [groupSettingsModalOpen, setGroupSettingsModalOpen] = useState(false);
  const keyboardAccessoryId = "groupDetailKeyboardAccessory";
  const [friendSearch, setFriendSearch] = useState("");
  const [friendResults, setFriendResults] = useState<MemberRow[]>([]);
  const [friendSearchPending, setFriendSearchPending] = useState(false);
  const [addingContactId, setAddingContactId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupCurrencyDraft, setGroupCurrencyDraft] = useState("USD");
  const [groupTypeDraft, setGroupTypeDraft] = useState<GroupType>("other");
  const [simplifyDraft, setSimplifyDraft] = useState(true);
  const [iconDraft, setIconDraft] = useState<string | null>(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [groupSettingsBusy, setGroupSettingsBusy] = useState(false);
  const [groupDeleteBusy, setGroupDeleteBusy] = useState(false);
  const [groupExportBusy, setGroupExportBusy] = useState(false);
  const [outerScrollEnabled, setOuterScrollEnabled] = useState(true);
  const [pngSnapshot, setPngSnapshot] = useState<GroupPngSnapshot | null>(null);
  const pngViewRef = useRef<View>(null);
  const [simplifyBalancesBusy, setSimplifyBalancesBusy] = useState(false);
  const {
    syncState,
    cloudSyncUserEnabled,
    cloudSyncUserPrefReady,
    localUserHasProfileEmail,
    refreshCloudData,
  } = useTallyData();
  const { width: windowWidth } = useWindowDimensions();

  const interactionLocked = busy || groupSettingsBusy || groupDeleteBusy || groupExportBusy;

  const load = useCallback(async () => {
    const g = await getGroup(db, groupId);
    setGroup(g);
    if (g) {
      setGroupNameDraft(g.name);
      setGroupCurrencyDraft(g.currency);
      setGroupTypeDraft(g.group_type);
      setSimplifyDraft(g.simplify_debts);
      setIconDraft(g.icon);
    }
    const m = await listMembers(db, groupId);
    setMembers(m);
    try {
      setBalances(await getGroupBalances(db, groupId));
      setDirectPayments(await getGroupDirectPayments(db, groupId));
    } catch (e) {
      console.warn("Error computing balances:", e);
      setBalances(new Map());
      setDirectPayments([]);
    }
  }, [db, groupId]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: group?.name ?? t("groupDetail.titleFallback"),
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setGroupSettingsModalOpen(true)}
            hitSlop={12}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel={t("groupDetail.a11ySettings")}
          >
            <Ionicons name="cog-outline" size={24} color={colors.text} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, group?.name, t, colors, styles]);

  useEffect(() => {
    if (!membersModalOpen) return;
    setFriendSearchPending(true);
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const rows = await searchFriendsNotInGroup(
          db,
          groupId,
          getLocalUserId(),
          friendSearch,
        );
        if (cancelled) return;
        setFriendResults(rows);
        setFriendSearchPending(false);
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [membersModalOpen, friendSearch, db, groupId]);

  const closeMembersModal = () => {
    setMembersModalOpen(false);
    setFriendSearch("");
    setFriendResults([]);
    setFriendSearchPending(false);
    setNewName("");
    setNewPersonEmail("");
    setNewPersonInviteRole("collaborator");
    setAddingContactId(null);
  };

  const closeGroupSettingsModal = () => {
    setGroupSettingsModalOpen(false);
  };

  const refreshFriendResults = useCallback(async () => {
    const rows = await searchFriendsNotInGroup(
      db,
      groupId,
      getLocalUserId(),
      friendSearch,
    );
    setFriendResults(rows);
  }, [db, groupId, friendSearch]);

  const addMember = async () => {
    if (
      !newName.trim() ||
      interactionLocked ||
      addingContactId !== null ||
      removingMemberId !== null
    )
      return;
    const emailTrim = newPersonEmail.trim();
    if (emailTrim && !isValidOptionalEmail(emailTrim)) {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(t("account.invalidEmail"));
      } else {
        Alert.alert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
      }
      return;
    }
    setBusy(true);
    try {
      await addPersonToGroup(
        db,
        groupId,
        newName.trim(),
        emailTrim ? emailTrim : null,
      );
      if (emailTrim) {
        const em = normalizeEmail(emailTrim);
        if (isValidEmail(em)) {
          try {
            await createOrUpdateGroupInvite(db, {
              groupId,
              email: em,
              role: newPersonInviteRole,
            });
            await refreshCloudData();
          } catch (invErr) {
            const msg =
              invErr instanceof Error ? invErr.message : String(invErr);
            if (Platform.OS === "web") {
              if (typeof window !== "undefined") window.alert(msg);
            } else {
              Alert.alert(t("groupDetail.inviteFailedTitle"), msg);
            }
          }
        }
      }
      setNewName("");
      setNewPersonEmail("");
      setNewPersonInviteRole("collaborator");
      await load();
      await refreshFriendResults();
    } finally {
      setBusy(false);
    }
  };

  const addExistingMember = async (userId: string) => {
    if (addingContactId !== null || interactionLocked || removingMemberId !== null)
      return;
    setAddingContactId(userId);
    try {
      await addExistingUserToGroup(db, groupId, userId);
      await load();
      await refreshFriendResults();
    } finally {
      setAddingContactId(null);
    }
  };

  const performRemoveMember = async (userId: string) => {
    setRemovingMemberId(userId);
    try {
      await removeMemberFromGroup(db, groupId, userId);
      await load();
      if (membersModalOpen) {
        await refreshFriendResults();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("groupDetail.removeFailed");
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(msg);
      } else {
        Alert.alert(t("groupDetail.cannotRemoveTitle"), msg);
      }
    } finally {
      setRemovingMemberId(null);
    }
  };

  const confirmRemoveMember = (m: MemberRow) => {
    const message = t("groupDetail.removeMemberMessage", { name: m.name });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(message)) {
        void performRemoveMember(m.id);
      }
      return;
    }
    Alert.alert(t("groupDetail.removePersonTitle"), message, [
      { text: t("friends.cancel"), style: "cancel" },
      {
        text: t("groupDetail.remove"),
        style: "destructive",
        onPress: () => void performRemoveMember(m.id),
      },
    ]);
  };

  const performDeleteExpense = async (e: ExpenseRowWithMyShare) => {
    if (Platform.OS === "web") {
      LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"));
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setDeletingId(e.id);
    try {
      await deleteExpense(db, groupId, e.id);
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDeleteExpense = (e: ExpenseRowWithMyShare) => {
    const message = t("groupDetail.deleteExpenseMessage", {
      description: e.description,
    });
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(`${t("groupDetail.deleteExpenseTitle")}\n\n${message}`)
      ) {
        void performDeleteExpense(e);
      }
      return;
    }
    Alert.alert(t("groupDetail.deleteExpenseTitle"), message, [
      { text: t("friends.cancel"), style: "cancel" },
      {
        text: t("groupDetail.delete"),
        style: "destructive",
        onPress: () => void performDeleteExpense(e),
      },
    ]);
  };

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return [...CURRENCY_OPTIONS];
    return CURRENCY_OPTIONS.filter(
      (x) =>
        x.code.toLowerCase().includes(q) ||
        x.label.toLowerCase().includes(q),
    );
  }, [currencySearch]);

  const groupDirty = useMemo(() => {
    if (!group) return false;
    const curIcon = iconDraft ?? null;
    const gIcon = group.icon ?? null;
    return (
      groupNameDraft.trim() !== group.name ||
      groupCurrencyDraft.trim().toUpperCase() !== group.currency.toUpperCase() ||
      groupTypeDraft !== group.group_type ||
      simplifyDraft !== group.simplify_debts ||
      curIcon !== gIcon
    );
  }, [
    group,
    groupNameDraft,
    groupCurrencyDraft,
    groupTypeDraft,
    simplifyDraft,
    iconDraft,
  ]);

  const pickGroupIcon = useCallback(async () => {
    if (groupSettingsBusy || groupDeleteBusy) return;
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
      const mime = a.mimeType?.startsWith("image/") ? a.mimeType : "image/jpeg";
      setIconDraft(`data:${mime};base64,${a.base64}`);
    } else if (a.uri) {
      setIconDraft(a.uri);
    }
  }, [groupSettingsBusy, groupDeleteBusy]);

  const saveGroupSettings = useCallback(async () => {
    if (!group || !groupNameDraft.trim() || groupSettingsBusy || groupDeleteBusy) return;
    setGroupSettingsBusy(true);
    try {
      await updateGroup(db, groupId, {
        name: groupNameDraft,
        currency: groupCurrencyDraft,
        icon: iconDraft,
        groupType: groupTypeDraft,
        simplifyDebts: simplifyDraft,
      });
      await load();
      bumpGroupsList();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.alert(`${t("groupDetail.errSave")}\n\n${msg}`);
        }
      } else {
        Alert.alert(t("groupDetail.errSave"), msg);
      }
    } finally {
      setGroupSettingsBusy(false);
    }
  }, [
    bumpGroupsList,
    db,
    group,
    groupId,
    groupNameDraft,
    groupCurrencyDraft,
    iconDraft,
    groupTypeDraft,
    simplifyDraft,
    load,
    groupSettingsBusy,
    groupDeleteBusy,
    t,
  ]);

  const persistSimplifyDebtsFromBalances = useCallback(
    async (next: boolean) => {
      if (!group || simplifyBalancesBusy || groupDeleteBusy) return;
      setSimplifyBalancesBusy(true);
      try {
        await updateGroup(db, groupId, {
          name: group.name,
          currency: group.currency,
          icon: group.icon,
          groupType: group.group_type,
          simplifyDebts: next,
        });
        await load();
        bumpGroupsList();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Check if this is a balance validation error and provide guidance
        const isBalanceError = msg.includes("Split total") && msg.includes("does not match");
        const errorMsg = isBalanceError
          ? `${t("groupDetail.errSave")}\n\nThere's a data issue with group expenses. Please contact support.`
          : `${t("groupDetail.errSave")}\n\n${msg}`;
        if (Platform.OS === "web") {
          if (typeof window !== "undefined") {
            window.alert(errorMsg);
          }
        } else {
          Alert.alert(t("groupDetail.errSave"), isBalanceError ? "Data validation error" : msg);
        }
      } finally {
        setSimplifyBalancesBusy(false);
      }
    },
    [
      bumpGroupsList,
      db,
      group,
      groupId,
      groupDeleteBusy,
      load,
      simplifyBalancesBusy,
      t,
    ],
  );

  const performDeleteGroup = useCallback(async () => {
    setGroupDeleteBusy(true);
    try {
      await deleteGroup(db, groupId);
      bumpGroupsList();
      navigation.pop();
    } finally {
      setGroupDeleteBusy(false);
    }
  }, [bumpGroupsList, db, groupId, navigation]);

  const confirmDeleteGroup = useCallback(() => {
    const msg = t("groupDetail.deleteGroupMessage");
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(`${t("groupList.alertDeleteGroup")}\n\n${msg}`)
      ) {
        void performDeleteGroup();
      }
      return;
    }
    Alert.alert(t("groupList.alertDeleteGroup"), msg, [
      { text: t("friends.cancel"), style: "cancel" },
      {
        text: t("groupList.delete"),
        style: "destructive",
        onPress: () => void performDeleteGroup(),
      },
    ]);
  }, [performDeleteGroup, t]);

  const exportFileStamp = useCallback(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const runGroupExportJson = useCallback(async () => {
    if (groupExportBusy || !group) return;
    setGroupExportBusy(true);
    try {
      const payload = await buildGroupExportJsonPayload(db, groupId);
      const json = stringifyGroupExportJson(payload);
      const stem = safeGroupExportFileStem(group.name);
      await shareTextFile(
        json,
        `tally-${stem}-${exportFileStamp()}.json`,
        "application/json",
        "public.json",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.alert(`${t("account.exportFailedTitle")}\n\n${msg}`);
        }
      } else {
        Alert.alert(t("account.exportFailedTitle"), msg);
      }
    } finally {
      setGroupExportBusy(false);
    }
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t]);

  const runGroupExportCsv = useCallback(async () => {
    if (groupExportBusy || !group) return;
    setGroupExportBusy(true);
    try {
      const bundle = await loadGroupExportBundle(db, groupId);
      const csv = buildGroupExportCsv(bundle);
      const stem = safeGroupExportFileStem(bundle.group.name);
      await shareTextFile(csv, `tally-${stem}-${exportFileStamp()}.csv`, "text/csv", "public.comma-separated-values-text");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.alert(`${t("account.exportFailedTitle")}\n\n${msg}`);
        }
      } else {
        Alert.alert(t("account.exportFailedTitle"), msg);
      }
    } finally {
      setGroupExportBusy(false);
    }
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t]);

  const runGroupExportPdf = useCallback(async () => {
    if (groupExportBusy || !group) return;
    setGroupExportBusy(true);
    try {
      const bundle = await loadGroupExportBundle(db, groupId);
      // Native PDF: skip huge base64 embed — WKWebView / memory on older iPhones can fail; monogram header still applies.
      const brandImageDataUri =
        Platform.OS === "web" ? await getTallySloganImageDataUri() : null;
      const brandImageUrl = Platform.OS === "web" ? await getTallySloganImageUrlOnWeb() : null;
      const html = buildGroupExportReportHtml(bundle, {
        brandImageDataUri,
        brandImageUrl,
      });
      const stem = safeGroupExportFileStem(bundle.group.name);
      await shareGroupPdfFromHtml(html, `tally-${stem}-${exportFileStamp()}.pdf`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.alert(`${t("account.exportFailedTitle")}\n\n${msg}`);
        }
      } else {
        Alert.alert(t("account.exportFailedTitle"), msg);
      }
    } finally {
      setGroupExportBusy(false);
    }
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t]);

  const runGroupExportPng = useCallback(async () => {
    if (groupExportBusy || !group) return;
    setGroupExportBusy(true);
    try {
      const bundle = await loadGroupExportBundle(db, groupId);
      const stem = safeGroupExportFileStem(bundle.group.name);
      const stamp = exportFileStamp();
      if (Platform.OS === "web") {
        const brandImageDataUri = await getTallySloganImageDataUri();
        const brandImageUrl = await getTallySloganImageUrlOnWeb();
        const html = buildGroupExportReportHtml(bundle, {
          brandImageDataUri,
          brandImageUrl,
        });
        const dataUrl = await captureReportHtmlAsPng(html);
        await shareFileUri(dataUrl, `tally-${stem}-${stamp}.png`, "image/png", "public.png");
        return;
      }
      setPngSnapshot({ kind: "expenses", model: buildGroupReportModel(bundle) });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Platform.OS === "ios" ? 520 : 320);
      });
      const out = await captureGroupExportPng(pngViewRef);
      await shareFileUri(
        out as string,
        `tally-${stem}-${stamp}.png`,
        "image/png",
        "public.png",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.alert(`${t("account.exportFailedTitle")}\n\n${msg}`);
        }
      } else {
        Alert.alert(t("account.exportFailedTitle"), msg);
      }
    } finally {
      setPngSnapshot(null);
      setGroupExportBusy(false);
    }
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t]);

  const currency = group?.currency ?? "USD";
  const simplified = useMemo(
    () => simplifyDebts(new Map(balances)),
    [balances],
  );
  const nonSimplified = useMemo(
    () => directPayments,
    [directPayments],
  );
  const sortedSettlements = useMemo(() => {
    const raw = group?.simplify_debts ? simplified : nonSimplified;
    return [...raw].sort((a, b) => b.amountMinor - a.amountMinor);
  }, [group?.simplify_debts, simplified, nonSimplified]);

  const totalSettlementVolumeMinor = useMemo(
    () => sortedSettlements.reduce((s, p) => s + p.amountMinor, 0),
    [sortedSettlements],
  );

  const membersSortedByBalance = useMemo(
    () => sortMembersForNetBalancesList(members, balances),
    [members, balances],
  );

  const groupTotalMinor = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount_minor, 0),
    [expenses],
  );
  const myBalanceMinor = balances.get(getLocalUserId()) ?? 0;

  const nonZeroBalanceCount = useMemo(() => {
    let n = 0;
    for (const v of balances.values()) {
      if (v !== 0) n += 1;
    }
    return n;
  }, [balances]);
  const simplifySavings = useMemo(() => {
    if (nonZeroBalanceCount <= 1) return 0;
    if (simplified.length === 0) return 0;
    return Math.max(0, nonZeroBalanceCount - 1 - simplified.length);
  }, [simplified.length, nonZeroBalanceCount]);

  const cloudConfigured = isSupabaseSyncConfigured();
  const syncIcon = (() => {
    if (!cloudSyncUserPrefReady) {
      return { name: "cloud-outline" as const, color: colors.muted, dim: 0.45 as const };
    }
    if (!cloudSyncUserEnabled || !cloudConfigured || !localUserHasProfileEmail) {
      return { name: "phone-portrait-outline" as const, color: colors.muted, dim: 0.7 as const };
    }
    if (syncState.lastError) {
      return { name: "cloud-offline" as const, color: colors.owe, dim: 1 as const };
    }
    if (syncState.busy) {
      return { name: "sync" as const, color: colors.primary, dim: 1 as const };
    }
    if (syncState.lastOkAt != null) {
      return { name: "cloud-done-outline" as const, color: colors.primary, dim: 1 as const };
    }
    return { name: "cloud-outline" as const, color: colors.muted, dim: 0.85 as const };
  })();

  const addExpenseFab = () => {
    if (members.length === 0 || interactionLocked) return;
    navigation.navigate("AddExpense", { groupId });
  };

  const openCurrencyPicker = () => {
    setCurrencySearch("");
    setCurrencyPickerOpen(true);
  };

  const canSaveGroupSettings =
    Boolean(group) &&
    groupDirty &&
    groupNameDraft.trim().length > 0 &&
    !groupSettingsBusy &&
    !groupDeleteBusy;

  const youAreOwedMinor = myBalanceMinor > 0 ? myBalanceMinor : 0;
  const youOweMinor = myBalanceMinor < 0 ? -myBalanceMinor : 0;

  const settlementArrowName = I18nManager.isRTL ? "arrow-back" : "arrow-forward";

  const shareSuggestedSettlements = useCallback(async () => {
    if (interactionLocked || sortedSettlements.length === 0 || !group) return;
    const groupName = group?.name?.trim() || t("groupDetail.titleFallback");
    const intro = t("groupDetail.shareSettlementsIntro", { group: groupName });
    const lines = sortedSettlements.map((p) => {
      const from = memberLabel(members, p.fromUserId);
      const to = memberLabel(members, p.toUserId);
      const amountStr = formatMinor(p.amountMinor, currency);
      return t("groupDetail.settlementLine", { from, to, amount: amountStr });
    });
    const footer = t("groupDetail.shareSettlementsFooter");
    const message = `${intro}\n\n${lines.map((l) => `• ${l}`).join("\n")}\n\n${footer}`;
    const settlementExportModel: SuggestedSettlementsReportModel = {
      rows: sortedSettlements.map((p) => ({
        payer: memberLabel(members, p.fromUserId),
        payee: memberLabel(members, p.toUserId),
        amount: formatMinor(p.amountMinor, currency),
        payerUserId: p.fromUserId,
        payeeUserId: p.toUserId,
      })),
    };
    try {
      // Also attach a PNG snapshot of suggested settlements (who pays whom).
      // Native: share message + image in one share sheet when supported.
      // Web: download the PNG (share sheet attachment isn't reliable).
      setGroupExportBusy(true);
      const stem = safeGroupExportFileStem(groupName);
      const stamp = exportFileStamp();
      if (Platform.OS === "web") {
        const brandImageDataUri = await getTallySloganImageDataUri();
        const brandImageUrl = await getTallySloganImageUrlOnWeb();
        const html = buildSuggestedSettlementsExportHtml(settlementExportModel, {
          brandImageDataUri,
          brandImageUrl,
        });
        const dataUrl = await captureReportHtmlAsPng(html);
        await shareFileUri(dataUrl, `tally-${stem}-settlements-${stamp}.png`, "image/png", "public.png");
        await Share.share({ message, title: groupName });
        return;
      }
      setPngSnapshot({ kind: "settlements", model: settlementExportModel });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Platform.OS === "ios" ? 520 : 320);
      });
      const pngUri = await captureGroupExportPng(pngViewRef);
      try {
        await Share.share({ message, url: pngUri, title: groupName });
      } catch {
        // Fallback: share text and PNG separately if the platform/app refuses attachments.
        await Share.share({ message, title: groupName });
        await shareFileUri(pngUri, `tally-${stem}-settlements-${stamp}.png`, "image/png", "public.png");
      }
    } catch (e) {
      if (Platform.OS === "web") {
        /* dismissed */
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(t("account.exportFailedTitle"), msg);
      }
    } finally {
      setPngSnapshot(null);
      setGroupExportBusy(false);
    }
  }, [
    interactionLocked,
    sortedSettlements,
    group?.name,
    group,
    members,
    currency,
    t,
    exportFileStamp,
  ]);

  const remindOneSettlement = useCallback(
    async (p: SimplifiedPayment) => {
      if (interactionLocked) return;
      const groupName = group?.name?.trim() || t("groupDetail.titleFallback");
      const from = memberLabel(members, p.fromUserId);
      const to = memberLabel(members, p.toUserId);
      const amountStr = formatMinor(p.amountMinor, currency);
      const line = t("groupDetail.settlementLine", { from, to, amount: amountStr });
      const message = `${t("groupDetail.shareSettlementsIntro", { group: groupName })}\n\n${line}\n\n${t("groupDetail.shareSettlementsFooter")}`;
      try {
        await Share.share({ message, title: groupName });
      } catch {
        /* dismissed or unavailable */
      }
    },
    [interactionLocked, group?.name, members, currency, t],
  );

  const renderSuggestedSettlement = (p: SimplifiedPayment, i: number) => {
    const from = memberLabel(members, p.fromUserId);
    const to = memberLabel(members, p.toUserId);
    const amountStr = formatMinor(p.amountMinor, currency);
    const settlementA11y = t("groupDetail.settlementLine", {
      from,
      to,
      amount: amountStr,
    });
    return (
      <View
        key={`${p.fromUserId}-${p.toUserId}-${i}`}
        style={styles.settleCard}
        accessibilityLabel={settlementA11y}
      >
        <View style={styles.settleCardRow}>
          <View style={styles.settlePartiesCluster}>
            <View style={styles.settlePersonCol}>
              <View
                style={[
                  styles.balancePersonAvatar,
                  avatarBackdropForUserId(p.fromUserId, colors),
                ]}
                accessibilityRole="image"
                accessibilityLabel={from}
              >
                <Text style={[styles.balancePersonAvatarLetter, { color: colors.text }]}>
                  {personInitials(from)}
                </Text>
              </View>
              <Text
                style={[styles.settleNameUnder, styles.settleNameUnderFrom]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {from}
              </Text>
            </View>
            <View style={styles.settleArrowMid}>
              <Ionicons
                name={settlementArrowName}
                size={18}
                color={colors.muted}
                accessibilityElementsHidden
              />
            </View>
            <View style={styles.settlePersonCol}>
              <View
                style={[
                  styles.balancePersonAvatar,
                  avatarBackdropForUserId(p.toUserId, colors),
                ]}
                accessibilityRole="image"
                accessibilityLabel={to}
              >
                <Text style={[styles.balancePersonAvatarLetter, { color: colors.text }]}>
                  {personInitials(to)}
                </Text>
              </View>
              <Text
                style={[styles.settleNameUnder, styles.settleNameUnderTo]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {to}
              </Text>
            </View>
          </View>
          <View style={styles.settleRightCol}>
            <Text style={styles.settleAmountLg} numberOfLines={1}>
              {amountStr}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.remindBtn, pressed && styles.pressed]}
              onPress={() => void remindOneSettlement(p)}
              disabled={interactionLocked}
              accessibilityRole="button"
              accessibilityLabel={t("groupDetail.remind")}
            >
              <Text style={styles.remindText}>{t("groupDetail.remind")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const parseInvolvedPeople = useCallback(
    (e: ExpenseRowWithMyShare): { userId: string; name: string; isPayer: boolean }[] => {
      const ids = (e.involved_user_ids ?? "").split("|").map((s) => s.trim()).filter(Boolean);
      const names = (e.involved_names ?? "").split("|").map((s) => s.trim());
      // Deduplicate by userId (bad data can repeat the same id); merge isPayer with OR.
      const byId = new Map<string, { userId: string; name: string; isPayer: boolean }>();
      for (let i = 0; i < ids.length; i++) {
        const userId = ids[i]!;
        const name = names[i] ?? memberLabel(members, userId);
        const isPayer = userId === e.payer_id;
        const prev = byId.get(userId);
        if (prev) {
          byId.set(userId, {
            userId,
            name: prev.name,
            isPayer: prev.isPayer || isPayer,
          });
        } else {
          byId.set(userId, { userId, name, isPayer });
        }
      }
      const out = Array.from(byId.values());
      // Fallback: if query returns no split participants (shouldn't happen), at least show payer.
      if (out.length === 0) {
        return [{ userId: e.payer_id, name: e.payer_name, isPayer: true }];
      }
      // Ensure payer is visible even if they were excluded somehow.
      if (!out.some((p) => p.userId === e.payer_id)) {
        return [{ userId: e.payer_id, name: e.payer_name, isPayer: true }, ...out];
      }
      return out;
    },
    [members],
  );

  // Guard: when the user drags to scroll (esp. horizontal strips inside rows),
  // don't treat it as a "tap" on the card.
  // Note: on iOS, wiring touch-move handlers on the row itself can interfere with
  // vertical ScrollView scrolling; prefer ScrollView drag callbacks where possible.
  const expPressMovedRef = useRef(false);
  const expRowPressSuppressedRef = useRef(false);

  const expenseIndexById = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (e) m.set(e.id, i + 1);
    }
    return m;
  }, [expenses]);

  const avatarBackdropNonRedForUserId = useCallback(
    (id: string): { backgroundColor: string; borderColor: string } => {
      // Avoid "owe/red" tones for avatars in the expense list.
      const options = [
        { backgroundColor: colors.inputSurface, borderColor: colors.border },
        { backgroundColor: colors.owedSoft, borderColor: colors.primary },
      ] as const;
      let h = 0;
      for (let i = 0; i < id.length; i++) {
        h = (h + id.charCodeAt(i) * (i + 1)) % 1000007;
      }
      return options[Math.abs(h) % options.length]!;
    },
    [colors.border, colors.inputSurface, colors.owedSoft, colors.primary],
  );

  return (
    <View style={styles.screenWrap}>
    <ScrollView
      style={styles.scrollFlex}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={outerScrollEnabled}
    >
      <View style={styles.segmentWrap}>
        {(
          [
            ["expenses", t("groupDetail.tabExpenses")],
            ["balances", t("groupDetail.tabBalances")],
            ["totals", t("groupDetail.tabTotals")],
          ] as const
        ).map(([k, label]) => (
          <Pressable
            key={k}
            style={[styles.segment, tab === k && styles.segmentOn]}
            onPress={() => setTab(k)}
            disabled={interactionLocked}
          >
            <Text style={[styles.segmentText, tab === k && styles.segmentTextOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.balanceDash}>
        <View style={styles.balanceDashTop}>
          <View style={styles.balanceDashTotalLeft}>
            <View style={styles.balanceDashTotalLabelRow}>
              <Text style={styles.balanceDashTotalLabel} numberOfLines={1}>
                {t("groupDetail.groupTotal")}
              </Text>
            </View>
            <Text style={styles.balanceDashSubLine} numberOfLines={1}>
              {t("groupDetail.expensesCount", { count: String(expenses.length) })}
            </Text>
          </View>
          <Text style={styles.balanceDashTotalAmt} numberOfLines={1}>
            {formatMinor(groupTotalMinor, currency)}
          </Text>
          <View
            style={{ opacity: syncIcon.dim }}
            accessibilityLabel={t("groupDetail.a11ySyncStatus")}
            accessibilityRole="text"
          >
            <Ionicons name={syncIcon.name} size={18} color={syncIcon.color} />
          </View>
        </View>
        <View style={styles.balanceDashRow}>
          <View style={styles.balanceDashPill}>
            <Text style={styles.balanceDashPillLabel}>
              {t("groupDetail.summaryTheyOweYou")}
            </Text>
            <Text
              style={[
                styles.balanceDashPillAmt,
                youAreOwedMinor === 0
                  ? styles.balanceDashNeutral
                  : styles.balanceDashOwed,
              ]}
            >
              {formatMinor(youAreOwedMinor, currency)}
            </Text>
          </View>
          <View style={styles.balanceDashPill}>
            <Text style={styles.balanceDashPillLabel}>
              {t("groupDetail.summaryYouOwe")}
            </Text>
            <Text
              style={[
                styles.balanceDashPillAmt,
                youOweMinor === 0
                  ? styles.balanceDashNeutral
                  : styles.balanceDashOwe,
              ]}
            >
              {formatMinor(youOweMinor, currency)}
            </Text>
          </View>
        </View>
      </View>

      {tab === "balances" && sortedSettlements.length > 0 ? (
        <View style={styles.balancesSummaryStrip}>
          <Text style={styles.balancesSummaryStripText}>
            {t("groupDetail.balancesSettlementSummary", {
              count: String(sortedSettlements.length),
              amount: formatMinor(totalSettlementVolumeMinor, currency),
            })}
          </Text>
        </View>
      ) : null}

      {tab === "balances" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("groupDetail.balances")}</Text>
          <View style={styles.balancesSimplifyCard}>
            <View style={styles.balancesSimplifySwitchRow}>
              <View style={styles.settingsSwitchLabel}>
                <Text style={styles.settingsSwitchTitle}>
                  {t("groupDetail.simplifyDebts")}
                </Text>
                <Text style={styles.settingsSwitchSub}>
                  {t("groupDetail.simplifyHint")}
                </Text>
                <Text style={styles.simplifyBenefitLine}>
                  {t("groupDetail.simplifyBenefitOneLiner")}
                </Text>
              </View>
              <AppSwitch
                value={group?.simplify_debts ?? true}
                onValueChange={(v) => void persistSimplifyDebtsFromBalances(v)}
                disabled={!group || simplifyBalancesBusy || groupDeleteBusy}
              />
            </View>
            <SimplifyDebtsIllustration
              colors={colors}
              caption={t("createGroup.simplifyIllustrationCaption")}
              simplifyWord={t("createGroup.simplifyDiagramWord")}
              onePaymentLabel={t("createGroup.simplifyOnePayment")}
            />
          </View>
          {group?.simplify_debts && simplifySavings > 0 ? (
            <View style={styles.simplifyAchievement}>
              <Text style={styles.simplifyAchievementTitle}>
                {t("groupDetail.simplifyAchievementTitle")}
              </Text>
              <Text style={styles.simplifyAchievementSub}>
                {t("groupDetail.simplifyAchievementBody", {
                  count: String(simplifySavings),
                })}
              </Text>
            </View>
          ) : null}
          {group?.simplify_debts ? (
            <>
              {sortedSettlements.length > 0 ? (
                <View style={[styles.settlementsBrandCardBox, styles.boxFirst]}>
                  <View style={styles.settlementsAccent} />
                  <View style={styles.settlementsBrandInner}>
                    <View style={styles.suggestedTitleRow}>
                      <Text
                        style={[styles.suggestedHeroTitle, styles.suggestedHeroTitleInRow]}
                        numberOfLines={3}
                      >
                        {t("groupDetail.suggestedSettlements")}
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.suggestedShareBtn,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => void shareSuggestedSettlements()}
                        disabled={interactionLocked}
                        accessibilityRole="button"
                        accessibilityLabel={t("groupDetail.shareSettlementsA11y")}
                        hitSlop={10}
                      >
                        <Ionicons
                          name="share-outline"
                          size={22}
                          color={colors.primary}
                        />
                      </Pressable>
                    </View>
                    <Text style={styles.suggestedHeroSub}>
                      {t("groupDetail.suggestedSettlementsSub")}
                    </Text>
                    {sortedSettlements.map(renderSuggestedSettlement)}
                  </View>
                </View>
              ) : (
                <Text style={styles.muted}>
                  {t("groupDetail.allSettledNoPayments")}
                </Text>
              )}
            </>
          ) : (
            <>
              {sortedSettlements.length > 0 ? (
                <View style={[styles.settlementsBrandCardBox, styles.boxFirst]}>
                  <View style={styles.settlementsAccent} />
                  <View style={styles.settlementsBrandInner}>
                    <View style={styles.suggestedTitleRow}>
                      <Text
                        style={[styles.suggestedHeroTitle, styles.suggestedHeroTitleInRow]}
                        numberOfLines={3}
                      >
                        {t("groupDetail.transactionsTitle")}
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.suggestedShareBtn,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => void shareSuggestedSettlements()}
                        disabled={interactionLocked}
                        accessibilityRole="button"
                        accessibilityLabel={t("groupDetail.shareSettlementsA11y")}
                        hitSlop={10}
                      >
                        <Ionicons
                          name="share-outline"
                          size={22}
                          color={colors.primary}
                        />
                      </Pressable>
                    </View>
                    <Text style={styles.suggestedHeroSub}>
                      {t("groupDetail.transactionsSub")}
                    </Text>
                    {sortedSettlements.map(renderSuggestedSettlement)}
                  </View>
                </View>
              ) : (
                <Text style={styles.muted}>
                  {t("groupDetail.allSettledNoPayments")}
                </Text>
              )}
            </>
          )}
          {members.length === 0 ? (
            <Text style={[styles.muted, { marginTop: 16 }]}>
              {t("groupDetail.noPeopleInGroup")}
            </Text>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.everyoneToggle,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setEveryoneExpanded((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: everyoneExpanded }}
                accessibilityLabel={`${t("groupDetail.everyone")}. ${
                  everyoneExpanded
                    ? t("groupDetail.hideNetBalances")
                    : t("groupDetail.showNetBalances")
                }`}
              >
                <View style={styles.everyoneToggleLeft}>
                  <Ionicons
                    name={everyoneExpanded ? "chevron-up" : "chevron-down"}
                    size={22}
                    color={colors.muted}
                  />
                  <Text style={styles.everyoneToggleTitle}>
                    {t("groupDetail.everyone")}
                  </Text>
                </View>
                <Text style={styles.everyoneToggleHint}>
                  {everyoneExpanded
                    ? t("groupDetail.hideNetBalances")
                    : t("groupDetail.showNetBalances")}
                </Text>
              </Pressable>
              {everyoneExpanded
                ? membersSortedByBalance.map((m, idx) => {
                    const raw = balances.get(m.id) ?? 0;
                    const label =
                      raw === 0
                        ? t("groupDetail.balanceSettled")
                        : raw > 0
                          ? t("groupDetail.balanceGetsBack", {
                              amount: formatMinor(raw, currency),
                            })
                          : t("groupDetail.balanceOwes", {
                              amount: formatMinor(-raw, currency),
                            });
                    const av = avatarBackdropForUserId(m.id, colors);
                    const last = idx === membersSortedByBalance.length - 1;
                    return (
                      <View
                        key={m.id}
                        style={[
                          styles.balanceRowWithAvatar,
                          last && styles.balanceRowWithAvatarLast,
                        ]}
                      >
                        <View
                          style={[styles.balancePersonAvatar, av]}
                          accessibilityRole="image"
                          accessibilityLabel={m.name}
                        >
                          <Text
                            style={[
                              styles.balancePersonAvatarLetter,
                              { color: colors.text },
                            ]}
                          >
                            {personInitials(m.name)}
                          </Text>
                        </View>
                        <View style={styles.balancePersonMid}>
                          <Text style={styles.balancePersonName} numberOfLines={1}>
                            {m.name}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.balanceAmtLg,
                            raw > 0 && styles.pos,
                            raw < 0 && styles.neg,
                            raw === 0 && styles.balanceDashNeutral,
                          ]}
                          numberOfLines={2}
                        >
                          {label}
                        </Text>
                      </View>
                    );
                  })
                : null}
            </>
          )}
        </View>
      ) : null}

      {tab === "totals" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("groupDetail.tabTotals")}</Text>
          <GroupTotalsBreakdown groupId={groupId} currency={currency} />
        </View>
      ) : null}

      {tab === "expenses" ? (
        <View style={styles.section}>
        {expenseSections.length === 0 ? (
          <GroupExpensesEmptyState
            colors={colors}
            title={t("groupDetail.emptyTitle")}
            subtitle={t("groupDetail.emptySubtitle")}
            ctaLabel={t("groupDetail.emptyCta")}
            onPress={addExpenseFab}
          />
        ) : (
          expenseSections.map((section) => (
            <View key={section.title}>
              <View
                style={[
                  styles.sectionHeader,
                  Platform.OS === "web" && ({
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  } as unknown as ViewStyle),
                ]}
                accessibilityRole="header"
              >
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
          {section.data.map((e, index) => {
            const status = youStatus(e, currency, t);
            const amountLabel = formatMinor(e.amount_minor, currency);
            const amountFontSize = fitMoneyListFontSize(amountLabel.length, windowWidth);
            const involved = parseInvolvedPeople(e);
            const rowNum = expenseIndexById.get(e.id) ?? 0;
            return (
              <View key={e.id} style={styles.expRowListItemWrap}>
                <SwipeableDeleteRow
                  isRTL={isRTL}
                  cardEdgeRadius={14}
                  sensitivity="sensitive"
                  disabled={deletingId === e.id || interactionLocked}
                  onRequestDelete={() => confirmDeleteExpense(e)}
                  accessibilityLabel={t("groupDetail.deleteExpenseA11y", {
                    description: e.description,
                  })}
                >
                <View
                  style={[
                    styles.expRowOuter,
                    index === 0 && styles.expRowFirst,
                    (deletingId === e.id) && styles.disabled,
                    Platform.OS === "web" && webMergedDeleteRowContentStyle(isRTL, 14),
                  ]}
                >
                  <Pressable
                    onPressIn={() => {
                      expPressMovedRef.current = false;
                      expRowPressSuppressedRef.current = false;
                    }}
                    {...(Platform.OS === "web"
                      ? {
                          onTouchMove: () => {
                            expPressMovedRef.current = true;
                          },
                        }
                      : {})}
                    style={(s) => {
                      const pressed = s.pressed;
                      const hovered =
                        "hovered" in s && s.hovered ? s.hovered : false;
                      const suppressed = expRowPressSuppressedRef.current;
                      return [
                        styles.expRow,
                        // Avoid the temporary "light green rectangle" highlight; keep a subtle opacity only.
                        pressed && !suppressed && styles.pressed,
                        (Platform.OS === "web" && hovered) && styles.pressed,
                      ];
                    }}
                    onPress={() => {
                      if (deletingId === e.id || interactionLocked) return;
                      if (expPressMovedRef.current) return;
                      if (expRowPressSuppressedRef.current) return;
                      navigation.navigate("AddExpense", { groupId, expenseId: e.id });
                    }}
                    disabled={deletingId === e.id || interactionLocked}
                  >
                    <View style={styles.expTopRow}>
                      <Text style={styles.expRowNum} accessibilityElementsHidden>
                        {rowNum > 0 ? `#${rowNum}` : "#"}
                      </Text>
                      <View style={styles.expTopLeft}>
                        <Text style={styles.expTitleBold} numberOfLines={2}>
                          {e.description}
                        </Text>
                      </View>
                      <View style={styles.expRightCol}>
                        <Text
                          style={[styles.expAmtLg, { fontSize: amountFontSize }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit={Platform.OS === "ios"}
                          minimumFontScale={0.65}
                        >
                          {amountLabel}
                        </Text>
                        {status ? (
                          <Text
                            style={[
                              styles.expStatus,
                              status.tone === "lent" && styles.expStatusLent,
                              status.tone === "owe" && styles.expStatusOwe,
                              status.tone === "neutral" && styles.expStatusNeutral,
                            ]}
                            numberOfLines={2}
                          >
                            {status.text}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.expDivider} />
                    <View style={styles.expBottomRow}>
                      <View style={styles.expDateCol}>
                        <View style={styles.catIconWrap} accessibilityElementsHidden>
                          <Ionicons
                            name={categoryIconName(e.category)}
                            size={22}
                            color={colors.primary}
                          />
                        </View>
                        <Text style={styles.expDate}>
                          {shortExpenseListDate(e.expense_date)}
                        </Text>
                      </View>
                      {(() => {
                        const peoplePan = Gesture.Pan()
                          // Only activate for horizontal intent; fail quickly for vertical.
                          .activeOffsetX([-10, 10])
                          .failOffsetY([-8, 8])
                          .onBegin(() => {
                            expRowPressSuppressedRef.current = true;
                            expPressMovedRef.current = true;
                            setOuterScrollEnabled(false);
                          })
                          .onFinalize(() => {
                            setOuterScrollEnabled(true);
                          })
                          .runOnJS(true);

                        const peopleTap = Gesture.Tap()
                          .maxDistance(8)
                          .onEnd((_evt, success) => {
                            if (!success) return;
                            if (deletingId === e.id || interactionLocked) return;
                            // Explicit tap on circles navigates deterministically.
                            navigation.navigate("AddExpense", { groupId, expenseId: e.id });
                          })
                          // Tap should only win if the horizontal pan never activated.
                          .requireExternalGestureToFail(peoplePan)
                          .runOnJS(true);

                        return (
                          <GestureDetector gesture={Gesture.Simultaneous(peoplePan, peopleTap)}>
                            <View style={styles.expPeopleCol}>
                              <GHScrollView
                                horizontal
                                nestedScrollEnabled
                                /** iOS: let vertical swipes scroll the main list reliably. */
                                directionalLockEnabled
                                alwaysBounceHorizontal={false}
                                alwaysBounceVertical={false}
                                scrollEventThrottle={16}
                                showsHorizontalScrollIndicator={false}
                                style={styles.expPeopleStrip}
                                contentContainerStyle={styles.expPeopleInner}
                                onScrollBeginDrag={() => {
                                  expPressMovedRef.current = true;
                                }}
                                onMomentumScrollBegin={() => {
                                  expPressMovedRef.current = true;
                                }}
                                onScrollEndDrag={() => {
                                  setOuterScrollEnabled(true);
                                }}
                                onMomentumScrollEnd={() => {
                                  setOuterScrollEnabled(true);
                                }}
                              >
                          {involved.map((p) => {
                            const av = avatarBackdropNonRedForUserId(p.userId);
                            return (
                              <View key={`${e.id}:${p.userId}`} style={styles.expPersonWrap}>
                                <View style={styles.expPersonPaidSlot}>
                                  {p.isPayer ? (
                                    <View style={styles.expPaidPill}>
                                      <Ionicons
                                        name="wallet-outline"
                                        size={11}
                                        color="#fff"
                                        accessibilityElementsHidden
                                      />
                                      <Text style={styles.expPaidPillText}>
                                        {t("addExpense.paidBadge")}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                                <View
                                  style={[
                                    styles.expAvatarCircle,
                                    { backgroundColor: av.backgroundColor, borderColor: av.borderColor },
                                    p.isPayer && styles.expAvatarCirclePayer,
                                  ]}
                                  accessibilityRole="image"
                                  accessibilityLabel={p.name}
                                >
                                  <Text style={styles.expAvatarLetter}>
                                    {personInitials(p.name)}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.expAvatarName,
                                    p.isPayer && styles.expAvatarNamePayer,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {p.name}
                                </Text>
                              </View>
                            );
                          })}
                              </GHScrollView>
                            </View>
                          </GestureDetector>
                        );
                      })()}
                    </View>
                  </Pressable>
                </View>
                </SwipeableDeleteRow>
              </View>
            );
          })}
            </View>
          ))
        )}
        </View>
      ) : null}
    </ScrollView>

      <Modal
        visible={groupSettingsModalOpen}
        animationType="slide"
        onRequestClose={closeGroupSettingsModal}
      >
        <KeyboardAvoidingView
          style={styles.groupSettingsModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.groupSettingsModalHeader}>
            <Text style={styles.groupSettingsModalTitle} numberOfLines={1}>
              {t("groupDetail.groupSettings")}
            </Text>
            <View style={styles.groupSettingsHeaderActions}>
              <Pressable
                onPress={confirmDeleteGroup}
                style={({ pressed }) => [styles.groupSettingsDeleteIconBtn, pressed && styles.pressed]}
                disabled={groupDeleteBusy || groupSettingsBusy || groupExportBusy}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("groupDetail.deleteGroup")}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={
                    groupDeleteBusy || groupSettingsBusy || groupExportBusy
                      ? colors.muted
                      : colors.owe
                  }
                />
              </Pressable>
              <Pressable onPress={closeGroupSettingsModal} hitSlop={12}>
                <Text style={styles.groupSettingsModalDone}>
                  {t("groupDetail.done")}
                </Text>
              </Pressable>
            </View>
          </View>
          {group ? (
            <>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.groupSettingsModalScroll}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.groupAvatarWrap,
                  pressed && styles.pressed,
                ]}
                onPress={pickGroupIcon}
                disabled={groupSettingsBusy || groupDeleteBusy}
                accessibilityRole="button"
                accessibilityLabel={t("groupDetail.changeIconA11y")}
              >
                {iconDraft ? (
                  <Image source={{ uri: iconDraft }} style={styles.groupAvatarImg} />
                ) : (
                  <View style={styles.groupAvatarPlaceholder}>
                    <Text style={styles.groupAvatarPlus}>+</Text>
                    <Text style={styles.groupAvatarHint}>
                      {t("groupDetail.icon")}
                    </Text>
                  </View>
                )}
              </Pressable>
              {iconDraft ? (
                <Pressable
                  onPress={() => setIconDraft(null)}
                  disabled={groupSettingsBusy || groupDeleteBusy}
                  style={styles.clearGroupPhoto}
                >
                  <Text style={styles.clearGroupPhotoText}>
                    {t("createGroup.removePhoto")}
                  </Text>
                </Pressable>
              ) : null}

              <Text style={styles.settingsFieldLabel}>
                {t("groupDetail.members")}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.groupTextInput,
                  styles.currencyPickerField,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setGroupSettingsModalOpen(false);
                  setMembersModalOpen(true);
                }}
                disabled={groupSettingsBusy || groupDeleteBusy}
                accessibilityRole="button"
                accessibilityLabel={t("groupDetail.a11yMembers")}
              >
                <Ionicons
                  name="people-circle-outline"
                  size={22}
                  color={colors.text}
                />
                <Text style={styles.currencyPickerText} numberOfLines={1}>
                  {t("groupDetail.manageMembers")}
                </Text>
                <Text style={styles.currencyPickerChevron}>
                  {t("groupDetail.choose")}
                </Text>
              </Pressable>

              <Text style={styles.settingsFieldLabel}>
                {t("groupDetail.name")}
              </Text>
              <TextInput
                style={styles.groupTextInput}
                value={groupNameDraft}
                onChangeText={setGroupNameDraft}
                placeholder={t("groupDetail.groupNamePlaceholder")}
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                editable={!groupSettingsBusy && !groupDeleteBusy}
                inputAccessoryViewID={keyboardAccessoryId}
              />

              <Text style={styles.settingsFieldLabel}>
                {t("groupDetail.type")}
              </Text>
              <View style={styles.typeChipRow}>
                {groupTypeChips.map(({ value, label }) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.typeChip,
                      groupTypeDraft === value && styles.typeChipOn,
                    ]}
                    onPress={() => setGroupTypeDraft(value)}
                    disabled={groupSettingsBusy || groupDeleteBusy}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        groupTypeDraft === value && styles.typeChipTextOn,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.settingsFieldLabel}>
                {t("groupDetail.currency")}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.groupTextInput,
                  styles.currencyPickerField,
                  pressed && styles.pressed,
                ]}
                onPress={openCurrencyPicker}
                disabled={groupSettingsBusy || groupDeleteBusy}
              >
                <Text style={styles.currencyPickerText} numberOfLines={2}>
                  {currencyLabel(groupCurrencyDraft)}
                </Text>
                <Text style={styles.currencyPickerChevron}>
                  {t("groupDetail.choose")}
                </Text>
              </Pressable>

              <View style={styles.settingsSwitchRow}>
                <View style={styles.settingsSwitchLabel}>
                  <Text style={styles.settingsSwitchTitle}>
                    {t("groupDetail.simplifyDebts")}
                  </Text>
                  <Text style={styles.settingsSwitchSub}>
                    {t("groupDetail.simplifyHint")}
                  </Text>
                </View>
                <AppSwitch
                  value={simplifyDraft}
                  onValueChange={setSimplifyDraft}
                  disabled={groupSettingsBusy || groupDeleteBusy || groupExportBusy}
                />
              </View>

              <Text style={styles.exportSectionLabel}>{t("groupDetail.exportGroup")}</Text>
              <View style={styles.exportGrid}>
                <Pressable
                  style={({ pressed }) => [
                    styles.exportBtn,
                    (groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.disabled,
                    pressed && !(groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.pressed,
                  ]}
                  onPress={() => void runGroupExportJson()}
                  disabled={groupSettingsBusy || groupDeleteBusy || groupExportBusy}
                  accessibilityRole="button"
                  accessibilityLabel={t("groupDetail.exportJson")}
                >
                  <Ionicons name="code-outline" size={22} color={colors.primary} />
                  <Text style={styles.exportBtnText}>{t("groupDetail.exportJson")}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.exportBtn,
                    (groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.disabled,
                    pressed && !(groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.pressed,
                  ]}
                  onPress={() => void runGroupExportCsv()}
                  disabled={groupSettingsBusy || groupDeleteBusy || groupExportBusy}
                  accessibilityRole="button"
                  accessibilityLabel={t("groupDetail.exportCsv")}
                >
                  <Ionicons name="grid-outline" size={22} color={colors.primary} />
                  <Text style={styles.exportBtnText}>{t("groupDetail.exportCsv")}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.exportBtn,
                    (groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.disabled,
                    pressed && !(groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.pressed,
                  ]}
                  onPress={() => void runGroupExportPng()}
                  disabled={groupSettingsBusy || groupDeleteBusy || groupExportBusy}
                  accessibilityRole="button"
                  accessibilityLabel={t("groupDetail.exportPng")}
                >
                  <Ionicons name="image-outline" size={22} color={colors.primary} />
                  <Text style={styles.exportBtnText}>{t("groupDetail.exportPng")}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.exportBtn,
                    (groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.disabled,
                    pressed && !(groupSettingsBusy || groupDeleteBusy || groupExportBusy) && styles.pressed,
                  ]}
                  onPress={() => void runGroupExportPdf()}
                  disabled={groupSettingsBusy || groupDeleteBusy || groupExportBusy}
                  accessibilityRole="button"
                  accessibilityLabel={t("groupDetail.exportPdf")}
                >
                  <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                  <Text style={styles.exportBtnText}>{t("groupDetail.exportPdf")}</Text>
                </Pressable>
              </View>
              {groupExportBusy ? (
                <Text style={styles.mutedSmall}>{t("groupDetail.exportBusy")}</Text>
              ) : null}

              <AppButton
                variant="primary"
                fullWidth
                style={styles.saveGroupBtn}
                textStyle={styles.saveGroupBtnText}
                label={
                  groupSettingsBusy
                    ? t("groupDetail.saving")
                    : t("groupDetail.saveChanges")
                }
                onPress={() => void saveGroupSettings()}
                disabled={!canSaveGroupSettings || groupSettingsBusy || groupExportBusy}
              />
            </ScrollView>
            </>
          ) : (
            <Text style={styles.muted}>{t("groupDetail.loading")}</Text>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={keyboardAccessoryId}>
          <KeyboardDismissButton colors={colors} isRTL={I18nManager.isRTL} />
        </InputAccessoryView>
      ) : null}

      <Modal
        visible={membersModalOpen}
        animationType="slide"
        onRequestClose={closeMembersModal}
      >
        <KeyboardAvoidingView
          style={styles.membersModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.membersModalHeader}>
            <Text style={styles.membersModalTitle}>
              {t("groupDetail.members")}
            </Text>
            <Pressable onPress={closeMembersModal} hitSlop={12}>
              <Text style={styles.membersModalDone}>
                {t("groupDetail.done")}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.membersModalScroll}
          >
            {members.length === 0 ? (
              <Text style={styles.muted}>
                {t("groupDetail.noOneYet")}
              </Text>
            ) : (
              members.map((m) => {
                const canRemove = members.length > 1;
                const removing = removingMemberId === m.id;
                const blocked =
                  interactionLocked ||
                  addingContactId !== null ||
                  removingMemberId !== null;
                return (
                  <SwipeableDeleteRow
                    key={m.id}
                    isRTL={isRTL}
                    cardEdgeRadius={12}
                    disabled={!canRemove || blocked}
                    onRequestDelete={() => confirmRemoveMember(m)}
                    accessibilityLabel={t("groupDetail.removeMemberA11y", {
                      name: m.name,
                    })}
                    containerStyle={{ width: "100%" }}
                  >
                    <View
                      style={[
                        styles.memberRow,
                        Platform.OS === "web" && webMergedDeleteRowContentStyle(isRTL, 12),
                      ]}
                    >
                      <Text style={styles.memberRowText} numberOfLines={1}>
                        {m.name}
                      </Text>
                      {canRemove ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.memberMinusBtn,
                            blocked && styles.disabled,
                            pressed && !blocked && styles.pressed,
                          ]}
                          onPress={() => confirmRemoveMember(m)}
                          disabled={blocked}
                          accessibilityRole="button"
                          accessibilityLabel={t("groupDetail.removeMemberA11y", {
                            name: m.name,
                          })}
                        >
                          <Text style={styles.memberMinusBtnText}>
                            {removing
                              ? t("groupDetail.expenseDeleteBusy")
                              : "−"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </SwipeableDeleteRow>
                );
              })
            )}
            <View style={styles.peoplePicker}>
              <Text style={styles.pickerHint}>
                {t("groupDetail.fromOtherGroups")}
              </Text>
              <TextInput
                style={styles.input}
                value={friendSearch}
                onChangeText={setFriendSearch}
                placeholder={t("groupDetail.searchFriendsPlaceholder")}
                placeholderTextColor={colors.muted}
                editable={
                  !interactionLocked &&
                  addingContactId === null &&
                  removingMemberId === null
                }
                autoCorrect={false}
                autoCapitalize="words"
              />
              {friendSearchPending ? (
                <Text style={styles.mutedSmall}>
                  {t("createGroup.searching")}
                </Text>
              ) : friendResults.length === 0 ? (
                <Text style={styles.mutedSmall}>
                  {friendSearch.trim()
                    ? t("groupDetail.noMatchingFriends")
                    : t("groupDetail.noPastSplits")}
                </Text>
              ) : (
                friendResults.map((c) => {
                  const adding = addingContactId === c.id;
                  const pickBlocked =
                    addingContactId !== null ||
                    interactionLocked ||
                    removingMemberId !== null;
                  return (
                    <View key={c.id} style={styles.friendRow}>
                      <Text style={styles.friendRowText} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Pressable
                        style={({ pressed }) => [
                          styles.friendAddBtn,
                          pickBlocked && styles.disabled,
                          pressed && !pickBlocked && styles.pressed,
                        ]}
                        onPress={() => void addExistingMember(c.id)}
                        disabled={pickBlocked}
                        accessibilityRole="button"
                        accessibilityLabel={`${t("groupDetail.add")} ${c.name}`}
                      >
                        <Text style={styles.friendAddBtnText}>
                          {adding ? t("groupDetail.expenseDeleteBusy") : "+"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
              <Text style={styles.newPersonLabel}>
                {t("groupDetail.newPerson")}
              </Text>
              <View style={styles.newPersonBlock}>
                <View style={styles.addRow}>
                  <TextInput
                    style={[styles.input, styles.flex1]}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder={t("groupDetail.namePlaceholder")}
                    placeholderTextColor={colors.muted}
                    editable={
                      !interactionLocked &&
                      addingContactId === null &&
                      removingMemberId === null
                    }
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      (!newName.trim() ||
                        interactionLocked ||
                        addingContactId !== null ||
                        removingMemberId !== null) &&
                        styles.disabled,
                      pressed &&
                        newName.trim() &&
                        !interactionLocked &&
                        addingContactId === null &&
                        removingMemberId === null &&
                        styles.pressed,
                    ]}
                    onPress={addMember}
                    disabled={
                      !newName.trim() ||
                      interactionLocked ||
                      addingContactId !== null ||
                      removingMemberId !== null
                    }
                  >
                    <Text style={styles.secondaryBtnText}>
                      {t("groupDetail.add")}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.inviteBlock}>
                  <Text style={styles.inviteSectionTitle}>
                    {t("groupDetail.inviteByEmail")}
                  </Text>
                  <Text style={styles.inviteHint}>{t("groupDetail.inviteHint")}</Text>
                  <View style={styles.inviteSegMargin}>
                    <SegmentedControl
                      options={[
                        {
                          value: "collaborator",
                          label: t("groupDetail.inviteRoleCooperate"),
                        },
                        { value: "viewer", label: t("groupDetail.inviteRoleWatch") },
                      ]}
                      value={newPersonInviteRole}
                      onChange={(v) =>
                        setNewPersonInviteRole(v as GroupMemberRole)
                      }
                      activeBg={colors.primary}
                      activeTextColor={colors.text}
                      inactiveTextColor={colors.muted}
                      trackBg={
                        resolvedScheme === "dark"
                          ? colors.inputSurface
                          : colors.inputSurface
                      }
                    />
                  </View>
                  <Text style={styles.mutedSmall}>{t("account.emailOptional")}</Text>
                  <TextInput
                    style={[styles.input, styles.newPersonEmailField]}
                    value={newPersonEmail}
                    onChangeText={setNewPersonEmail}
                    placeholder={t("groupDetail.inviteEmailPlaceholder")}
                    placeholderTextColor={colors.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={
                      !interactionLocked &&
                      addingContactId === null &&
                      removingMemberId === null
                    }
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
            <Text style={styles.currencyModalTitle}>
              {t("groupDetail.currencyModalTitle")}
            </Text>
            <Pressable onPress={() => setCurrencyPickerOpen(false)} hitSlop={12}>
              <Text style={styles.currencyModalDone}>
                {t("groupDetail.done")}
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.groupTextInput}
            value={currencySearch}
            onChangeText={setCurrencySearch}
            placeholder={t("groupDetail.currencySearchPlaceholder")}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            style={styles.currencyFlatList}
            data={filteredCurrencies}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.currencyRow,
                  item.code === groupCurrencyDraft && styles.currencyRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setGroupCurrencyDraft(item.code);
                  setCurrencyPickerOpen(false);
                }}
              >
                <Text style={styles.currencyRowCode}>{item.code}</Text>
                <Text style={styles.currencyRowLabel}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.currencyEmpty}>
                {t("groupDetail.currencyEmpty")}
              </Text>
            }
          />
        </KeyboardAvoidingView>
      </Modal>
      {group ? (
        <View style={styles.pngCaptureOuter} collapsable={false} pointerEvents="none">
          <GroupExportReportSnapshot ref={pngViewRef} snapshot={pngSnapshot} />
        </View>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          (members.length === 0 || interactionLocked) && styles.fabDisabled,
          pressed && members.length > 0 && !interactionLocked && styles.fabPressed,
        ]}
        onPress={addExpenseFab}
        accessibilityRole="button"
        accessibilityLabel={t("groupDetail.a11yAddExpense")}
        accessibilityState={{ disabled: members.length === 0 || interactionLocked }}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

/** Compact row status: green for lent, orange for owe. */
function youStatus(
  e: ExpenseRowWithMyShare,
  currency: string,
  t: Translate,
): { text: string; tone: "lent" | "owe" | "neutral" } | null {
  const owed = e.my_owed_minor ?? 0;
  if (e.payer_id === getLocalUserId()) {
    const lent = e.amount_minor - owed;
    if (lent > 0) {
      return {
        text: t("groupDetail.youLent", {
          amount: formatMinor(lent, currency),
        }),
        tone: "lent",
      };
    }
    return { text: t("groupDetail.youPaid"), tone: "neutral" };
  }
  if (owed > 0) {
    return {
      text: t("groupDetail.youOweShare", {
        amount: formatMinor(owed, currency),
      }),
      tone: "owe",
    };
  }
  return null;
}

function memberLabel(members: MemberRow[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? id.slice(0, 8);
}

function personInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "•";
  return trimmed.slice(0, 1).toUpperCase();
}

function avatarBackdropForUserId(
  id: string,
  c: ThemeColors,
): { backgroundColor: string; borderColor: string } {
  const options = [
    { backgroundColor: c.inputSurface, borderColor: c.border },
    { backgroundColor: c.owedSoft, borderColor: c.primary },
    { backgroundColor: c.oweSoft, borderColor: c.owe },
  ] as const;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h + id.charCodeAt(i) * (i + 1)) % 1000007;
  }
  return options[Math.abs(h) % options.length]!;
}

/** Owing members first (largest debt first), then people who are owed, then settled. */
function sortMembersForNetBalancesList(
  memberList: MemberRow[],
  bal: Map<string, number>,
): MemberRow[] {
  const owes: MemberRow[] = [];
  const zeros: MemberRow[] = [];
  const gets: MemberRow[] = [];
  for (const m of memberList) {
    const r = bal.get(m.id) ?? 0;
    if (r < 0) owes.push(m);
    else if (r > 0) gets.push(m);
    else zeros.push(m);
  }
  owes.sort((a, b) => (bal.get(a.id) ?? 0) - (bal.get(b.id) ?? 0));
  gets.sort((a, b) => (bal.get(b.id) ?? 0) - (bal.get(a.id) ?? 0));
  zeros.sort((a, b) => a.name.localeCompare(b.name));
  return [...owes, ...gets, ...zeros];
}

