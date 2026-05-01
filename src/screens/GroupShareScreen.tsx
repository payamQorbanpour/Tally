import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildInviteUrl } from "../core/inviteEnv";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { JoinQrCard } from "../ui/JoinQrCard";

type Nav = NativeStackNavigationProp<GroupsStackParamList, "GroupShare">;
type R = RouteProp<GroupsStackParamList, "GroupShare">;

/**
 * Group invite QR sheet. Mirrors the expense-invite QR modal in
 * `AddExpenseScreen` (transparent backdrop + bottom sheet with `JoinQrCard`
 * and a Close button) so both flows look identical.
 */
export function GroupShareScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { groupId } = route.params;

  const shareUrl = useMemo(() => buildInviteUrl(groupId), [groupId]);

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
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: Math.max(16, insets.bottom),
          },
        ]}
      >
        <JoinQrCard
          url={shareUrl}
          subtitle={t("joinQr.groupSubtitle")}
          size={220}
        />
        <AppButton
          variant="secondary"
          fullWidth
          label={t("joinQr.closeButton")}
          onPress={() => navigation.goBack()}
          style={styles.closeBtn}
        />
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors) {
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
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "70%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...Platform.select({
        web: {
          borderRadius: 14,
          maxWidth: 400,
          width: "100%" as const,
          alignSelf: "center",
        },
        default: {},
      }),
    },
    closeBtn: { marginTop: 14 },
  });
}
