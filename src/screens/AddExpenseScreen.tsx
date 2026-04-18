import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import { useDatabase } from "../db/DatabaseContext";
import type { GroupsStackParamList } from "../navigation/types";
import {
  addExpenseWithSplits,
  formatMinor,
  formatSignedMoneyInputDisplay,
  formatUnsignedMoneyInputDisplay,
  getExpenseWithSplits,
  getGroup,
  listMembers,
  LOCAL_USER_ID,
  minorToAmountString,
  parseMoneyToMinor,
  parseSignedMoneyToMinor,
  updateExpenseWithSplits,
  type MemberRow,
} from "../data/tallyRepo";
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

type Props = NativeStackScreenProps<GroupsStackParamList, "AddExpense">;

type SplitMode = "equal" | "exact" | "percent" | "shares" | "adjust";

const SPLIT_ICONS: Record<SplitMode, string> = {
  equal: "=",
  exact: "123",
  percent: "%",
  shares: "Ξ",
  adjust: "±",
};

const WIDE_LAYOUT = 900;

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

function buildAddExpenseStyles(colors: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  scrollWide: { paddingHorizontal: 24, maxWidth: 1100, alignSelf: "center", width: "100%" },
  pageKicker: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 16,
    marginTop: 4,
  },
  pageRow: { gap: 16 },
  pageRowWide: { flexDirection: "row", alignItems: "flex-start" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
  },
  cardHalf: { flex: 1, minWidth: 280 },
  cardHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  withLine: { fontSize: 15, color: colors.text, marginBottom: 8 },
  withMuted: { color: colors.muted, fontWeight: "500" },
  withStrong: { fontWeight: "700", color: colors.text },
  memberChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  memberChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  memberChipText: { fontSize: 14, fontWeight: "600", color: colors.text },
  catGlyph: { fontSize: 28, textAlign: "center", marginBottom: 4 },
  summaryLine: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  summaryEm: { fontWeight: "700", color: colors.primary },
  summarySub: { fontSize: 13, color: colors.muted, fontWeight: "500" },
  splitToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  toolBtn: {
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 8,
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
  toolBtnGlyph: { fontSize: 16, fontWeight: "700", color: colors.muted },
  toolBtnGlyphOn: { color: colors.primary },
  toolBtnLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  toolBtnLabelOn: { color: colors.primary, fontWeight: "700" },
  splitModeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    paddingTop: 8,
  },
  footerBtn: { flex: 1, marginTop: 0 },
  footerSave: { backgroundColor: colors.primary },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 20,
  },
  navBtn: { flex: 1, marginTop: 0 },
  secondaryNav: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  secondaryNavText: { fontSize: 16, fontWeight: "600", color: colors.text },
  currencyHint: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 4,
  },
  bigAmount: {
    fontSize: 44,
    fontWeight: "700",
    textAlign: "center",
    color: colors.text,
    marginBottom: 20,
    paddingVertical: 8,
  },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
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
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  catChip: {
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
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  checkShareMuted: { color: colors.muted, fontWeight: "500" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  checkboxMark: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 15,
  },
  checkLabel: { fontSize: 16, color: colors.text, flex: 1, minWidth: 0 },
  checkAmt: {
    marginLeft: "auto",
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    minWidth: 96,
    textAlign: "right",
  },
  inlineMoney: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    minWidth: 100,
    textAlign: "right",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  inlineName: { width: 100, fontSize: 15, color: colors.text },
  inlineInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  pctSuffix: { width: 20, fontSize: 16, color: colors.muted },
  errText: { color: colors.owe, marginTop: 10, fontSize: 14 },
  payerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  avatarBtn: {
    width: 76,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatarBtnOn: { borderColor: colors.primary, backgroundColor: colors.owedSoft },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  avatarName: { fontSize: 11, color: colors.muted, marginTop: 4 },
  avatarNameOn: { color: colors.text, fontWeight: "600" },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: colors.accent,
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
  const { t, locale: appLocale } = useLocale();
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
        { key: "home" as const, labelKey: "categories.home" as const },
        { key: "transport" as const, labelKey: "categories.transport" as const },
      ].map((c) => ({ ...c, label: t(c.labelKey) })),
    [t],
  );
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [payerId, setPayerId] = useState(LOCAL_USER_ID);
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
  const [busy, setBusy] = useState(false);
  const [expenseAt, setExpenseAt] = useState(() => new Date());
  const [iosDatePicker, setIosDatePicker] = useState(false);
  const { width: windowWidth } = useWindowDimensions();

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
    const m = await listMembers(db, groupId);
    setMembers(m);
    const g = await getGroup(db, groupId);
    const curCurrency = g?.currency ?? "USD";
    if (g) {
      setCurrency(g.currency);
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
      setAmountText(minorToAmountString(expense.amount_minor, curCurrency));
      setPayerId(
        m.some((x) => x.id === expense.payer_id)
          ? expense.payer_id
          : (m[0]?.id ?? LOCAL_USER_ID),
      );
      setCategory(expense.category);
      setExpenseAt(parseStoredExpenseToDate(expense.expense_date));
      setSplitMode("exact");
      const splitMap = new Map(splits.map((s) => [s.user_id, s.owed_minor]));
      let memberSum = 0;
      const nextExact: Record<string, string> = {};
      for (const x of m) {
        const owed = splitMap.get(x.id) ?? 0;
        memberSum += owed;
        nextExact[x.id] = minorToAmountString(owed, curCurrency);
      }
      const remainder = expense.amount_minor - memberSum;
      if (remainder !== 0 && m.some((x) => x.id === expense.payer_id)) {
        const pid = expense.payer_id;
        const prevMinor = splitMap.get(pid) ?? 0;
        nextExact[pid] = minorToAmountString(prevMinor + remainder, curCurrency);
      }
      setExactText((prev) => {
        const merged = { ...prev };
        for (const x of m) merged[x.id] = nextExact[x.id] ?? "";
        return merged;
      });
      setEqualOn((prev) => {
        const next: Record<string, boolean> = {};
        for (const x of m) next[x.id] = prev[x.id] ?? true;
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

    setExpenseAt(new Date());
    setPayerId((prev) =>
      m.some((x) => x.id === prev) ? prev : (m[0]?.id ?? LOCAL_USER_ID),
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
      return p !== null ? minorToAmountString(p, currency) : prev;
    });
  }, [currency]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const amountMinor = parseMoneyToMinor(amountText, currency);

  const memberIdsKey = useMemo(
    () => members.map((m) => m.id).join("\n"),
    [members],
  );

  useEffect(() => {
    if (expenseId) return;
    if (splitMode !== "exact" || amountMinor === null || members.length === 0) {
      return;
    }
    const map = splitEqualMinor(
      amountMinor,
      members.map((m) => m.id),
    );
    setExactText((prev) => {
      const next = { ...prev };
      for (const m of members) {
        next[m.id] = minorToAmountString(map.get(m.id) ?? 0, currency);
      }
      return next;
    });
  }, [expenseId, splitMode, amountMinor, memberIdsKey, currency, members]);

  useEffect(() => {
    if (splitMode !== "percent" || members.length === 0) return;
    const parts = equalIntegerPercents(members.length);
    setPercentText((prev) => {
      const next = { ...prev };
      members.forEach((m, i) => {
        next[m.id] = String(parts[i] ?? 0);
      });
      return next;
    });
  }, [splitMode, memberIdsKey, members]);

  useEffect(() => {
    if (splitMode !== "shares" || members.length === 0) return;
    setSharesText((prev) => {
      const next = { ...prev };
      for (const m of members) next[m.id] = "1";
      return next;
    });
  }, [splitMode, memberIdsKey, members]);

  const amountFieldPlaceholder = minorToAmountString(0, currency);

  const validationErrorKey = useMemo((): string | null => {
    if (amountMinor === null || members.length === 0) return null;
    if (splitMode === "equal") {
      const sel = members.filter((m) => equalOn[m.id]);
      if (sel.length === 0) return "addExpense.errSelectSplit";
      return null;
    }
    if (splitMode === "exact") {
      let sum = 0;
      for (const m of members) {
        const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
        if (v === null) return "addExpense.errExactEach";
        sum += v;
      }
      if (sum !== amountMinor) return "addExpense.errExactSum";
      return null;
    }
    if (splitMode === "percent") {
      let sum = 0;
      for (const m of members) {
        const raw = (percentText[m.id] ?? "").trim();
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return "addExpense.errPercentRange";
        }
        sum += n;
      }
      if (sum !== 100) return "addExpense.errPercentSum";
      return null;
    }
    if (splitMode === "shares") {
      let sum = 0;
      for (const m of members) {
        const raw = (sharesText[m.id] ?? "").trim();
        const n = Number.parseInt(raw, 10);
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

  const validationError = validationErrorKey ? t(validationErrorKey) : null;

  const canSave =
    Boolean(description.trim()) &&
    amountMinor !== null &&
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
        minor: parseMoneyToMinor(exactText[m.id] ?? "", currency) ?? 0,
      }));
      return splitExactMinor(amountMinor, parts);
    }
    if (splitMode === "percent") {
      const parts = members.map((m) => ({
        userId: m.id,
        percent: Number.parseInt((percentText[m.id] ?? "").trim(), 10),
      }));
      return splitPercentMinor(amountMinor, parts);
    }
    const parts = members.map((m) => ({
      userId: m.id,
      shares: Number.parseInt((sharesText[m.id] ?? "").trim(), 10),
    }));
    return splitSharesMinor(amountMinor, parts);
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
      const v = parseMoneyToMinor(exactText[m.id] ?? "", currency);
      if (v === null) {
        return splitEqualMinor(amountMinor, members.map((x) => x.id));
      }
      minors.push({ userId: m.id, minor: v });
      sum += v;
    }
    if (sum === amountMinor) {
      return new Map(minors.map((p) => [p.userId, p.minor]));
    }
    return splitEqualMinor(amountMinor, members.map((x) => x.id));
  }, [amountMinor, members, splitMode, exactText, currency]);

  const livePercentMoney = useMemo(() => {
    if (amountMinor === null || members.length === 0 || splitMode !== "percent") {
      return null;
    }
    try {
      const parts = members.map((m) => ({
        userId: m.id,
        percent: Number.parseInt((percentText[m.id] ?? "").trim(), 10),
      }));
      if (parts.some((p) => !Number.isFinite(p.percent) || p.percent < 0)) {
        throw new Error("invalid");
      }
      return splitPercentMinor(amountMinor, parts);
    } catch {
      try {
        const eq = equalIntegerPercents(members.length);
        const parts = members.map((m, i) => ({
          userId: m.id,
          percent: eq[i] ?? 0,
        }));
        return splitPercentMinor(amountMinor, parts);
      } catch {
        return null;
      }
    }
  }, [amountMinor, members, splitMode, percentText, currency]);

  const liveSharesMoney = useMemo(() => {
    if (amountMinor === null || members.length === 0 || splitMode !== "shares") {
      return null;
    }
    try {
      const parts = members.map((m) => ({
        userId: m.id,
        shares: Number.parseInt((sharesText[m.id] ?? "").trim(), 10),
      }));
      if (parts.some((p) => !Number.isFinite(p.shares) || p.shares <= 0)) {
        return splitSharesMinor(
          amountMinor,
          members.map((m) => ({ userId: m.id, shares: 1 })),
        );
      }
      return splitSharesMinor(amountMinor, parts);
    } catch {
      return null;
    }
  }, [amountMinor, members, splitMode, sharesText, currency]);

  const liveSummaryMap = useMemo(() => {
    if (amountMinor === null || members.length === 0) return null;
    switch (splitMode) {
      case "equal":
      case "adjust":
        return liveEqualAdjustShares;
      case "exact":
        return liveExactMoney;
      case "percent":
        return livePercentMoney;
      case "shares":
        return liveSharesMoney;
      default:
        return null;
    }
  }, [
    amountMinor,
    members.length,
    splitMode,
    liveEqualAdjustShares,
    liveExactMoney,
    livePercentMoney,
    liveSharesMoney,
  ]);

  const owedPreview = useMemo(() => {
    if (amountMinor === null || members.length === 0 || validationErrorKey) {
      return null;
    }
    try {
      return buildOwedMap();
    } catch {
      return null;
    }
  }, [
    amountMinor,
    members,
    validationErrorKey,
    splitMode,
    equalOn,
    exactText,
    percentText,
    sharesText,
    adjText,
  ]);

  const save = async () => {
    if (!canSave || amountMinor === null) return;
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
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  const wide = windowWidth >= WIDE_LAYOUT;
  const payerName =
    members.find((m) => m.id === payerId)?.name ?? t("addExpense.memberFallback");
  const splitModeKeys = useMemo(
    (): SplitMode[] => ["equal", "exact", "percent", "shares", "adjust"],
    [],
  );
  const percentApprox =
    members.length > 0 ? (100 / members.length).toFixed(2) : "—";

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, wide && styles.scrollWide]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageKicker}>
          {expenseId ? t("nav.editExpense") : t("nav.addExpense")}
        </Text>
        <Text style={styles.pageTitle}>
          {groupName || t("groupDetail.titleFallback")}
        </Text>

        <View style={[styles.pageRow, wide && styles.pageRowWide]}>
          <View style={[styles.card, wide && styles.cardHalf]}>
            <Text style={styles.cardHeader}>{t("addExpense.cardExpense")}</Text>
            <Text style={styles.withLine}>
              <Text style={styles.withMuted}>{t("addExpense.withYouPrefix")}</Text>
              <Text style={styles.withStrong}>{t("addExpense.you")}</Text>
              <Text style={styles.withMuted}>{t("addExpense.withYouSuffix")}</Text>
            </Text>
            <View style={styles.memberChips}>
              {members.map((m) => (
                <View key={m.id} style={styles.memberChip}>
                  <Text style={styles.memberChipText}>{m.name}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.catGlyph} accessibilityLabel={t("addExpense.categoryA11y")}>
              {expenseCategoryGlyph(category)}
            </Text>
            <Text style={styles.currencyHint}>{currency}</Text>
            <TextInput
              style={styles.bigAmount}
              value={amountText}
              onChangeText={(text) =>
                setAmountText(formatUnsignedMoneyInputDisplay(text, currency))
              }
              placeholder={amountFieldPlaceholder}
              keyboardType="decimal-pad"
              editable={!busy}
            />

            <Text style={styles.label}>{t("addExpense.whatWasIt")}</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder={t("addExpense.placeholderDescription")}
              editable={!busy}
            />

            <Text style={styles.label}>{t("addExpense.date")}</Text>
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
                    animationType="slide"
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

            <Text style={styles.label}>{t("addExpense.category")}</Text>
            <View style={styles.catRow}>
              {categoryOptions.map((c) => (
                <Pressable
                  key={c.key === null ? "g" : c.key}
                  style={[
                    styles.catChip,
                    category === c.key && styles.catChipOn,
                  ]}
                  onPress={() => setCategory(c.key)}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      category === c.key && styles.catChipTextOn,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.summaryLine}>
              {t("addExpense.paidBy")}{" "}
              <Text style={styles.summaryEm}>{payerName}</Text>
              {" · "}
              <Text style={styles.summaryEm}>{splitLabels[splitMode]}</Text>
              {amountMinor !== null && liveSummaryMap ? (
                <>
                  {"\n"}
                  <Text style={styles.summarySub}>
                    (
                    {perPersonLine(
                      splitMode === "equal" || splitMode === "adjust"
                        ? members.filter((m) => equalOn[m.id])
                        : members,
                      liveSummaryMap,
                      currency,
                      t,
                    )}
                    )
                  </Text>
                </>
              ) : null}
            </Text>
          </View>

          <View style={[styles.card, wide && styles.cardHalf]}>
            <Text style={styles.cardHeader}>{t("addExpense.splitOptions")}</Text>
            <View style={styles.splitToolbar}>
              {splitModeKeys.map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.toolBtn,
                    splitMode === m && styles.toolBtnOn,
                  ]}
                  onPress={() => setSplitMode(m)}
                >
                  <Text
                    style={[
                      styles.toolBtnGlyph,
                      splitMode === m && styles.toolBtnGlyphOn,
                    ]}
                  >
                    {SPLIT_ICONS[m]}
                  </Text>
                  <Text
                    style={[
                      styles.toolBtnLabel,
                      splitMode === m && styles.toolBtnLabelOn,
                    ]}
                    numberOfLines={1}
                  >
                    {m === "equal"
                      ? t("addExpense.toolEqual")
                      : m === "exact"
                        ? t("addExpense.toolExact")
                        : m === "percent"
                          ? t("addExpense.toolPercent")
                          : m === "shares"
                            ? t("addExpense.toolShares")
                            : t("addExpense.toolAdj")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.splitModeTitle}>{splitLabels[splitMode]}</Text>

        {splitMode === "equal" || splitMode === "adjust" ? (
          <View style={styles.block}>
            <Text style={styles.hint}>{t("addExpense.includeInSplit")}</Text>
            {members.map((m) => {
              const shareText =
                equalOn[m.id] && liveEqualAdjustShares
                  ? formatMinor(liveEqualAdjustShares.get(m.id) ?? 0, currency)
                  : "—";
              const shareMuted = !equalOn[m.id] || !liveEqualAdjustShares;
              return (
                <Pressable
                  key={m.id}
                  style={styles.checkRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: equalOn[m.id] }}
                  accessibilityLabel={`${m.name}, ${
                    equalOn[m.id]
                      ? t("addExpense.a11yIncluded")
                      : t("addExpense.a11yNotIncluded")
                  } ${t("addExpense.inSplit")}`}
                  onPress={() =>
                    setEqualOn((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                  }
                >
                  <View
                    style={[
                      styles.checkbox,
                      equalOn[m.id] && styles.checkboxChecked,
                    ]}
                  >
                    {equalOn[m.id] ? (
                      <Text style={styles.checkboxMark}>✓</Text>
                    ) : null}
                  </View>
                  <Text style={styles.checkLabel}>{m.name}</Text>
                  <Text
                    style={[styles.checkAmt, shareMuted && styles.checkShareMuted]}
                    numberOfLines={1}
                  >
                    {shareText}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {splitMode === "adjust" ? (
          <View style={styles.block}>
            <Text style={styles.hint}>{t("addExpense.adjustHint")}</Text>
            {members.map((m) => (
              <View key={m.id} style={styles.inlineRow}>
                <Text style={styles.inlineName}>{m.name}</Text>
                <TextInput
                  style={styles.inlineInput}
                  value={adjText[m.id] ?? ""}
                  onChangeText={(text) =>
                    setAdjText((prev) => ({
                      ...prev,
                      [m.id]: formatSignedMoneyInputDisplay(text, currency),
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder={amountFieldPlaceholder}
                />
              </View>
            ))}
          </View>
        ) : null}

        {splitMode === "exact" ? (
          <View style={styles.block}>
            <Text style={styles.hint}>{t("addExpense.exactHint")}</Text>
            {members.map((m) => (
              <View key={m.id} style={styles.inlineRow}>
                <Text style={styles.inlineName}>{m.name}</Text>
                <TextInput
                  style={styles.inlineInput}
                  value={exactText[m.id] ?? ""}
                  onChangeText={(text) =>
                    setExactText((prev) => ({
                      ...prev,
                      [m.id]: formatUnsignedMoneyInputDisplay(text, currency),
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder={amountFieldPlaceholder}
                />
              </View>
            ))}
          </View>
        ) : null}

        {splitMode === "percent" ? (
          <View style={styles.block}>
            <Text style={styles.hint}>
              {t("addExpense.percentHint", { pct: percentApprox })}
            </Text>
            {members.map((m) => (
              <View key={m.id} style={styles.inlineRow}>
                <Text style={styles.inlineName}>{m.name}</Text>
                <TextInput
                  style={styles.inlineInput}
                  value={percentText[m.id] ?? ""}
                  onChangeText={(text) =>
                    setPercentText((prev) => ({ ...prev, [m.id]: text }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                />
                <Text style={styles.pctSuffix}>%</Text>
                {livePercentMoney ? (
                  <Text style={styles.inlineMoney} numberOfLines={1}>
                    {formatMinor(livePercentMoney.get(m.id) ?? 0, currency)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {splitMode === "shares" ? (
          <View style={styles.block}>
            <Text style={styles.hint}>{t("addExpense.sharesHint")}</Text>
            {members.map((m) => (
              <View key={m.id} style={styles.inlineRow}>
                <Text style={styles.inlineName}>{m.name}</Text>
                <TextInput
                  style={styles.inlineInput}
                  value={sharesText[m.id] ?? ""}
                  onChangeText={(text) =>
                    setSharesText((prev) => ({ ...prev, [m.id]: text }))
                  }
                  keyboardType="number-pad"
                  placeholder="1"
                />
                {liveSharesMoney ? (
                  <Text style={styles.inlineMoney} numberOfLines={1}>
                    {formatMinor(liveSharesMoney.get(m.id) ?? 0, currency)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

            {validationError ? (
              <Text style={styles.errText}>{validationError}</Text>
            ) : null}

            <Text style={styles.label}>{t("addExpense.whoPaid")}</Text>
            <View style={styles.payerRow}>
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  style={[
                    styles.avatarBtn,
                    payerId === m.id && styles.avatarBtnOn,
                  ]}
                  onPress={() => setPayerId(m.id)}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarLetter}>{initial(m.name)}</Text>
                  </View>
                  <Text
                    style={[
                      styles.avatarName,
                      payerId === m.id && styles.avatarNameOn,
                    ]}
                    numberOfLines={1}
                  >
                    {m.name}
                  </Text>
                </Pressable>
              ))}
            </View>

          </View>
        </View>

        <View style={styles.footerRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryNav,
              styles.footerBtn,
              pressed && styles.pressed,
            ]}
            onPress={() => navigation.goBack()}
            disabled={busy}
          >
            <Text style={styles.secondaryNavText}>{t("addExpense.cancel")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.footerBtn,
              styles.footerSave,
              !canSave && styles.disabled,
              pressed && canSave && styles.pressed,
            ]}
            onPress={save}
            disabled={!canSave}
          >
            <Text style={styles.primaryBtnText}>
              {busy ? t("addExpense.saving") : t("addExpense.save")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function initial(name: string): string {
  const s = name.trim();
  return s ? s.slice(0, 1).toUpperCase() : "?";
}

function expenseCategoryGlyph(cat: string | null): string {
  switch (cat) {
    case "food":
      return "🍽";
    case "home":
      return "🏠";
    case "transport":
      return "🚗";
    default:
      return "🧾";
  }
}

function perPersonLine(
  participants: MemberRow[],
  owed: Map<string, number>,
  currency: string,
  tr: (path: string, vars?: Record<string, string>) => string,
): string {
  if (participants.length === 0) return "";
  const amounts = participants.map((p) => owed.get(p.id) ?? 0);
  const first = amounts[0] ?? 0;
  const same = amounts.every((a) => a === first);
  if (same) {
    return tr("addExpense.perPersonSame", {
      amount: formatMinor(first, currency),
    });
  }
  return participants
    .map((p) => `${p.name} ${formatMinor(owed.get(p.id) ?? 0, currency)}`)
    .join(" · ");
}

