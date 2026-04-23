import { Image, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle, View } from "react-native";
import { Text } from "../ui/AppText";

/**
 * Renders a person's photo (circle) if `avatarUri` is present, otherwise a
 * fallback letter. Caller supplies the outer circle styling via `containerStyle`
 * — we only add `overflow: 'hidden'` so the image is clipped into the circle.
 */
export function PersonAvatar({
  name,
  avatarUri,
  size,
  containerStyle,
  letterStyle,
  letterOverride,
  accessibilityLabel,
}: {
  name: string;
  avatarUri?: string | null;
  size: number;
  containerStyle?: StyleProp<ViewStyle>;
  letterStyle?: StyleProp<TextStyle>;
  letterOverride?: string;
  accessibilityLabel?: string;
}) {
  const letter = letterOverride ?? initialOf(name);
  return (
    <View
      style={[containerStyle, { overflow: "hidden" }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? name}
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={{ width: size, height: size } as ImageStyle}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={letterStyle}>{letter}</Text>
      )}
    </View>
  );
}

function initialOf(name: string): string {
  const s = name.trim();
  return s ? s.slice(0, 1).toUpperCase() : "?";
}
