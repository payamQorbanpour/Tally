import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { Text } from "./AppText";

/**
 * Reusable share-via-QR card. Used on group share, after-create flows, and
 * on the AddExpense edit screen. Encodes any URL and overlays the Tally
 * favicon in the center so a quick glance identifies it as ours.
 */
export type JoinQrCardProps = {
  /** Final URL to encode. Build with `buildInviteUrl` / `buildExpenseInviteUrl`. */
  url: string;
  /** Section heading; defaults to a generic "Share via QR" string. */
  title?: string;
  /** Sub-line under the heading. */
  subtitle?: string;
  /** QR side length in px. Defaults to 200. */
  size?: number;
  /** Container style override (e.g. margin tweaks per host screen). */
  style?: StyleProp<ViewStyle>;
};

export function JoinQrCard({
  url,
  title,
  subtitle,
  size = 200,
  style,
}: JoinQrCardProps) {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [url]);

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>{title ?? t("joinQr.title")}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.qrFrame}>
        <QRCode
          value={url}
          size={size}
          backgroundColor="#fff"
          color="#000"
          // Embed the favicon in the center. Built-in QR error correction
          // tolerates ~30% obstruction at level "H", which keeps the code
          // scannable even with the logo punched out of the middle.
          logo={require("../../assets/favicon.png")}
          logoSize={Math.round(size * 0.18)}
          logoBackgroundColor="#fff"
          logoMargin={4}
          logoBorderRadius={6}
          ecl="H"
        />
      </View>
      <View style={styles.linkRow}>
        <Text style={styles.linkText} numberOfLines={1}>
          {url}
        </Text>
        <Pressable
          onPress={() => void onCopy()}
          style={styles.copyBtn}
          accessibilityLabel={t("joinQr.copyLink")}
          hitSlop={8}
        >
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={18}
            color="#fff"
          />
        </Pressable>
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    card: {
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
    },
    title: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 4,
      ...te,
      width: "100%",
    },
    subtitle: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 10,
      ...te,
      width: "100%",
    },
    qrFrame: {
      padding: 12,
      borderRadius: 14,
      backgroundColor: "#fff",
      ...{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
      },
    },
    linkRow: {
      marginTop: 12,
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      width: "100%",
    },
    linkText: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      color: colors.text,
      fontVariant: ["tabular-nums"],
      ...te,
    },
    copyBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
