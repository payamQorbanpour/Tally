import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildInviteUrl } from "../core/inviteEnv";
import {
  getGroup,
  listMembers,
  type GroupRow,
  type MemberRow,
} from "../data/tallyRepo";
import { useDatabase } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";
import { JoinQrCard } from "../ui/JoinQrCard";

type Nav = NativeStackNavigationProp<GroupsStackParamList, "GroupShare">;
type R = RouteProp<GroupsStackParamList, "GroupShare">;

/** Initial letter for the avatar pill. */
function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/** Stable accent color per member id, taken from a small fixed palette. */
function memberAccent(id: string, colors: ThemeColors): string {
  const palette = [
    colors.primary,
    colors.owe,
    colors.owed,
    "#5b8ef2",
    "#d05fe0",
    "#f2a93b",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length] ?? colors.primary;
}

export function GroupShareScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const db = useDatabase();
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { groupId } = route.params;
  const { width } = useWindowDimensions();

  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [copied, setCopied] = useState(false);

  /** The QR / shared link encodes the group ID as the join token. The web
   *  landing page (configured via `EXPO_PUBLIC_INVITE_BASE_URL`) is
   *  responsible for routing the user into the app or the web app. */
  const shareUrl = useMemo(() => buildInviteUrl(groupId), [groupId]);

  // Refresh on every focus — group name or member list may have changed.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [g, ms] = await Promise.all([
          getGroup(db, groupId),
          listMembers(db, groupId),
        ]);
        if (cancelled) return;
        setGroup(g);
        setMembers(ms);
      })();
      return () => {
        cancelled = true;
      };
    }, [db, groupId]),
  );

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [shareUrl]);

  // Keep the QR roughly square and bounded by the card width on small phones.
  const qrSize = Math.min(260, Math.max(180, width - 96));

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t("groupShare.title")}</Text>
        <Text style={styles.subtitle}>{t("groupShare.subtitle")}</Text>

        <JoinQrCard
          url={shareUrl}
          title={t("groupShare.title")}
          subtitle={t("joinQr.groupSubtitle")}
          size={qrSize}
          style={styles.qrFrame}
        />

        <AppButton
          variant="primary"
          fullWidth
          label={
            copied ? t("groupShare.copied") : t("groupShare.copyShareLink")
          }
          left={
            <Ionicons name="share-social-outline" size={18} color="#fff" />
          }
          onPress={() => void onCopy()}
          style={styles.shareBtn}
        />

        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.continueBtn}
          accessibilityRole="button"
        >
          <Text style={styles.continueText}>
            {t("groupShare.continueWithoutSharing")}
          </Text>
        </Pressable>

        <View style={styles.joinedCard}>
          <View style={styles.joinedHeader}>
            <Text style={styles.joinedTitle}>
              {t("groupShare.peopleJoined")}
            </Text>
            <View style={styles.joinedDot} />
          </View>
          {members.length > 0 ? (
            <>
              <View style={styles.joinedAvatars}>
                {members.slice(0, 6).map((m) => (
                  <View
                    key={m.id}
                    style={[
                      styles.joinedAvatar,
                      { backgroundColor: memberAccent(m.id, colors) },
                    ]}
                  >
                    <Text style={styles.joinedAvatarLetter}>
                      {initial(m.name)}
                    </Text>
                  </View>
                ))}
                {members.length > 6 ? (
                  <View
                    style={[
                      styles.joinedAvatar,
                      { backgroundColor: colors.muted },
                    ]}
                  >
                    <Text style={styles.joinedAvatarLetter}>
                      +{members.length - 6}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.joinedCount}>
                {t("groupShare.peopleJoinedCount", {
                  count: String(members.length),
                })}
              </Text>
            </>
          ) : (
            <Text style={styles.joinedEmpty}>
              {t("groupShare.noOneJoinedYet")}
            </Text>
          )}
        </View>

        {group ? (
          <Text style={styles.footerHint}>
            {t("groupShare.footerHint", { name: group.name })}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: 20, paddingBottom: 24 },
    title: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      marginTop: 12,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 18,
      lineHeight: 20,
    },
    qrFrame: { alignSelf: "stretch" },
    shareBtn: { marginTop: 16 },
    continueBtn: {
      marginTop: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
    },
    continueText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.primary,
    },
    joinedCard: {
      marginTop: 20,
      padding: 16,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    joinedHeader: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    joinedTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      ...te,
    },
    joinedDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.owed,
    },
    joinedAvatars: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      marginTop: 12,
    },
    joinedAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.surface,
      marginLeft: isRTL ? 0 : -8,
      marginRight: isRTL ? -8 : 0,
    },
    joinedAvatarLetter: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },
    joinedCount: {
      marginTop: 10,
      fontSize: 13,
      color: colors.muted,
      ...te,
    },
    joinedEmpty: {
      marginTop: 10,
      fontSize: 13,
      color: colors.muted,
      ...te,
    },
    footerHint: {
      marginTop: 12,
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
    },
  });
}
