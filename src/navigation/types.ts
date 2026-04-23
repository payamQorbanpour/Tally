import type { NavigatorScreenParams } from "@react-navigation/native";

/** Fills AddExpense once from AI receipt flow; cleared after apply. */
export type ReceiptPrefillV1 = {
  v: 1;
  description: string;
  amountMinor: number;
  payerId: string;
  exactByUserId: Record<string, number>;
  category?: string | null;
};

export type GroupsStackParamList = {
  GroupsList: undefined;
  /** After creating a friend from Friends tab, add them as a linked member chip. */
  CreateGroup:
    | undefined
    | {
        linkNewFriend?: { id: string; name: string };
      };
  GroupDetail: { groupId: string };
  AddExpense: { groupId: string; expenseId?: string; receiptPrefill?: ReceiptPrefillV1 };
  /** Share group via QR / link. Shown after group create or from GroupDetail. */
  GroupShare: { groupId: string };
  /** Full-screen QR scanner that opens an invite URL when a code is detected. */
  QrScan: undefined;
  /** Notification center (sectioned feed derived from local data). */
  Notifications: undefined;
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
  /** Premium: camera receipt OCR → line items; assign splits per person. */
  AiReceipt: { autoRecord?: boolean } | undefined;
  Account: undefined;
};

/** Single root screen wraps tabbed app (nested navigators live under `Main`). */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
