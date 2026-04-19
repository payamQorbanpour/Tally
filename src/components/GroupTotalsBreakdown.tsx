import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../ui/AppText";
import { useTallyQuery } from "../sync/useTallyQuery";
import {
  formatMinor,
  SQL_GROUP_CATEGORY_TOTALS,
  SQL_GROUP_PERSON_SHARE_TOTALS,
  type GroupCategoryTotalRow,
  type GroupPersonShareTotalRow,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

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
  const { t } = useLocale();
  const catParams = useMemo(() => [groupId], [groupId]);
  const categoryRows = useTallyQuery<GroupCategoryTotalRow>(
    SQL_GROUP_CATEGORY_TOTALS,
    catParams,
    { tables: ["expenses"] },
  );
  const personRows = useTallyQuery<GroupPersonShareTotalRow>(
    SQL_GROUP_PERSON_SHARE_TOTALS,
    catParams,
    { tables: ["expenses", "splits"] },
  );

  const palette = useMemo(() => chartPalette(colors), [colors]);

  const categoryTotal = useMemo(
    () => categoryRows.reduce((s, r) => s + r.total_minor, 0),
    [categoryRows],
  );

  const personShareTotal = useMemo(
    () => personRows.reduce((s, r) => s + r.total_minor, 0),
    [personRows],
  );

  const styles = useMemo(() => buildStyles(colors), [colors]);

  const empty =
    categoryRows.length === 0 && personRows.length === 0;

  if (empty) {
    return (
      <Text style={styles.muted}>{t("groupDetail.totalsEmpty")}</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {personRows.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.subsectionTitle}>
            {t("groupDetail.totalsByPerson")}
          </Text>
          <View>
            <View style={styles.stripOuter}>
              <View style={styles.stripInner}>
                {personRows.map((r, i) => {
                  const w =
                    personShareTotal > 0
                      ? (r.total_minor / personShareTotal) * 100
                      : 0;
                  return (
                    <View
                      key={`${r.user_id}-${i}`}
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
            {personRows.map((r, i) => {
              const pct =
                personShareTotal > 0
                  ? Math.round((r.total_minor / personShareTotal) * 100)
                  : 0;
              const last = i === personRows.length - 1;
              return (
                <View
                  key={`${r.user_id}-row-${i}`}
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
                      {r.name}
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
  });
}
