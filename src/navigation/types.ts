import type { NavigatorScreenParams } from "@react-navigation/native";

export type GroupsStackParamList = {
  GroupsList: undefined;
  /** After creating a friend from Friends tab, add them as a linked member chip. */
  CreateGroup:
    | undefined
    | {
        linkNewFriend?: { id: string; name: string };
      };
  GroupDetail: { groupId: string };
  AddExpense: { groupId: string; expenseId?: string };
};

export type MainTabParamList = {
  Groups: NavigatorScreenParams<GroupsStackParamList>;
  Friends:
    | {
        /** Opens add-friend with this name prefilled (e.g. from Create Group). */
        openAddWithName?: string;
        /** After save or cancel, switch back to the Create Group screen. */
        returnToCreateGroup?: boolean;
      }
    | undefined;
  Activity: undefined;
  Account: undefined;
};

/** Single root screen wraps tabbed app (nested navigators live under `Main`). */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
