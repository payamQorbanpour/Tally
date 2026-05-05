import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useMemo, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Swipeable, type SwipeableProps } from "react-native-gesture-handler";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

/** Web: square the card edge that meets the delete strip so the two sit flush like one surface. */
export function webMergedDeleteRowContentStyle(
  isRTL: boolean,
  r: number,
): ViewStyle {
  const ra = Math.max(0, r);
  if (isRTL) {
    return {
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderTopRightRadius: ra,
      borderBottomRightRadius: ra,
      borderLeftWidth: 0,
    };
  }
  return {
    borderTopLeftRadius: ra,
    borderBottomLeftRadius: ra,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  };
}

const STRIP_WIDTH = 72;
const WEB_IN_ROW_STRIP = 48;
const ICON_HALO = 36;
/**
 * Negative margin on the swiped front layer to overlap the delete strip. Non-zero values extend the
 * card past the list row bounds and can clip the trailing rounded corners against the screen edge
 * (e.g. Groups list padding). Keep 0 unless a platform needs the tuck.
 */
const CARD_OVERLAP = 0;
/**
 * Horizontal shift of the delete strip under the card (LTR right action: negative = left). Improves the seam without widening the front layer.
 */
const STRIP_TUCK = 8;
/**
 * Insets the trash on the card-adjacent edge of the strip so it centers in the *visible* band; can track overlap without matching it 1:1.
 */
const STRIP_ICON_PAD_FROM_CARD = 14;

type Sensitivity = "default" | "sensitive";

type Props = {
  children: ReactNode;
  onRequestDelete: () => void;
  /** Full phrase for screen readers, e.g. "Delete group". */
  accessibilityLabel: string;
  disabled?: boolean;
  isRTL: boolean;
  /** Match the list card’s corner radius on the delete strip’s outer edge. Default 14. */
  cardEdgeRadius?: number;
  /** Higher offset before the Pan activates (e.g. expense rows with a horizontal sub-scroll). */
  sensitivity?: Sensitivity;
  containerStyle?: ViewStyle;
};

type SwipeableWithClose = { close: () => void };

function makeActionRender(
  onTrailingPress: (s: SwipeableWithClose) => void,
  accessibilityLabel: string,
  colors: ThemeColors,
  r: number,
  /** Horizontal nudge: right strip LTR tucks with negative, left strip uses positive. */
  stripTranslateX: number,
  /**
   * Pads the side of the strip that sits under the card so the icon centers in the *visible* band.
   * LTR right actions: `padStart` = card side. RTL left actions: `padEnd` = card side.
   */
  padFromCard: { start: number; end: number },
  /** Which side of the strip sits under the card — that side gets flat corners. */
  cardSide: "start" | "end",
): SwipeableProps["renderRightActions"] {
  return function renderAction(
    _p: Parameters<NonNullable<SwipeableProps["renderRightActions"]>>[0],
    _d: Parameters<NonNullable<SwipeableProps["renderRightActions"]>>[1],
    swipeable: SwipeableWithClose,
  ) {
    /**
     * Flat on the edge that tucks under the card, rounded only on the outer edge.
     * A flat edge meets the card's rounded corner flush with no visible sliver.
     */
    const tl = cardSide === "start" ? 0 : r;
    const bl = cardSide === "start" ? 0 : r;
    const tr = cardSide === "end" ? 0 : r;
    const br = cardSide === "end" ? 0 : r;

    return (
      <View
        style={[
          styles.stripCol,
          { transform: [{ translateX: stripTranslateX }] },
        ]}
      >
        <Pressable
          onPress={() => onTrailingPress(swipeable)}
          hitSlop={0}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [
            styles.deleteStrip,
            {
              width: STRIP_WIDTH,
              backgroundColor: colors.oweSoft,
              borderTopLeftRadius: tl,
              borderBottomLeftRadius: bl,
              borderTopRightRadius: tr,
              borderBottomRightRadius: br,
              paddingStart: padFromCard.start,
              paddingEnd: padFromCard.end,
            },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View
            style={[
              styles.trashHalo,
              { backgroundColor: colors.surface },
            ]}
            pointerEvents="none"
            accessibilityElementsHidden
          >
            <Ionicons name="trash-outline" size={20} color={colors.owe} />
          </View>
        </Pressable>
      </View>
    );
  };
}

export function SwipeableDeleteRow({
  children,
  onRequestDelete,
  accessibilityLabel,
  disabled = false,
  isRTL,
  cardEdgeRadius: cardEdgeRadiusProp,
  sensitivity = "default",
  containerStyle,
}: Props) {
  const { colors } = useTheme();
  const r = Math.max(0, cardEdgeRadiusProp ?? 14);

  const onTrailingPress = useCallback(
    (s: SwipeableWithClose) => {
      s.close();
      onRequestDelete();
    },
    [onRequestDelete],
  );

  const padLtrRight = useMemo(
    () => ({ start: STRIP_ICON_PAD_FROM_CARD, end: 12 }) as const,
    [],
  );
  const padRtlLeft = useMemo(
    () => ({ start: 12, end: STRIP_ICON_PAD_FROM_CARD }) as const,
    [],
  );

  /** LTR: tucks strip under trailing card edge. RTL left panel: tuck toward the card. */
  const renderRight = useMemo(
    () => makeActionRender(onTrailingPress, accessibilityLabel, colors, r, -STRIP_TUCK, padLtrRight, "start"),
    [onTrailingPress, accessibilityLabel, colors, r, padLtrRight],
  );
  const renderLeft = useMemo(
    () => makeActionRender(onTrailingPress, accessibilityLabel, colors, r, STRIP_TUCK, padRtlLeft, "end"),
    [onTrailingPress, accessibilityLabel, colors, r, padRtlLeft],
  );

  const activeOffsetX: [number, number] = useMemo(
    () => (sensitivity === "sensitive" ? [-32, 32] : [-20, 20]),
    [sensitivity],
  );

  const overhang = isRTL
    ? { marginStart: -CARD_OVERLAP, marginEnd: 0 as const }
    : { marginEnd: -CARD_OVERLAP, marginStart: 0 as const };

  const webInRowStrip = useMemo(() => {
    if (isRTL) {
      return {
        width: WEB_IN_ROW_STRIP,
        minWidth: WEB_IN_ROW_STRIP,
        backgroundColor: colors.oweSoft,
        borderTopLeftRadius: r,
        borderBottomLeftRadius: r,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      } as const;
    }
    return {
      width: WEB_IN_ROW_STRIP,
      minWidth: WEB_IN_ROW_STRIP,
      backgroundColor: colors.oweSoft,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
      borderTopRightRadius: r,
      borderBottomRightRadius: r,
    } as const;
  }, [colors, isRTL, r]);

  /** No swipe on web: in-row delete strip (same “card” surface as the row, not a floating pill in the gutter). */
  if (Platform.OS === "web") {
    if (disabled) {
      return <View style={containerStyle}>{children}</View>;
    }
    return (
      <View
        style={[
          containerStyle,
          styles.webRow,
        ]}
      >
        <View style={styles.webChild}>{children}</View>
        <Pressable
          onPress={onRequestDelete}
          style={({ pressed }) => [
            webInRowStrip,
            styles.webInRowDelete,
            pressed && { opacity: 0.9 },
          ]}
          hitSlop={0}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <Ionicons name="trash-outline" size={20} color={colors.owe} />
        </Pressable>
      </View>
    );
  }

  if (disabled) {
    return <View style={containerStyle}>{children}</View>;
  }

  return (
    <Swipeable
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={isRTL ? renderLeft : undefined}
      renderRightActions={isRTL ? undefined : renderRight}
      childrenContainerStyle={[
        // Transparent (not page-bg). The Swipeable container below paints
        // `oweSoft`; the wrapped card child paints its own surface. Painting
        // the front layer opaque white here leaks a triangular white sliver
        // into the curved gap between the card's rounded trailing corner and
        // the strip's flat leading edge during the swipe.
        { backgroundColor: "transparent" },
        styles.frontOverhang,
        overhang,
      ]}
      containerStyle={[
        {
          borderRadius: r,
          overflow: "hidden",
          // Paint the swipe shell with the strip's background so the curved
          // gap between the card's rounded trailing edge and the strip's flat
          // edge reads as continuous red, not page-bg white.
          backgroundColor: colors.oweSoft,
        },
        containerStyle,
      ]}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      activeOffsetX={activeOffsetX}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  webRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
  },
  webChild: { flex: 1, minWidth: 0 },
  webInRowDelete: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  /**
   * Fixed width; height matches the swipe row (same as the card) so the delete band sits behind the card
   * without extending past it vertically. RNGH right-actions use absoluteFill — alignSelf stretch fills cross-axis.
   */
  stripCol: {
    width: STRIP_WIDTH,
    minWidth: STRIP_WIDTH,
    maxWidth: STRIP_WIDTH,
    alignSelf: "stretch",
    height: "100%",
    zIndex: 0,
    elevation: 0,
    overflow: "hidden",
  },
  frontOverhang: {
    zIndex: 2,
    elevation: 2,
  },
  /**
   * Filled red strip behind the swiped card. We don't draw a border here —
   * the parent Swipeable already clips with `overflow: hidden` + the same
   * `borderRadius`, so a hairline on the strip leaks visible diagonal slivers
   * at the rounded corners (the sharp-edge artefact in the bug report).
   * No shadow either — only the front card layer should cast one.
   */
  deleteStrip: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  trashHalo: {
    width: ICON_HALO,
    height: ICON_HALO,
    borderRadius: ICON_HALO / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
