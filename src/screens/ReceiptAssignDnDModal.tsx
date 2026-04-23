import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";
import { formatMinor, type MemberRow } from "../data/tallyRepo";
import { majorFloatToMinor } from "../data/currencies";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

export type AssignableLine = {
  id: string;
  label: string;
  amountMajor: number;
  assigneeId: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onApply: (updated: AssignableLine[]) => void;
  lines: AssignableLine[];
  members: MemberRow[];
  currency: string;
};

type Rect = { x: number; y: number; w: number; h: number };

/** Approximate height of the drag ghost; used to center it under the finger. */
const GHOST_HEIGHT = 48;

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      justifyContent: "space-between",
    },
    headerCenter: { flex: 1, alignItems: "center" },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
    cancel: { color: colors.primary, fontSize: 16, fontWeight: "600" },
    done: { color: colors.primary, fontSize: 16, fontWeight: "700" },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 12 },
    bigTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      marginTop: 4,
    },
    subTitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 16,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginTop: 6,
      marginBottom: 8,
      ...te,
    },
    itemCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 8,
      ...Platform.select({
        ios: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        android: { elevation: 1 },
        default: {},
      }),
    },
    itemLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      minWidth: 0,
    },
    itemAmt: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    dimmed: { opacity: 0.4 },
    empty: {
      color: colors.muted,
      textAlign: "center",
      paddingVertical: 20,
    },
    peopleWrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
      paddingTop: 10,
      paddingHorizontal: 12,
    },
    peopleRow: { flexDirection: "row", gap: 10 },
    personCard: {
      minWidth: 140,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
    },
    personCardHover: {
      borderColor: colors.primary,
      backgroundColor: colors.owedSoft,
    },
    personHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarLetter: { color: "#fff", fontSize: 14, fontWeight: "800" },
    personName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    personTotal: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
      fontVariant: ["tabular-nums"],
      marginTop: 4,
    },
    assignedChip: {
      marginTop: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: colors.inputSurface,
    },
    assignedChipRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
    },
    assignedChipLabel: {
      flex: 1,
      fontSize: 12,
      color: colors.text,
      minWidth: 0,
    },
    assignedChipAmt: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
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
  });
}

function initial(name: string): string {
  const s = name.trim();
  return s ? s.slice(0, 1).toUpperCase() : "?";
}

export function ReceiptAssignDnDModal({
  visible,
  onClose,
  onApply,
  lines: initialLines,
  members,
  currency,
}: Props) {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);

  const [lines, setLines] = useState<AssignableLine[]>(initialLines);

  /**
   * `useState(initialLines)` only captures the first render's value — the
   * modal itself is always mounted (only its `visible` prop toggles), so
   * without this sync the first open would render stale state (e.g. "All
   * items assigned" before the parent had finished parsing). Re-seed from
   * the parent whenever the sheet becomes visible.
   */
  useEffect(() => {
    if (visible) setLines(initialLines);
  }, [visible, initialLines]);
  const [drag, setDrag] = useState<{
    lineId: string;
    pageX: number;
    pageY: number;
    startX: number;
    startY: number;
    width: number;
    label: string;
    amountMajor: number;
  } | null>(null);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const personRectsRef = useRef<Record<string, Rect>>({});
  const [hoverPersonId, setHoverPersonId] = useState<string | null>(null);

  const resetToInitial = useCallback(() => {
    setLines(initialLines);
  }, [initialLines]);

  const handleClose = useCallback(() => {
    resetToInitial();
    onClose();
  }, [onClose, resetToInitial]);

  const handleDone = useCallback(() => {
    onApply(lines);
    onClose();
  }, [lines, onApply, onClose]);

  const assign = useCallback((lineId: string, memberId: string | null) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, assigneeId: memberId } : l)),
    );
  }, []);

  const unassignedLines = useMemo(
    () => lines.filter((l) => !l.assigneeId),
    [lines],
  );

  const totalsByMember = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of members) out[m.id] = 0;
    for (const l of lines) {
      if (!l.assigneeId) continue;
      const minor = majorFloatToMinor(l.amountMajor, currency);
      out[l.assigneeId] = (out[l.assigneeId] ?? 0) + minor;
    }
    return out;
  }, [lines, members, currency]);

  const linesByMember = useMemo(() => {
    const out: Record<string, AssignableLine[]> = {};
    for (const m of members) out[m.id] = [];
    for (const l of lines) {
      if (!l.assigneeId) continue;
      out[l.assigneeId]?.push(l);
    }
    return out;
  }, [lines, members]);

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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => drag !== null,
        onMoveShouldSetPanResponder: () => drag !== null,
        onPanResponderMove: (e, g) => {
          pan.setValue({ x: g.dx, y: g.dy });
          if (drag) {
            const absX = drag.pageX + g.dx;
            const absY = drag.pageY + g.dy;
            const id = findPersonAtPoint(absX, absY);
            setHoverPersonId((prev) => (prev === id ? prev : id));
          }
        },
        onPanResponderRelease: (e, g) => {
          if (drag) {
            const absX = drag.pageX + g.dx;
            const absY = drag.pageY + g.dy;
            const target = findPersonAtPoint(absX, absY);
            if (target) {
              assign(drag.lineId, target);
            }
          }
          pan.setValue({ x: 0, y: 0 });
          setHoverPersonId(null);
          setDrag(null);
        },
        onPanResponderTerminate: () => {
          pan.setValue({ x: 0, y: 0 });
          setHoverPersonId(null);
          setDrag(null);
        },
      }),
    [assign, drag, findPersonAtPoint, pan],
  );

  const startDrag = useCallback(
    (line: AssignableLine, pageX: number, pageY: number, width: number) => {
      pan.setValue({ x: 0, y: 0 });
      // Re-measure plates right before the user can drop onto them, since
      // any earlier scroll / layout shift can leave cached rects stale.
      for (const memberId of Object.keys(peopleRefs.current)) {
        const node = peopleRefs.current[memberId];
        if (!node) continue;
        node.measureInWindow((x, y, w, h) => {
          personRectsRef.current[memberId] = { x, y, w, h };
        });
      }
      setDrag({
        lineId: line.id,
        pageX,
        pageY,
        startX: pageX,
        startY: pageY,
        width,
        label: line.label,
        amountMajor: line.amountMajor,
      });
    },
    [pan],
  );

  const onPersonLayout = useCallback(
    (memberId: string) => (e: LayoutChangeEvent) => {
      // Use measure later via pageX — react-native's onLayout gives local coords.
      // We need absolute coords, so measureInWindow via ref.
      void memberId;
      void e;
    },
    [],
  );
  void onPersonLayout;

  const peopleRefs = useRef<Record<string, View | null>>({});
  const measurePerson = useCallback((memberId: string) => {
    const node = peopleRefs.current[memberId];
    if (!node) return;
    node.measureInWindow((x, y, w, h) => {
      personRectsRef.current[memberId] = { x, y, w, h };
    });
  }, []);

  /**
   * Re-measure every person card on demand. `onLayout` only fires during
   * initial layout, so subsequent drags would hit stale rects after the
   * sheet scrolls / reopens.
   */
  const measureAllPeople = useCallback(() => {
    for (const memberId of Object.keys(peopleRefs.current)) {
      measurePerson(memberId);
    }
  }, [measurePerson]);

  // Re-measure when the sheet becomes visible, since pageSheet animation may
  // change the final positions relative to the initial onLayout pass.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(measureAllPeople, 120);
    return () => clearTimeout(timer);
  }, [visible, measureAllPeople]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.cancel}>{t("aiReceipt.dndCancel")}</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t("aiReceipt.dndHeader")}</Text>
          </View>
          <Pressable onPress={handleDone} hitSlop={12}>
            <Text style={styles.done}>{t("aiReceipt.dndDone")}</Text>
          </Pressable>
        </View>

        <View style={styles.body} {...panResponder.panHandlers}>
          <ScrollView
            contentContainerStyle={styles.bodyContent}
            scrollEnabled={drag === null}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.bigTitle}>{t("aiReceipt.dndTitle")}</Text>
            <Text style={styles.subTitle}>{t("aiReceipt.dndSubtitle")}</Text>

            <Text style={styles.sectionLabel}>
              {t("aiReceipt.dndUnassignedSection")}
            </Text>
            {unassignedLines.length === 0 ? (
              <Text style={styles.empty}>{t("aiReceipt.dndAllAssigned")}</Text>
            ) : (
              unassignedLines.map((ln) => {
                const hidden = drag?.lineId === ln.id;
                return (
                  <Pressable
                    key={ln.id}
                    style={[styles.itemCard, hidden && styles.dimmed]}
                    onLongPress={(e) => {
                      const nativeEvent = e.nativeEvent;
                      const target = e.currentTarget as unknown as View;
                      target.measureInWindow((x, y, w) => {
                        startDrag(ln, nativeEvent.pageX, nativeEvent.pageY, w);
                        void x;
                        void y;
                      });
                    }}
                    onPressOut={() => {
                      // Safety net: if the user long-presses and then releases
                      // without moving, the PanResponder never takes over, so
                      // its release handler doesn't fire. Clear the drag here
                      // so the item doesn't stay dimmed / the ghost doesn't
                      // stick on screen.
                      if (drag?.lineId === ln.id) {
                        pan.setValue({ x: 0, y: 0 });
                        setHoverPersonId(null);
                        setDrag(null);
                      }
                    }}
                    delayLongPress={180}
                  >
                    <Text style={styles.itemLabel} numberOfLines={2}>
                      {ln.label}
                    </Text>
                    <Text style={styles.itemAmt}>
                      {formatMinor(
                        majorFloatToMinor(ln.amountMajor, currency),
                        currency,
                      )}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View
            style={[
              styles.peopleWrap,
              { paddingBottom: Math.max(12, insets.bottom) },
            ]}
          >
            <Text style={styles.sectionLabel}>
              {t("aiReceipt.dndPeopleSection")}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.peopleRow}
              scrollEnabled={drag === null}
            >
              {members.map((m) => {
                const hovered = hoverPersonId === m.id;
                const total = totalsByMember[m.id] ?? 0;
                return (
                  <View
                    key={m.id}
                    ref={(node) => {
                      peopleRefs.current[m.id] = node;
                    }}
                    onLayout={() => measurePerson(m.id)}
                    style={[styles.personCard, hovered && styles.personCardHover]}
                  >
                    <View style={styles.personHeaderRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarLetter}>
                          {initial(m.name)}
                        </Text>
                      </View>
                      <Text style={styles.personName} numberOfLines={1}>
                        {m.name}
                      </Text>
                    </View>
                    <Text style={styles.personTotal}>
                      {formatMinor(total, currency)}
                    </Text>
                    {(linesByMember[m.id] ?? []).map((ln) => (
                      <Pressable
                        key={ln.id}
                        style={styles.assignedChip}
                        onPress={() => assign(ln.id, null)}
                        accessibilityLabel={t("aiReceipt.dndUnassignA11y", {
                          name: ln.label,
                        })}
                      >
                        <View style={styles.assignedChipRow}>
                          <Text
                            style={styles.assignedChipLabel}
                            numberOfLines={1}
                          >
                            {ln.label}
                          </Text>
                          <Text style={styles.assignedChipAmt}>
                            {formatMinor(
                              majorFloatToMinor(ln.amountMajor, currency),
                              currency,
                            )}
                          </Text>
                          <Ionicons
                            name="close"
                            size={14}
                            color={colors.muted}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
            <AppButton
              variant="primary"
              fullWidth
              label={t("aiReceipt.dndDone")}
              onPress={handleDone}
              style={{ marginTop: 10 }}
            />
          </View>
        </View>

        {drag ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.dragGhost,
              {
                width: drag.width,
                transform: [
                  // Center the ghost horizontally on the finger. The ghost's
                  // left edge sits at (startX - width/2 + dx), which keeps the
                  // ghost's middle under the pointer.
                  {
                    translateX: Animated.add(
                      pan.x,
                      new Animated.Value(drag.startX - drag.width / 2),
                    ),
                  },
                  // Vertically center too: root View is offset by insets.top,
                  // so local y = pageY - insets.top, then - h/2 for center.
                  {
                    translateY: Animated.add(
                      pan.y,
                      new Animated.Value(
                        drag.startY - insets.top - GHOST_HEIGHT / 2,
                      ),
                    ),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.itemLabel} numberOfLines={1}>
              {drag.label}
            </Text>
            <Text style={styles.itemAmt}>
              {formatMinor(
                majorFloatToMinor(drag.amountMajor, currency),
                currency,
              )}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
