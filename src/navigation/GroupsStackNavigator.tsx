import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AddExpenseScreen } from "../screens/AddExpenseScreen";
import { CreateGroupScreen } from "../screens/CreateGroupScreen";
import { GroupDetailScreen } from "../screens/GroupDetailScreen";
import { GroupsScreen } from "../screens/GroupsScreen";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { GroupsStackParamList } from "./types";

const Stack = createNativeStackNavigator<GroupsStackParamList>();

export function GroupsStackNavigator() {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  return (
    <Stack.Navigator
      initialRouteName="GroupsList"
      screenOptions={{
        headerTitleAlign: "center",
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: colors.bg,
          flex: 1,
          ...(isRTL && { direction: "rtl" as const }),
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
        options={({ route }) => ({
          title: route.params.expenseId
            ? t("nav.editExpense")
            : t("nav.addExpense"),
        })}
      />
    </Stack.Navigator>
  );
}
