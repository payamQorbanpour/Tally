import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildInviteUrl } from "../core/inviteEnv";
import { getGroup } from "../data/tallyRepo";
import { useDatabase } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import { Text } from "../ui/AppText";

type Nav = NativeStackNavigationProp<GroupsStackParamList, "GroupShare">;
type R = RouteProp<GroupsStackParamList, "GroupShare">;

/**
 * Group invite QR sheet. Bottom sheet with title + close, the QR card, and
 * four share-action tiles (Copy / Share / WhatsApp / Email). No account
 * required to join — anyone scanning lands directly on the group join URL.
 */
export function GroupShareScreen() {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(
    () => buildStyles(colors, shadows.card),
    [colors, shadows.card],
  );
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const db = useDatabase();
  const { groupId } = route.params;

  const [groupName, setGroupName] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const shareUrl = useMemo(() => buildInviteUrl(groupId), [groupId]);
  const linkChip = useMemo(() => stripScheme(shareUrl), [shareUrl]);

  useEffect(() => {
    void (async () => {
      const g = await getGroup(db, groupId);
      if (g) setGroupName(g.name);
    })();
  }, [db, groupId]);

  const onCopy = async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onShare = async () => {
    if (Platform.OS === "web") {
      const nav = (typeof navigator !== "undefined" ? navigator : null) as
        | (Navigator & { share?: (data: { url?: string }) => Promise<void> })
        | null;
      if (nav?.share) {
        try {
          await nav.share({ url: shareUrl });
        } catch {
          /* user cancelled */
        }
        return;
      }
      void onCopy();
      return;
    }
    try {
      await Share.share({ message: shareUrl, url: shareUrl });
    } catch {
      /* user cancelled */
    }
  };

  const onWhatsapp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(shareUrl)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      /* fall through to share */
    }
    void onShare();
  };

  const onEmail = async () => {
    const subject = groupName
      ? t("joinQr.sheetTitle", { name: groupName })
      : t("joinQr.title");
    const body = shareUrl;
    const url = `mailto:?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      void onShare();
    }
  };

  const tiles = [
    {
      key: "copy",
      icon: copied ? ("checkmark" as const) : ("copy-outline" as const),
      label: t("joinQr.copyLink"),
      onPress: onCopy,
    },
    {
      key: "share",
      icon: "share-outline" as const,
      label: t("joinQr.shareTile"),
      onPress: onShare,
    },
    {
      key: "whatsapp",
      icon: "logo-whatsapp" as const,
      label: t("joinQr.whatsappTile"),
      onPress: onWhatsapp,
    },
    {
      key: "email",
      icon: "mail-outline" as const,
      label: t("joinQr.emailTile"),
      onPress: onEmail,
    },
  ];

  const title = groupName
    ? t("joinQr.sheetTitle", { name: groupName })
    : t("joinQr.title");

  return (
    <View style={styles.backdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => navigation.goBack()}
        accessibilityLabel={t("joinQr.closeButton")}
      />
      <View
        style={[
          styles.sheet,
          {
            paddingTop: 16,
            paddingBottom: Math.max(20, insets.bottom + 8),
          },
        ]}
      >
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle}>
              {t("joinQr.sheetSubtitle")}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("joinQr.closeButton")}
            hitSlop={10}
          >
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.qrCard}>
          <QRCode
            value={shareUrl}
            size={200}
            backgroundColor="#FFFFFF"
            color="#000000"
            logo={require("../../assets/favicon.png")}
            logoSize={36}
            logoBackgroundColor="#FFFFFF"
            logoMargin={4}
            logoBorderRadius={6}
            ecl="H"
          />
          <View style={styles.linkChip}>
            <Ionicons name="link" size={12} color={colors.primary} />
            <Text style={styles.linkChipText} numberOfLines={1}>
              {linkChip}
            </Text>
          </View>
        </View>

        <View style={styles.tilesRow}>
          {tiles.map((tile) => (
            <Pressable
              key={tile.key}
              onPress={() => void tile.onPress()}
              style={({ pressed }) => [
                styles.tile,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={tile.label}
            >
              <View style={styles.tileIconWrap}>
                <Ionicons name={tile.icon} size={20} color={colors.primary} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={1}>
                {tile.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

function buildStyles(colors: ThemeColors, cardShadow: ShadowStyle) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor:
        Platform.OS === "web" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.45)",
      justifyContent: Platform.OS === "web" ? "center" : "flex-end",
      padding: Platform.OS === "web" ? 24 : 0,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      ...Platform.select({
        web: {
          borderRadius: 18,
          maxWidth: 420,
          width: "100%" as const,
          alignSelf: "center",
        },
        default: {},
      }),
    },
    grabber: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 16,
    },
    headerTextCol: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.2,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputSurface,
    },
    qrCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      padding: 18,
      alignItems: "center",
      marginBottom: 14,
      ...cardShadow,
    },
    linkChip: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.owedSoft,
      maxWidth: "100%",
    },
    linkChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.primary,
      flexShrink: 1,
    },
    tilesRow: {
      flexDirection: "row",
      gap: 10,
    },
    tile: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 6,
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tileIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.owedSoft,
    },
    tileLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
    },
  });
}
