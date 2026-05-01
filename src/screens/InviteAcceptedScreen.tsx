import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGroup } from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

/**
 * Confirmation screen shown after a deep-linked group invite is accepted.
 * `InviteDeepLinkHandler` navigates here once `acceptGroupInviteWithAuth`
 * succeeds, replacing the previous OS alert. Tapping "View group" replaces
 * this screen with `GroupDetail` so it does not pile up in the back stack.
 */
export function InviteAcceptedScreen() {
  const route = useRoute<RouteProp<GroupsStackParamList, "InviteAccepted">>();
  const navigation = useNavigation<any>();
  const { groupId } = route.params;
  const { colors } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { db } = useTallyData();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const [groupName, setGroupName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getGroup(db, groupId).then((row) => {
      if (!cancelled) setGroupName(row?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [db, groupId]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(24, insets.bottom + 16),
        },
      ]}
    >
      <View style={styles.center}>
        <View style={styles.checkRing}>
          <Ionicons name="checkmark" size={44} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t("inviteAccepted.title")}</Text>
        <Text style={styles.subtitle}>{t("inviteAccepted.youJoined")}</Text>
        <Text style={styles.groupName} numberOfLines={2}>
          {groupName ?? ""}
        </Text>
      </View>

      <AppButton
        variant="primary"
        fullWidth
        label={t("inviteAccepted.viewGroup")}
        onPress={() => navigation.replace("GroupDetail", { groupId })}
        style={styles.cta}
      />
    </View>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 28,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    checkRing: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 3,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      marginBottom: 12,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      marginBottom: 4,
    },
    groupName: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    cta: {
      marginTop: 16,
    },
  });
}
