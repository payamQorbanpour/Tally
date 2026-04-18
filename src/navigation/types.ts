import type { NavigatorScreenParams } from "@react-navigation/native";

export type GroupsStackParamList = {
  GroupsList: undefined;
  CreateGroup: undefined;
  GroupDetail: { groupId: string };
  AddExpense: { groupId: string; expenseId?: string };
};

export type MainTabParamList = {
  Groups: NavigatorScreenParams<GroupsStackParamList>;
  Friends: undefined;
  Activity: undefined;
  Account: undefined;
};

/** Single root screen wraps tabbed app (nested navigators live under `Main`). */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
