import Ionicons from "@expo/vector-icons/Ionicons";
import { createElement, useEffect, useMemo, useState } from "react";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAY_LABELS,
  dateToJalali,
  jalaliMonthLength,
  jalaliToDate,
  saturdayFirstWeekday,
  type JalaaliTriple,
} from "../core/jalali";
import { localizeDigits } from "../data/currencies";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { Text } from "./AppText";

type Props = {
  visible: boolean;
  value: Date;
  onCancel: () => void;
  onDone: (next: Date) => void;
};

function mergeTimeOfDay(base: Date, hours: number, minutes: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}

function buildMonthGrid(year: number, month: number): (JalaaliTriple | null)[][] {
  const length = jalaliMonthLength(year, month);
  const firstWeekday = saturdayFirstWeekday(jalaliToDate({ year, month, day: 1 }));
  const cells: (JalaaliTriple | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= length; day++) cells.push({ year, month, day });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (JalaaliTriple | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Bottom-sheet Jalali (Persian/Shamsi) calendar + time picker for the Farsi
 * locale, matching AddExpenseScreen's iOS date-sheet chrome. Native pickers
 * (`@react-native-community/datetimepicker`) have no Jalali support on any
 * platform, so the day grid is rendered here; only the time-of-day row
 * delegates to the native control (calendar-system-agnostic).
 */
export function JalaliCalendarModal({ visible, value, onCancel, onDone }: Props) {
  const { t } = useLocale();
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(() => buildStyles(colors), [colors]);

  const [draft, setDraft] = useState(value);
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const { year, month } = dateToJalali(value);
    return { year, month };
  });

  useEffect(() => {
    if (visible) {
      setDraft(value);
      const { year, month } = dateToJalali(value);
      setView({ year, month });
    }
  }, [visible, value]);

  const selected = useMemo(() => dateToJalali(draft), [draft]);
  const weeks = useMemo(
    () => buildMonthGrid(view.year, view.month),
    [view.year, view.month],
  );
  const timeLabel = useMemo(
    () =>
      localizeDigits(
        `${String(draft.getHours()).padStart(2, "0")}:${String(
          draft.getMinutes(),
        ).padStart(2, "0")}`,
        "fa",
      ),
    [draft],
  );

  const goPrevMonth = () =>
    setView((v) =>
      v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 },
    );
  const goNextMonth = () =>
    setView((v) =>
      v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 },
    );

  const pickDay = (day: JalaaliTriple) => {
    setDraft((prev) => jalaliToDate(day, prev));
  };

  const openAndroidTimePicker = () => {
    DateTimePickerAndroid.open({
      value: draft,
      mode: "time",
      is24Hour: true,
      onChange: (e: DateTimePickerEvent, picked) => {
        if (e.type === "dismissed" || !picked) return;
        setDraft((prev) => mergeTimeOfDay(prev, picked.getHours(), picked.getMinutes()));
      },
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.base}>
        <Pressable
          style={styles.dim}
          onPress={onCancel}
          accessibilityLabel={t("addExpense.cancel")}
        />
        <View style={styles.sheet}>
          <View style={styles.topBar}>
            <Pressable
              onPress={onCancel}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={t("addExpense.cancel")}
            >
              <Text style={styles.cancelText}>{t("addExpense.cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={() => onDone(draft)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={t("createGroup.done")}
            >
              <Text style={styles.doneText}>{t("createGroup.done")}</Text>
            </Pressable>
          </View>

          <View style={styles.monthNavRow}>
            <Pressable
              onPress={goPrevMonth}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="ماه قبل"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {`${JALALI_MONTH_NAMES[view.month - 1]} ${localizeDigits(String(view.year), "fa")}`}
            </Text>
            <Pressable
              onPress={goNextMonth}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="ماه بعد"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {JALALI_WEEKDAY_LABELS.map((label, i) => (
              <View key={`wd-${i}`} style={styles.dayCell}>
                <Text style={styles.weekdayLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={`week-${wi}`} style={styles.weekRow}>
              {week.map((day, di) => {
                if (!day) {
                  return <View key={`empty-${wi}-${di}`} style={styles.dayCell} />;
                }
                const isSelected =
                  day.year === selected.year &&
                  day.month === selected.month &&
                  day.day === selected.day;
                return (
                  <View key={`d-${wi}-${di}`} style={styles.dayCell}>
                    <Pressable
                      onPress={() => pickDay(day)}
                      style={[styles.dayTouchable, isSelected && styles.daySelected]}
                      accessibilityRole="button"
                      accessibilityLabel={localizeDigits(String(day.day), "fa")}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[styles.dayText, isSelected && styles.dayTextSelected]}
                      >
                        {localizeDigits(String(day.day), "fa")}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}

          <View style={styles.timeRow}>
            <Text style={styles.timeRowLabel}>{t("addExpense.time")}</Text>
            {Platform.OS === "android" ? (
              <Pressable
                onPress={openAndroidTimePicker}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t("addExpense.time")}
              >
                <Text style={styles.timeValue}>{timeLabel}</Text>
              </Pressable>
            ) : Platform.OS === "web" ? (
              createElement("input", {
                "aria-label": t("addExpense.time"),
                type: "time",
                value: `${String(draft.getHours()).padStart(2, "0")}:${String(
                  draft.getMinutes(),
                ).padStart(2, "0")}`,
                onChange: (e: { currentTarget: { value: string } }) => {
                  const v = e.currentTarget.value;
                  const m = /^(\d{2}):(\d{2})$/.exec(v);
                  if (m) {
                    setDraft((prev) => mergeTimeOfDay(prev, Number(m[1]), Number(m[2])));
                  }
                },
                style: {
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 15,
                  color: colors.text,
                  backgroundColor: colors.surface,
                },
              } as Parameters<typeof createElement>[1])
            ) : (
              <DateTimePicker
                value={draft}
                mode="time"
                display="default"
                onChange={(_e, picked) => {
                  if (picked) {
                    setDraft((prev) =>
                      mergeTimeOfDay(prev, picked.getHours(), picked.getMinutes()),
                    );
                  }
                }}
                accentColor={colors.primary}
                textColor={colors.text}
                themeVariant={resolvedScheme === "dark" ? "dark" : "light"}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    base: { flex: 1 },
    dim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: {
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
    topBar: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 10,
    },
    cancelText: { color: colors.muted, fontSize: 16, fontWeight: "500" },
    doneText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
    monthNavRow: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 14,
      paddingBottom: 10,
    },
    monthLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
    weekdayRow: { flexDirection: "row-reverse" },
    weekRow: { flexDirection: "row-reverse" },
    dayCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    weekdayLabel: { fontSize: 12, fontWeight: "600", color: colors.muted },
    dayTouchable: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    daySelected: { backgroundColor: colors.primary },
    dayText: { fontSize: 14, fontWeight: "500", color: colors.text },
    dayTextSelected: { color: "#fff", fontWeight: "700" },
    timeRow: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 12,
      paddingBottom: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 8,
    },
    timeRowLabel: { fontSize: 16, color: colors.text, fontWeight: "500" },
    timeValue: { fontSize: 16, color: colors.primary, fontWeight: "600" },
  });
}
