import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGroup,
  listMembers,
  type GroupRow,
  type MemberRow,
} from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { CategoryTile } from "../ui/CategoryTile";
import { Text } from "../ui/AppText";

const CONFETTI_DOTS: { x: string; y: string; size: number; color: string }[] = [
  { x: "12%", y: "10%", size: 8, color: "#10B981" },
  { x: "84%", y: "6%", size: 6, color: "#F59E0B" },
  { x: "70%", y: "20%", size: 10, color: "#5EE6A0" },
  { x: "20%", y: "24%", size: 6, color: "#EF4444" },
  { x: "88%", y: "34%", size: 8, color: "#3B82F6" },
  { x: "8%", y: "38%", size: 7, color: "#A7F3D0" },
];

function iconForGroupType(g: GroupRow | null): keyof typeof import("@expo/vector-icons/Ionicons").Ionicons.glyphMap {
  if (!g) return "people-outline";
  if (g.group_type === "home") return "home-outline";
  if (g.group_type === "trip") return "airplane-outline";
  if (g.group_type === "couple") return "heart-outline";
  return "people-outline";
}

function initial(name: string): string {
  const t = name.trim();
  return t ? t.slice(0, 1).toUpperCase() : "?";
}

/**
 * Confirmation screen shown after a deep-linked group invite is accepted.
 * `InviteDeepLinkHandler` navigates here once `acceptGroupInviteWithAuth`
 * succeeds. Tapping "Open group" replaces this screen with `GroupDetail` so
 * it does not pile up in the back stack; "View all groups" closes back to
 * the Groups list. Closing (✕) does the same as "View all groups".
 */
export function InviteAcceptedScreen() {
  const route = useRoute<RouteProp<GroupsStackParamList, "InviteAccepted">>();
  const navigation = useNavigation<any>();
  const { groupId } = route.params;
  const { colors, shadows } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const { db } = useTallyData();
  const styles = useMemo(
    () => buildStyles(colors, isRTL, shadows.card, shadows.fab),
    [colors, isRTL, shadows.card, shadows.fab],
  );
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [g, m] = await Promise.all([
        getGroup(db, groupId),
        listMembers(db, groupId),
      ]);
      if (!cancelled) {
        setGroup(g);
        setMembers(m);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, groupId]);

  const closeToList = () => {
    navigation.popToTop?.();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {/* Backdrop: huge blurred-feeling group glyph behind everything */}
      <View style={styles.backdrop} pointerEvents="none">
        <Ionicons
          name={iconForGroupType(group)}
          size={300}
          color={colors.primary}
        />
      </View>

      {/* Top-right close ✕ */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={closeToList}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("inviteAccepted.closeA11y")}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={18} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Confetti dots — purely decorative */}
        <View style={styles.confettiLayer} pointerEvents="none">
          {CONFETTI_DOTS.map((d, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: d.x as never,
                top: d.y as never,
                width: d.size,
                height: d.size,
                borderRadius: d.size / 2,
                backgroundColor: d.color,
              }}
            />
          ))}
        </View>

        {/* Sticker — green tile with checkmark, slightly rotated */}
        <View style={styles.stickerWrap}>
          <View style={styles.sticker}>
            <Ionicons name="checkmark" size={50} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>{t("inviteAccepted.title")}</Text>
        <Text style={styles.subtitle}>{t("inviteAccepted.bodyLine")}</Text>

        {/* Group card */}
        <View style={styles.groupCard}>
          <CategoryTile
            icon={iconForGroupType(group)}
            size={56}
            radius={16}
            iconSize={28}
          />
          <View style={styles.groupCardCol}>
            <Text style={styles.groupName} numberOfLines={2}>
              {group?.name ?? ""}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {t("inviteAccepted.memberCount", {
                  count: String(members.length),
                })}
              </Text>
              {group?.currency ? (
                <>
                  <View style={styles.metaDot} />
                  <Text style={styles.metaText}>{group.currency}</Text>
                </>
              ) : null}
            </View>
            {/* Avatar stack — overlapped circles, max 4 + overflow */}
            <View style={styles.avatarStack}>
              {members.slice(0, 4).map((m, i) => (
                <View
                  key={m.id}
                  style={[
                    styles.avatarSm,
                    { marginLeft: i === 0 ? 0 : -8 },
                  ]}
                >
                  <Text style={styles.avatarSmLetter}>{initial(m.name)}</Text>
                </View>
              ))}
              {members.length > 4 ? (
                <View
                  style={[
                    styles.avatarOverflow,
                    { marginLeft: -8 },
                  ]}
                >
                  <Text style={styles.avatarOverflowText}>
                    +{members.length - 4}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        <View
          style={[
            styles.ctaCol,
            { paddingBottom: Math.max(8, insets.bottom + 8) },
          ]}
        >
          <AppButton
            variant="primary"
            fullWidth
            label={t("inviteAccepted.viewGroup")}
            right={<Ionicons name="arrow-forward" size={18} color="#fff" />}
            onPress={() => navigation.replace("GroupDetail", { groupId })}
          />
          <AppButton
            variant="secondary"
            fullWidth
            label={t("inviteAccepted.viewAll")}
            onPress={closeToList}
            style={styles.secondaryCta}
          />
        </View>
      </View>
    </View>
  );
}

function buildStyles(
  colors: ThemeColors,
  isRTL: boolean,
  cardShadow: ShadowStyle,
  fabShadow: ShadowStyle,
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.06,
      alignItems: "center",
      justifyContent: "center",
    },
    topBar: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingBottom: 4,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      alignItems: "center",
      justifyContent: "center",
    },
    body: {
      flex: 1,
      paddingHorizontal: 22,
      position: "relative",
    },
    confettiLayer: {
      position: "absolute",
      top: 8,
      left: 0,
      right: 0,
      height: 200,
    },
    stickerWrap: {
      marginTop: 30,
      alignItems: "center",
    },
    sticker: {
      width: 96,
      height: 96,
      borderRadius: 30,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      transform: [{ rotate: "-6deg" }],
      ...fabShadow,
    },
    title: {
      fontSize: 30,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.5,
      textAlign: "center",
      marginTop: 22,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      marginTop: 8,
      lineHeight: 20,
    },

    /* ── Group card ───────────────────────────────────────────────── */
    groupCard: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      borderRadius: 18,
      padding: 16,
      marginTop: 26,
      ...cardShadow,
    },
    groupCardCol: { flex: 1, minWidth: 0 },
    groupName: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text,
    },
    metaRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    metaText: {
      fontSize: 12,
      color: colors.muted,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.muted,
    },
    avatarStack: {
      flexDirection: "row",
      marginTop: 8,
    },
    avatarSm: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.surface,
    },
    avatarSmLetter: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.primary,
    },
    avatarOverflow: {
      paddingHorizontal: 6,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.inputSurface,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarOverflowText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.muted,
    },

    /* ── CTAs ─────────────────────────────────────────────────────── */
    ctaCol: {
      gap: 10,
      paddingTop: 20,
    },
    secondaryCta: {
      borderColor: colors.cardRim,
    },
    pressed: { opacity: 0.85 },
  });
}
