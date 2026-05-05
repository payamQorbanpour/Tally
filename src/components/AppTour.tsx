import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../i18n/LocaleContext";
import { TOUR_STEPS, useTour, type TourStep } from "../providers/TourContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { Text } from "../ui/AppText";

/**
 * Full-screen tour overlay. Renders nothing while the tour is inactive.
 * For the `intro` step it shows a centered modal card; for anchor steps it
 * dims the screen with a "cutout" around the target rect and floats a
 * tooltip card with Back / Next / Done controls.
 */
export function AppTour() {
  const { step, next, back, skip } = useTour();

  if (step === null) return null;

  return <AnchoredStep step={step} onNext={next} onBack={back} onSkip={skip} />;
}

function AnchoredStep({
  step,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { targets } = useTour();
  const { colors } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const rect = targets[step];

  const idx = TOUR_STEPS.indexOf(step);
  const isFirstAnchor = idx <= 0; // first step has no back affordance
  const isLast = idx === TOUR_STEPS.length - 1;

  // While the target hasn't been measured yet (mid-navigation, or the host
  // screen never registered an anchor — e.g. AddExpense with no groups),
  // fall back to a centered tooltip on a plain dim layer so the user can
  // still read the description and advance.
  if (!rect) {
    return (
      <View style={styles.scrim} pointerEvents="auto">
        <View style={[styles.tooltip, { width: Math.min(320, winW - 32) }]}>
          <Text style={styles.tooltipTitle}>{t(`tour.${step}.title`)}</Text>
          <Text style={styles.tooltipBody}>{t(`tour.${step}.body`)}</Text>
          <View style={styles.tooltipBtnRow}>
            <Pressable
              onPress={onSkip}
              style={({ pressed }) => [
                styles.tooltipSkip,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.tooltipSkipText}>{t("tour.skipBtn")}</Text>
            </Pressable>
            <View style={styles.tooltipBtnSpacer} />
            {!isFirstAnchor ? (
              <Pressable
                onPress={onBack}
                style={({ pressed }) => [
                  styles.tooltipBack,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.tooltipBackText}>{t("tour.backBtn")}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onNext}
              style={({ pressed }) => [
                styles.tooltipNext,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.tooltipNextText}>
                {isLast ? t("tour.doneBtn") : t("tour.nextBtn")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const padding = 8;
  const cutTop = Math.max(0, rect.y - padding);
  const cutLeft = Math.max(0, rect.x - padding);
  const cutWidth = rect.width + padding * 2;
  const cutHeight = rect.height + padding * 2;
  const cutBottom = cutTop + cutHeight;

  // Position the tooltip below the cutout when there's room, otherwise above.
  const tooltipMaxWidth = Math.min(320, winW - 32);
  const spaceBelow = winH - cutBottom - insets.bottom - 24;
  const placeBelow = spaceBelow >= 160;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Four dim rectangles framing the target, leaving a transparent hole. */}
      <View style={[styles.dim, { top: 0, left: 0, right: 0, height: cutTop }]} pointerEvents="auto" />
      <View
        style={[styles.dim, { top: cutBottom, left: 0, right: 0, bottom: 0 }]}
        pointerEvents="auto"
      />
      <View
        style={[
          styles.dim,
          { top: cutTop, height: cutHeight, left: 0, width: cutLeft },
        ]}
        pointerEvents="auto"
      />
      <View
        style={[
          styles.dim,
          {
            top: cutTop,
            height: cutHeight,
            left: cutLeft + cutWidth,
            right: 0,
          },
        ]}
        pointerEvents="auto"
      />

      {/* Outline ring around the spotlit element (purely cosmetic). */}
      <View
        pointerEvents="none"
        style={[
          styles.spotlightRing,
          {
            top: cutTop,
            left: cutLeft,
            width: cutWidth,
            height: cutHeight,
          },
        ]}
      />

      {/* Tooltip card */}
      <View
        pointerEvents="auto"
        style={[
          styles.tooltipWrap,
          placeBelow
            ? { top: cutBottom + 12 }
            : { bottom: winH - cutTop + 12 },
          { width: tooltipMaxWidth, alignSelf: "center" },
        ]}
      >
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{t(`tour.${step}.title`)}</Text>
          <Text style={styles.tooltipBody}>{t(`tour.${step}.body`)}</Text>
          <View style={styles.tooltipBtnRow}>
            <Pressable
              onPress={onSkip}
              style={({ pressed }) => [
                styles.tooltipSkip,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.tooltipSkipText}>
                {t("tour.skipBtn")}
              </Text>
            </Pressable>
            <View style={styles.tooltipBtnSpacer} />
            {!isFirstAnchor ? (
              <Pressable
                onPress={onBack}
                style={({ pressed }) => [
                  styles.tooltipBack,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.tooltipBackText}>
                  {t("tour.backBtn")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onNext}
              style={({ pressed }) => [
                styles.tooltipNext,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.tooltipNextText}>
                {isLast ? t("tour.doneBtn") : t("tour.nextBtn")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      zIndex: 10000,
      elevation: 24,
    },
    dim: {
      position: "absolute",
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    spotlightRing: {
      position: "absolute",
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    tooltipWrap: {
      position: "absolute",
      left: 0,
      right: 0,
    },
    tooltip: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      gap: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    tooltipTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text,
    },
    tooltipBody: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    tooltipBtnRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 10,
      gap: 8,
    },
    tooltipBtnSpacer: { flex: 1 },
    tooltipSkip: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    tooltipSkipText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
    },
    tooltipBack: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.inputSurface,
    },
    tooltipBackText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    tooltipNext: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    tooltipNextText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },
    pressed: { opacity: 0.85 },
  });
}
