import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AddExpenseScreen } from "../screens/AddExpenseScreen";
import { CreateGroupScreen } from "../screens/CreateGroupScreen";
import { GroupDetailScreen } from "../screens/GroupDetailScreen";
import { GroupShareScreen } from "../screens/GroupShareScreen";
import { GroupsScreen } from "../screens/GroupsScreen";
import { InviteAcceptedScreen } from "../screens/InviteAcceptedScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { QrScanScreen } from "../screens/QrScanScreen";
import { useLocale } from "../i18n/LocaleContext";
import { Text } from "../ui/AppText";
import { useTheme } from "../theme/ThemeContext";
import type { GroupsStackParamList } from "./types";

const Stack = createNativeStackNavigator<GroupsStackParamList>();

export function GroupsStackNavigator() {
  const { colors } = useTheme();
  const { t } = useLocale();
  return (
    <Stack.Navigator
      initialRouteName="GroupsList"
      screenOptions={{
        headerTitleAlign: "center",
        headerShadowVisible: false,
        // Show only the chevron — never trail the previous screen's name
        // ("Tally", group name, etc.) next to the back arrow.
        headerBackTitle: "",
        headerBackButtonDisplayMode: "minimal",
        headerTitle: ({ children }) => (
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}
          >
            {children}
          </Text>
        ),
        contentStyle: {
          backgroundColor: colors.bg,
          flex: 1,
        },
      }}
    >
      <Stack.Screen
        name="GroupsList"
        component={GroupsScreen}
        options={{
          title: t("nav.tally"),
          // Header is rendered globally above the Tab.Navigator (MainTabs).
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ title: t("nav.newGroup") }}
      />
      <Stack.Screen
        name="GroupDetail"
        component={GroupDetailScreen}
        options={{ title: t("nav.group") }}
      />
      <Stack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={{
          /** Title set in-screen from group name */
          title: "",
        }}
      />
      <Stack.Screen
        name="GroupShare"
        component={GroupShareScreen}
        options={{
          headerShown: false,
          presentation: "transparentModal",
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen
        name="QrScan"
        component={QrScanScreen}
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="InviteAccepted"
        component={InviteAcceptedScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
