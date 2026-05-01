import { Switch, type SwitchProps } from "react-native";
import { useTheme } from "../theme/ThemeContext";

type Props = Omit<SwitchProps, "trackColor" | "thumbColor" | "ios_backgroundColor">;

export function AppSwitch(props: Props) {
  const { colors, resolvedScheme } = useTheme();
  const on = !!props.value;
  const trackOff = colors.border;
  const trackOn = colors.primary;
  const thumbOn = "#FFFFFF";
  const thumbOff = resolvedScheme === "dark" ? colors.surface : "#f4f3f4";

  return (
    <Switch
      {...props}
      trackColor={{ false: trackOff, true: trackOn }}
      thumbColor={on ? thumbOn : thumbOff}
      ios_backgroundColor={trackOff}
    />
  );
}

