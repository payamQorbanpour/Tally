import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
  type SwitchProps,
  type ViewStyle,
} from "react-native";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";

type Props = Omit<SwitchProps, "trackColor" | "thumbColor" | "ios_backgroundColor">;

/** Web track/thumb geometry — iOS-sized so it matches the native switch. */
const TRACK_W = 44;
const TRACK_H = 26;
const PAD = 2;
const THUMB = TRACK_H - PAD * 2;
const TRAVEL = TRACK_W - THUMB - PAD * 2;

export function AppSwitch(props: Props) {
  const { colors, resolvedScheme } = useTheme();
  const on = !!props.value;
  const trackOff = colors.border;
  const trackOn = colors.primary;
  const thumbOn = "#FFFFFF";
  const thumbOff = resolvedScheme === "dark" ? colors.surface : "#f4f3f4";

  if (Platform.OS === "web") {
    return (
      <WebSwitch
        {...props}
        trackOff={trackOff}
        trackOn={trackOn}
        thumbOn={thumbOn}
        thumbOff={thumbOff}
      />
    );
  }

  return (
    <Switch
      {...props}
      trackColor={{ false: trackOff, true: trackOn }}
      thumbColor={on ? thumbOn : thumbOff}
      ios_backgroundColor={trackOff}
    />
  );
}

type WebProps = Props & {
  trackOff: string;
  trackOn: string;
  thumbOn: string;
  thumbOff: string;
};

/**
 * react-native-web's `Switch` is unusable for us on web for two reasons:
 *
 * 1. It ignores `thumbColor` whenever `value` is true and paints the thumb
 *    with `activeThumbColor ?? '#009688'` — Material teal, not our white.
 * 2. It positions the thumb with logical styles (`marginStart`, `start`),
 *    which RNW resolves through its *own* `LocaleProvider` context. We set
 *    RTL by putting `dir="rtl"` on `<html>`/`<body>` (see `LocaleContext`),
 *    which that context never sees, so the DOM lays the thumb out RTL while
 *    the offsets stay LTR — the thumb ends up outside the track.
 *
 * So on web we draw the switch ourselves out of physical `left`/`translateX`
 * only, which no writing direction can flip behind our back.
 */
function WebSwitch({
  value,
  onValueChange,
  disabled,
  style,
  trackOff,
  trackOn,
  thumbOn,
  thumbOff,
  ...rest
}: WebProps) {
  const { isRTL } = useLocale();
  const on = !!value;
  // In RTL the switch mirrors: "on" parks the thumb at the left edge.
  const offset = on === isRTL ? 0 : TRAVEL;
  const anim = useRef(new Animated.Value(offset)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: offset,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [anim, offset]);

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={() => onValueChange?.(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      // RNW maps `accessibilityState.checked` to `aria-checked` for its own
      // Switch only, not for a Pressable — set it directly or screen readers
      // announce a switch with no state.
      aria-checked={on}
      aria-disabled={!!disabled}
      style={[styles.root, disabled && styles.disabled, style]}
    >
      <View
        style={[styles.track, { backgroundColor: on ? trackOn : trackOff }]}
      />
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: on ? thumbOn : thumbOff,
            transform: [{ translateX: anim }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: TRACK_W,
    height: TRACK_H,
    justifyContent: "center",
    // `cursor` is web-only; RN's ViewStyle has no such key.
    cursor: "pointer",
  } as ViewStyle,
  disabled: {
    opacity: 0.5,
    cursor: "default",
  } as unknown as ViewStyle,
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TRACK_H / 2,
  },
  thumb: {
    position: "absolute",
    // Physical `left`/`top`, never `start` — see the WebSwitch comment. The
    // insets are explicit so the thumb never depends on how a browser derives
    // the static position of an absolute child inside a flex container.
    left: PAD,
    top: PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    shadowColor: "rgba(0,0,0,0.5)",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 1.5,
  },
});
