import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../ui/AppText";

export type SegmentedOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  activeBg: string;
  inactiveTextColor: string;
  trackBg: string;
  activeTextColor: string;
};

const PAD = 3;

/**
 * Single-track segmented control with a sliding pill behind the active label
 * (Linear / Stripe–style).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeBg,
  inactiveTextColor,
  trackBg,
  activeTextColor,
}: Props<T>) {
  const [containerW, setContainerW] = useState(0);
  const tx = useRef(new Animated.Value(PAD)).current;
  const idx = options.findIndex((o) => o.value === value);
  const safeIdx = idx >= 0 ? idx : 0;

  const segmentW =
    containerW > 0 ? (containerW - PAD * 2) / options.length : 0;

  useEffect(() => {
    if (segmentW <= 0) return;
    Animated.spring(tx, {
      toValue: PAD + safeIdx * segmentW,
      useNativeDriver: true,
      friction: 9,
      tension: 90,
    }).start();
  }, [safeIdx, segmentW, tx]);

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerW(e.nativeEvent.layout.width);
  };

  return (
    <View
      style={[styles.track, { backgroundColor: trackBg }]}
      onLayout={onLayout}
      accessibilityRole="tablist"
    >
      {segmentW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.highlight,
            {
              width: segmentW,
              backgroundColor: activeBg,
              transform: [{ translateX: tx }],
            },
          ]}
        />
      ) : null}
      <View style={styles.row}>
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <Pressable
              key={String(opt.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.segment, pressed && styles.segmentPressed]}
              onPress={() => onChange(opt.value)}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  { color: on ? activeTextColor : inactiveTextColor },
                ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 12,
    padding: PAD,
    position: "relative",
    overflow: "hidden",
  },
  highlight: {
    position: "absolute",
    top: PAD,
    left: 0,
    bottom: PAD,
    borderRadius: 9,
  },
  row: {
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    zIndex: 1,
  },
  segmentPressed: {
    opacity: 0.88,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
