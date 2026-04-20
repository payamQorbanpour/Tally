import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AddExpenseScreen } from "../screens/AddExpenseScreen";
import { CreateGroupScreen } from "../screens/CreateGroupScreen";
import { GroupDetailScreen } from "../screens/GroupDetailScreen";
import { GroupsScreen } from "../screens/GroupsScreen";
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
        options={{ title: t("nav.tally") }}
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
    </Stack.Navigator>
  );
}
