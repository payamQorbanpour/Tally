import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTallyQuery } from "../sync/useTallyQuery";
import {
  formatMinor,
  SQL_GROUP_CATEGORY_TOTALS,
  SQL_GROUP_MONTHLY_TOTALS,
  type GroupCategoryTotalRow,
  type GroupMonthlyTotalRow,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

const MONTH_CAP = 18;

function formatMonthShort(ym: string, appLocale: AppLocale): string {
  const t = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!t) return ym;
  const d = new Date(Number(t[1]), Number(t[2]) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  const loc =
    appLocale === "fa" ? "fa-IR" : appLocale === "es" ? "es" : "en-US";
  return new Intl.DateTimeFormat(loc, { month: "short", year: "2-digit" }).format(
    d,
  );
}

function categoryLabel(
  key: string,
  t: (path: string, vars?: Record<string, string>) => string,
): string {
  if (!key) return t("categories.general");
  const map: Record<string, string> = {
    food: "categories.food",
    home: "categories.home",
    transport: "categories.transport",
  };
  const path = map[key];
  if (path) return t(path);
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function chartPalette(colors: ThemeColors): string[] {
  return [
    colors.primary,
    "#6366f1",
    "#f59e0b",
    colors.owe,
    "#8b5cf6",
    "#14b8a6",
  ];
}

type Props = { groupId: string; currency: string };

export function GroupTotalsBreakdown({ groupId, currency }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useLocale();
  const catParams = useMemo(() => [groupId], [groupId]);
  const categoryRows = useTallyQuery<GroupCategoryTotalRow>(
    SQL_GROUP_CATEGORY_TOTALS,
    catParams,
    { tables: ["expenses"] },
  );
  const monthRows = useTallyQuery<GroupMonthlyTotalRow>(
    SQL_GROUP_MONTHLY_TOTALS,
    catParams,
    { tables: ["expenses"] },
  );

  const palette = useMemo(() => chartPalette(colors), [colors]);

  const categoryTotal = useMemo(
    () => categoryRows.reduce((s, r) => s + r.total_minor, 0),
    [categoryRows],
  );

  const monthsDisplay = useMemo(() => {
    if (monthRows.length <= MONTH_CAP) return monthRows;
    return monthRows.slice(-MONTH_CAP);
  }, [monthRows]);

  const monthMax = useMemo(
    () => monthsDisplay.reduce((m, r) => Math.max(m, r.total_minor), 0),
    [monthsDisplay],
  );

  const styles = useMemo(() => buildStyles(colors), [colors]);

  const empty = categoryRows.length === 0 && monthRows.length === 0;

  if (empty) {
    return (
      <Text style={styles.muted}>{t("groupDetail.totalsEmpty")}</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {categoryRows.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.subsectionTitle}>
            {t("groupDetail.totalsByCategory")}
          </Text>
          <View>
            <View style={styles.stripOuter}>
              <View style={styles.stripInner}>
                {categoryRows.map((r, i) => {
                  const w =
                    categoryTotal > 0
                      ? (r.total_minor / categoryTotal) * 100
                      : 0;
                  return (
                    <View
                      key={`${r.category_key}-${i}`}
                      style={{
                        width: `${w}%`,
                        backgroundColor: palette[i % palette.length],
                        minWidth: r.total_minor > 0 ? 3 : 0,
                      }}
                    />
                  );
                })}
              </View>
            </View>
            {categoryRows.map((r, i) => {
              const pct =
                categoryTotal > 0
                  ? Math.round((r.total_minor / categoryTotal) * 100)
                  : 0;
              const last = i === categoryRows.length - 1;
              return (
                <View
                  key={`${r.category_key}-row-${i}`}
                  style={[styles.catRow, last && styles.catRowLast]}
                >
                  <View style={styles.catRowLeft}>
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: palette[i % palette.length] },
                      ]}
                    />
                    <Text style={styles.catName} numberOfLines={1}>
                      {categoryLabel(r.category_key, t)}
                    </Text>
                  </View>
                  <Text style={styles.catPct}>{pct}%</Text>
                  <Text style={styles.catAmt}>
                    {formatMinor(r.total_minor, currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {monthsDisplay.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.subsectionTitle}>
            {t("groupDetail.totalsByMonth")}
          </Text>
          <View style={styles.barChart}>
            {monthsDisplay.map((m) => {
              const barPx =
                monthMax > 0
                  ? Math.max(
                      8,
                      Math.round((m.total_minor / monthMax) * 100),
                    )
                  : 0;
              return (
                <View key={m.ym} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: barPx }]} />
                  </View>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {formatMonthShort(m.ym, locale)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 20 },
    block: { gap: 10 },
    subsectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.muted,
      marginBottom: 2,
    },
    muted: { color: colors.muted, lineHeight: 20 },
    stripOuter: {
      borderRadius: 8,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputSurface,
    },
    stripInner: { flexDirection: "row", height: 14 },
    catRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    catRowLast: { borderBottomWidth: 0 },
    catRowLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
    },
    swatch: { width: 10, height: 10, borderRadius: 5 },
    catName: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "500" },
    catPct: {
      fontSize: 13,
      color: colors.muted,
      width: 40,
      textAlign: "right",
      fontVariant: ["tabular-nums"],
    },
    catAmt: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
      minWidth: 88,
      textAlign: "right",
    },
    barChart: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 4,
      minHeight: 120,
      paddingTop: 8,
    },
    barCol: { flex: 1, alignItems: "center", minWidth: 0, maxWidth: 72 },
    barTrack: {
      width: "100%",
      height: 100,
      justifyContent: "flex-end",
      borderRadius: 6,
      backgroundColor: colors.inputSurface,
      overflow: "hidden",
    },
    barFill: {
      width: "100%",
      backgroundColor: colors.primary,
      borderBottomLeftRadius: 6,
      borderBottomRightRadius: 6,
    },
    barLabel: {
      marginTop: 6,
      fontSize: 10,
      color: colors.muted,
      textAlign: "center",
    },
  });
}
