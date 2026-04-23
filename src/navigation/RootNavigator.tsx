import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import type { RootStackParamList } from "./types";
import { MainTabs } from "./MainTabs";
import { AuthScreen } from "../screens/AuthScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { useOnboarding } from "../providers/OnboardingContext";
import { useTheme } from "../theme/ThemeContext";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { colors } = useTheme();
  const { onboardingDone } = useOnboarding();

  // While the SQLite flag is still loading, render a plain background so we
  // don't flash either Onboarding or Main before we know which to pick.
  if (onboardingDone === null) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <Stack.Navigator
      initialRouteName={onboardingDone ? "Main" : "Onboarding"}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ animation: "fade", gestureEnabled: false }}
      />
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ animation: "slide_from_bottom", gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
