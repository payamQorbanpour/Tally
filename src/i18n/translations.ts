export type AppLocale = "en" | "fa" | "es";

export type MessageTree = {
  tabs: {
    Groups: { label: string; hint: string };
    Friends: { label: string; hint: string };
    Activity: { label: string; hint: string };
    Account: { label: string; hint: string };
  };
  sidebar: { groupShortcuts: string; profileA11y: string; profileSub: string };
  account: {
    kicker: string;
    title: string;
    displayName: string;
    displayNamePlaceholder: string;
    emailOptional: string;
    emailPlaceholder: string;
    invalidEmailTitle: string;
    invalidEmail: string;
    saving: string;
    saveProfile: string;
    defaultCurrency: string;
    appearance: string;
    appearanceLight: string;
    appearanceDark: string;
    appearanceSystem: string;
    language: string;
    languageEnglish: string;
    languageFarsi: string;
    languageSpanish: string;
    currencyModalTitle: string;
    currencyModalDone: string;
    currencySearchPlaceholder: string;
    currencyEmpty: string;
    cloudSyncRowLabel: string;
    cloudSyncNotConfigured: string;
    cloudSyncBuildDisabled: string;
    cloudSyncEmailRequired: string;
    /** Alert when turning cloud on without a saved/entered email and sync cannot start */
    cloudSyncAlertNoEmailTitle: string;
    cloudSyncAlertNoEmailBody: string;
    exportButton: string;
    exportExporting: string;
    exportFailedTitle: string;
    exportFailedBody: string;
    authTitle: string;
    authEmailLabel: string;
    authPasswordLabel: string;
    /** Shown when email is only in the profile fields above (no duplicate auth email field). */
    authUsesProfileEmailHint: string;
    authSignIn: string;
    authSignUp: string;
    authSignOut: string;
    authBusy: string;
    authSignedInAs: string;
    authCheckEmail: string;
    authAccountConflictTitle: string;
    authAccountConflictBody: string;
    authErrorTitle: string;
    authPasswordTooShort: string;
    showPassword: string;
    hidePassword: string;
    cloudAuthentication: string;
    cloudAuthenticationHint: string;
    /** Card section titles (settings layout) */
    sectionAccountSync: string;
    sectionPreferences: string;
    sectionData: string;
  };
  sync: {
    loading: string;
    localFirst: string;
    upToDate: string;
    lineOnline: string;
    lineOffline: string;
    working: string;
    /** Last cloud operation did not complete; will retry. */
    statusPending: string;
    verbPull: string;
    verbPush: string;
    /** Combined pull+push, shown while Supabase is busy */
    verbSync: string;
  };
  friends: {
    kicker: string;
    title: string;
    sub: string;
    contactsSection: string;
    balancesSection: string;
    contactEmpty: string;
    addFriend: string;
    editFriend: string;
    deleteFriend: string;
    friendModalAddTitle: string;
    friendModalEditTitle: string;
    friendName: string;
    friendNamePlaceholder: string;
    friendEmailOptional: string;
    invalidEmailTitle: string;
    invalidEmail: string;
    saveFriend: string;
    saving: string;
    cancel: string;
    deleteFriendConfirm: string;
    empty: string;
    owesYou: string;
    youOwe: string;
    settled: string;
  };
  activity: {
    kicker: string;
    title: string;
    body: string;
    sectionRecent: string;
    empty: string;
    groupSub: string;
    expenseSub: string;
    settlementSub: string;
  };
  nav: {
    tally: string;
    /** Short label for the stack back control (e.g. iOS back button text). */
    back: string;
    newGroup: string;
    group: string;
    addExpense: string;
    editExpense: string;
  };
  categories: {
    general: string;
    food: string;
    home: string;
    transport: string;
  };
  groupList: {
    totalBalance: string;
    net: string;
    youAreOwed: string;
    youOwe: string;
    empty: string;
    deleteConfirm: string;
    alertDeleteGroup: string;
    delete: string;
    statusSettled: string;
    statusYouAreOwed: string;
    statusYouOwe: string;
    fabQuickAddExpense: string;
    menuDismiss: string;
    menuMoreActions: string;
    menuTitleFallback: string;
    editGroup: string;
    deleteGroup: string;
  };
  createGroup: {
    kicker: string;
    icon: string;
    chooseIconA11y: string;
    removePhoto: string;
    groupName: string;
    placeholderName: string;
    groupType: string;
    typeHome: string;
    typeTrip: string;
    typeCouple: string;
    typeOther: string;
    currency: string;
    choose: string;
    irrHint: string;
    simplifyDebts: string;
    simplifyHint: string;
    /** Diagram label between before/after */
    simplifyDiagramWord: string;
    /** Badge in simplify diagram */
    simplifyOnePayment: string;
    /** Long caption under simplify illustration */
    simplifyIllustrationCaption: string;
    people: string;
    peopleHint: string;
    name: string;
    /** Placeholder for the per-member friend search field */
    searchFriendsPlaceholder: string;
    linkedHint: string;
    searching: string;
    link: string;
    /** Row action when no friend matches — opens add-friend, then returns here */
    addFriendNoMatchCta: string;
    addPerson: string;
    saving: string;
    saveGroup: string;
    modalCurrency: string;
    done: string;
    searchPlaceholder: string;
    emptySearch: string;
    /** Shown if creating the group failed (e.g. database error) */
    errSave: string;
    inviteQueueHint: string;
    addEmailInvite: string;
    inviteDuplicate: string;
  };
  addExpense: {
    cardExpense: string;
    withYouPrefix: string;
    you: string;
    withYouSuffix: string;
    categoryA11y: string;
    whatWasIt: string;
    placeholderDescription: string;
    /** Modal title when picking which group the expense belongs to */
    chooseGroup: string;
    date: string;
    datePlaceholder: string;
    dateInvalid: string;
    category: string;
    paidBy: string;
    splitOptions: string;
    splitEqual: string;
    splitExact: string;
    splitPercent: string;
    splitShares: string;
    splitAdjust: string;
    toolEqual: string;
    toolExact: string;
    toolPercent: string;
    toolShares: string;
    toolAdj: string;
    includeInSplit: string;
    adjustHint: string;
    percentHint: string;
    sharesHint: string;
    whoPaid: string;
    /** Single header when payer choice and per-person split are one control */
    payerAndSplit: string;
    /** Prominent line: “{{name}} paid” */
    whoPaidPaidLine: string;
    /** Short hint under who-paid banner (tap targets) */
    whoPaidCalloutHint: string;
    /** Small label under avatar when this person paid */
    paidBadge: string;
    /** Compact state: participates in split */
    inSplitShort: string;
    /** Compact state: excluded from split */
    outOfSplitShort: string;
    /** Replaces checkbox hint: tap card to toggle */
    participationTapHint: string;
    /** Equal/adjust: line 1 of two-part help (tap photo for payer) */
    splitHelpPayerLine: string;
    /** Equal/adjust: line 2 (tap check row / name for inclusion) */
    splitHelpIncludeLine: string;
    /** Avatar a11y when this person is not the payer yet */
    a11yAvatarTapPayer: string;
    memberFallback: string;
    cancel: string;
    save: string;
    saving: string;
    errSelectSplit: string;
    errExactEach: string;
    errExactSum: string;
    /** Exact split under-total: includes {{amount}} still to assign */
    errExactSumNeedMore: string;
    /** Exact split over-total: includes {{amount}} to remove from the split */
    errExactSumTooMuch: string;
    errPercentRange: string;
    errPercentSum: string;
    errSharesPositive: string;
    errSharesSum: string;
    errAdjEach: string;
    errAdjSum: string;
    perPersonSame: string;
    a11yIncluded: string;
    a11yNotIncluded: string;
    inSplit: string;
    exactRemaining: string;
    exactOver: string;
    exactBalanced: string;
    currencyModalTitle: string;
    currencyModalDone: string;
    currencySearchPlaceholder: string;
    currencyEmpty: string;
  };
  groupDetail: {
    titleFallback: string;
    a11ySettings: string;
    a11yMembers: string;
    tabExpenses: string;
    tabBalances: string;
    tabTotals: string;
    groupTotal: string;
    yourBalance: string;
    /** Summary zone: amount others owe the user in this group */
    summaryTheyOweYou: string;
    /** Summary zone: amount the user owes in this group */
    summaryYouOwe: string;
    balances: string;
    suggestedSettlements: string;
    suggestedSettlementsSub: string;
    transactionsTitle: string;
    transactionsSub: string;
    settlementLine: string;
    remind: string;
    allSettledNoPayments: string;
    everyone: string;
    noPeopleInGroup: string;
    balanceSettled: string;
    balanceGetsBack: string;
    balanceOwes: string;
    totalsPlaceholder: string;
    /** Stacked bar + list: group spend by category */
    totalsByCategory: string;
    /** Column chart: spend per calendar month */
    totalsByMonth: string;
    /** List: each person’s share of expenses (sum of splits) */
    totalsByPerson: string;
    /** No expense rows to aggregate */
    totalsEmpty: string;
    noExpensesYet: string;
    emptyTitle: string;
    emptySubtitle: string;
    emptyCta: string;
    quickEdit: string;
    /** Dismiss the expense action sheet (accessibility) */
    expenseMenuDismiss: string;
    /** When debt simplification reduces the number of transfers */
    simplifyAchievementTitle: string;
    simplifyAchievementBody: string;
    a11ySyncStatus: string;
    a11yExpenseOptions: string;
    paidSuffix: string;
    edit: string;
    delete: string;
    /** Shown on expense row while delete is in flight (e.g. "…") */
    expenseDeleteBusy: string;
    detailMetaLogged: string;
    sectionThisMonth: string;
    noOtherSpendMonth: string;
    sectionNotes: string;
    notePlaceholder: string;
    groupSettings: string;
    done: string;
    /** Numpad accessory: insert “.” when the system decimal pad has no period key */
    decimalSeparator: string;
    changeIconA11y: string;
    icon: string;
    name: string;
    groupNamePlaceholder: string;
    type: string;
    currency: string;
    choose: string;
    simplifyDebts: string;
    simplifyHint: string;
    saveChanges: string;
    saving: string;
    deleteGroup: string;
    /** Shown on delete group button while deleting (e.g. "Deleting…") */
    deletingGroupProgress: string;
    loading: string;
    /** Group settings: row that opens the members modal */
    manageMembers: string;
    members: string;
    noOneYet: string;
    fromOtherGroups: string;
    searchFriendsPlaceholder: string;
    noMatchingFriends: string;
    noPastSplits: string;
    newPerson: string;
    namePlaceholder: string;
    add: string;
    currencyModalTitle: string;
    currencySearchPlaceholder: string;
    currencyEmpty: string;
    a11yAddExpense: string;
    removeFailed: string;
    cannotRemoveTitle: string;
    removeMemberMessage: string;
    /** e.g. "Remove {{name}} from this group" (action, no trailing "?") */
    removeMemberA11y: string;
    removePersonTitle: string;
    remove: string;
    deleteExpenseMessage: string;
    deleteExpenseTitle: string;
    deleteGroupMessage: string;
    youLent: string;
    youPaid: string;
    youOweShare: string;
    /** Shown if saving group settings failed (e.g. database error) */
    errSave: string;
    exportGroup: string;
    exportJson: string;
    exportCsv: string;
    exportPng: string;
    exportPdf: string;
    exportBusy: string;
  };
};

export const en: MessageTree = {
  tabs: {
    Groups: { label: "Home", hint: "Shared groups" },
    Friends: { label: "Friends", hint: "1:1 balances" },
    Activity: { label: "Activity", hint: "History (soon)" },
    Account: { label: "Settings", hint: "Profile and preferences" },
  },
  sidebar: {
    groupShortcuts: "Groups",
    profileA11y: "Account and settings",
    profileSub: "Profile & settings",
  },
  account: {
    kicker: "Settings",
    title: "Settings",
    displayName: "Display name",
    displayNamePlaceholder: "Your name",
    emailOptional: "Email (optional)",
    emailPlaceholder: "you@example.com",
    invalidEmailTitle: "Invalid email",
    invalidEmail: "Please enter a valid email address, or leave this field empty.",
    saving: "Saving…",
    saveProfile: "Save profile",
    defaultCurrency: "Default currency",
    appearance: "Appearance",
    appearanceLight: "Light",
    appearanceDark: "Dark",
    appearanceSystem: "System",
    language: "Language",
    languageEnglish: "English",
    languageFarsi: "Persian (Farsi)",
    languageSpanish: "Spanish",
    currencyModalTitle: "Default currency",
    currencyModalDone: "Done",
    currencySearchPlaceholder: "Search by code or country",
    currencyEmpty: "No matches. Try another search.",
    cloudSyncRowLabel: "Cloud sync",
    cloudSyncNotConfigured:
      "This build has no Supabase URL/key configured, so data stays on this device only. You can still keep this switch on for a later build with cloud variables.",
    cloudSyncBuildDisabled:
      "Sync is turned off in this app build (environment flag).",
    cloudSyncEmailRequired:
      "Enter your email under Profile, tap Save profile, then you can turn on cloud sync.",
    cloudSyncAlertNoEmailTitle: "Add your email first",
    cloudSyncAlertNoEmailBody:
      "Cloud sync needs your email in Profile. Enter it below, tap Save profile, or type it in the field and flip this switch again — the app can save the email for you. Also run the Tally SQL in the Supabase SQL Editor so your project has the correct tables (see the repo `supabase/tally_remote_schema.sql`).",
    exportButton: "Export JSON",
    exportExporting: "Exporting…",
    exportFailedTitle: "Could not export",
    exportFailedBody: "Something went wrong while creating the file. Try again.",
    authTitle: "Supabase account",
    authEmailLabel: "Email",
    authPasswordLabel: "Password",
    authUsesProfileEmailHint: "Sign-in uses the email you entered above.",
    authSignIn: "Sign in",
    authSignUp: "Create account",
    authSignOut: "Sign out",
    authBusy: "Please wait…",
    authSignedInAs: "Signed in as {{email}}",
    authCheckEmail: "If required, confirm your email from the message we sent, then sign in.",
    authAccountConflictTitle: "Different account on this device",
    authAccountConflictBody:
      "This device already has local data for another signed-in profile. Sign out in the app, or use the same account you used before.",
    authErrorTitle: "Could not sign in",
    authPasswordTooShort: "Use at least 6 characters for the password.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    cloudAuthentication: "Cloud authentication",
    cloudAuthenticationHint: "Sign in or create a cloud account to enable sync across devices.",
    sectionAccountSync: "Account & sync",
    sectionPreferences: "Preferences",
    sectionData: "Your data",
  },
  sync: {
    loading: "…",
    localFirst: "Local-first",
    upToDate: "Up to date",
    lineOnline: "Online",
    lineOffline: "Offline (local)",
    working: "{{ops}}…",
    statusPending: "Cloud sync will retry",
    verbPull: "pull",
    verbPush: "push",
    verbSync: "sync",
  },
  friends: {
    kicker: "Across groups",
    title: "Friends",
    sub: "Manage people on this device and see pairwise balances from shared expenses.",
    contactsSection: "People",
    balancesSection: "Balances",
    contactEmpty: "No saved people yet. Add someone to reuse when you split bills in a group.",
    addFriend: "Add person",
    editFriend: "Edit",
    deleteFriend: "Delete",
    friendModalAddTitle: "New person",
    friendModalEditTitle: "Edit person",
    friendName: "Name",
    friendNamePlaceholder: "Name",
    friendEmailOptional: "Email (optional)",
    invalidEmailTitle: "Invalid email",
    invalidEmail: "Please enter a valid email address, or leave this field empty.",
    saveFriend: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    deleteFriendConfirm:
      "Remove {{name}} from this device? This only works if they are not in any group or expense.",
    empty: "No shared expenses yet — add people in a group and split bills.",
    owesYou: "owes you {{amount}}",
    youOwe: "you owe {{amount}}",
    settled: "settled",
  },
  activity: {
    kicker: "Activity",
    title: "Activity",
    body: "A timeline of adds, edits, and settlements on this device will show up here as you use the app.",
    sectionRecent: "Recent",
    empty:
      "No activity yet. Create a group or add an expense to see a timeline on this device.",
    groupSub: "Group created · {{when}}",
    expenseSub: "{{payer}} paid {{amount}} · {{group}} · {{when}}",
    settlementSub: "Settlement · {{amount}} · {{group}} · {{when}}",
  },
  nav: {
    tally: "Tally",
    back: "Back",
    newGroup: "New group",
    group: "Group",
    addExpense: "Add expense",
    editExpense: "Edit expense",
  },
  categories: {
    general: "General",
    food: "Food",
    home: "Home",
    transport: "Transport",
  },
  groupList: {
    totalBalance: "Total balance",
    net: "Net",
    youAreOwed: "You are owed",
    youOwe: "You owe",
    empty: "No groups yet. Create one to start tracking shared expenses.",
    deleteConfirm:
      'Delete "{{name}}" and all its expenses? This cannot be undone.',
    alertDeleteGroup: "Delete group",
    delete: "Delete",
    statusSettled: "You’re settled up in this group",
    statusYouAreOwed: "You are owed {{amount}}",
    statusYouOwe: "You owe {{amount}}",
    fabQuickAddExpense: "Quick add expense",
    menuDismiss: "Dismiss menu",
    menuMoreActions: "More actions for {{name}}",
    menuTitleFallback: "Group",
    editGroup: "Edit group",
    deleteGroup: "Delete group",
  },
  createGroup: {
    kicker: "New group",
    icon: "Icon",
    chooseIconA11y: "Choose group icon",
    removePhoto: "Remove photo",
    groupName: "Group name",
    placeholderName: "Weekend cabin",
    groupType: "Group type",
    typeHome: "Home",
    typeTrip: "Trip",
    typeCouple: "Couple",
    typeOther: "Other",
    currency: "Currency",
    choose: "Choose",
    irrHint:
      "JPY uses whole units in amounts. IRT and IRR support two decimal places (like USD).",
    simplifyDebts: "Simplify debts",
    simplifyHint: "Fewest settlements in balances by default",
    simplifyDiagramWord: "Simplify",
    simplifyOnePayment: "One payment",
    simplifyIllustrationCaption:
      "Balances can chain across people. When this is on, Tally merges IOUs so you settle with fewer transfers.",
    people: "People",
    peopleHint: "Search saved friends by name, or add someone new.",
    name: "Name",
    searchFriendsPlaceholder: "Search friends…",
    linkedHint: "Linked to existing friend",
    searching: "Searching…",
    link: "Link",
    addFriendNoMatchCta: "No match — add new person",
    addPerson: "+ Add a person",
    saving: "Saving…",
    saveGroup: "Save group",
    modalCurrency: "Currency",
    done: "Done",
    searchPlaceholder: "Search by code or country",
    emptySearch: "No matches. Try another search.",
    errSave: "Could not create this group",
    inviteQueueHint:
      "Invites are created when you save the group. Turn on cloud sync in Settings so they reach the other person.",
    addEmailInvite: "Add invite",
    inviteDuplicate: "That email is already on the invite list.",
  },
  addExpense: {
    cardExpense: "Expense",
    withYouPrefix: "With ",
    you: "you",
    withYouSuffix: " and:",
    categoryA11y: "Category",
    whatWasIt: "What was it?",
    placeholderDescription: "Dinner, groceries…",
    chooseGroup: "Choose group",
    date: "Date",
    datePlaceholder: "YYYY-MM-DDTHH:MM (24h)",
    dateInvalid: "Use a valid local date and time (YYYY-MM-DD or YYYY-MM-DDTHH:MM).",
    category: "Category",
    paidBy: "Paid by",
    splitOptions: "Choose split options",
    splitEqual: "Split equally",
    splitExact: "Exact amounts",
    splitPercent: "Percentages",
    splitShares: "Shares",
    splitAdjust: "Equal + adjustment",
    toolEqual: "Equal",
    toolExact: "Exact",
    toolPercent: "%",
    toolShares: "Shares",
    toolAdj: "Adj",
    includeInSplit: "Include in split",
    adjustHint: "Adjustment per person (must sum to zero; − and + OK)",
    percentHint:
      "Whole % per person (must sum to 100). Equal weight ≈ {{pct}}% each.",
    sharesHint: "Parts (defaults to 1 each; share of total updates live).",
    whoPaid: "Who paid?",
    payerAndSplit: "Who paid & split",
    whoPaidPaidLine: "{{name}} paid",
    whoPaidCalloutHint: "Tap a profile picture to choose who paid · Tap name or amount to include or exclude",
    paidBadge: "Paid",
    inSplitShort: "Included",
    outOfSplitShort: "Out",
    participationTapHint: "Tap name or amount below a photo to include or exclude someone.",
    splitHelpPayerLine: "Tap a profile picture to choose who paid.",
    splitHelpIncludeLine:
      "Tap the check row or name below to include or exclude someone from the split.",
    a11yAvatarTapPayer: "Tap to set {{name}} as who paid",
    memberFallback: "Member",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    errSelectSplit: "Select at least one person to split with.",
    errExactEach: "Enter a valid amount for each person.",
    errExactSum: "Assigned total must match the expense.",
    errExactSumNeedMore: "Assign {{amount}} more.",
    errExactSumTooMuch: "Reduce the split by {{amount}}.",
    errPercentRange: "Each percent must be an integer from 0 to 100.",
    errPercentSum: "Percentages must sum to 100%.",
    errSharesPositive: "Each share count must be a positive integer.",
    errSharesSum: "You need at least one share.",
    errAdjEach: "Enter a valid adjustment for each person.",
    errAdjSum: "Adjustments must sum to zero.",
    perPersonSame: "{{amount}} / person",
    a11yIncluded: "included",
    a11yNotIncluded: "not included",
    inSplit: "in split",
    exactRemaining: "Remaining: {{amount}}",
    exactOver: "Over by {{amount}}",
    exactBalanced: "Fully assigned",
    currencyModalTitle: "Currency",
    currencyModalDone: "Done",
    currencySearchPlaceholder: "Search by code or country",
    currencyEmpty: "No matches. Try another search.",
  },
  groupDetail: {
    titleFallback: "Group",
    a11ySettings: "Group settings",
    a11yMembers: "Manage members",
    tabExpenses: "Expenses",
    tabBalances: "Balances",
    tabTotals: "Totals",
    groupTotal: "Group total ",
    yourBalance: "Your Balance: ",
    summaryTheyOweYou: "People owe you",
    summaryYouOwe: "You owe",
    balances: "Balances",
    suggestedSettlements: "Suggested settlements",
    suggestedSettlementsSub: "Fewest payments to settle everyone up.",
    transactionsTitle: "Who pays who",
    transactionsSub: "Everyone pays everyone directly.",
    settlementLine: "{{from}} should pay {{to}} {{amount}}",
    remind: "Remind",
    allSettledNoPayments: "No payments needed — all settled.",
    everyone: "Everyone",
    noPeopleInGroup: "No people in this group.",
    balanceSettled: "settled up",
    balanceGetsBack: "gets back {{amount}}",
    balanceOwes: "owes {{amount}}",
    totalsPlaceholder:
      "Charts and group spending breakdowns can plug in here (categories, monthly totals).",
    totalsByCategory: "By category",
    totalsByMonth: "By month",
    totalsByPerson: "By person",
    totalsEmpty: "Add expenses to see category and monthly breakdowns.",
    noExpensesYet: "No expenses yet.",
    emptyTitle: "Log your first bill",
    emptySubtitle:
      "Add shared charges here — split equally or set exact shares. The group balance updates in real time.",
    emptyCta: "Get started",
    quickEdit: "Edit",
    expenseMenuDismiss: "Close menu",
    simplifyAchievementTitle: "You’re getting fewer payments",
    simplifyAchievementBody:
      "Tally saved you {{count}} transfer(s) by streamlining this group’s balances.",
    a11ySyncStatus: "Cloud sync status",
    a11yExpenseOptions: "Expense options",
    paidSuffix: " paid",
    edit: "Edit",
    delete: "Delete",
    expenseDeleteBusy: "…",
    detailMetaLogged: " · logged ",
    sectionThisMonth: "This month in group",
    noOtherSpendMonth: "No other spend this month.",
    sectionNotes: "Notes",
    notePlaceholder: "Add a note…",
    groupSettings: "Group settings",
    done: "Done",
    decimalSeparator: "Decimal point",
    changeIconA11y: "Change group icon",
    icon: "Icon",
    name: "Name",
    groupNamePlaceholder: "Group name",
    type: "Type",
    currency: "Currency",
    choose: "Choose",
    simplifyDebts: "Simplify debts",
    simplifyHint: "Fewest settlements in balances by default",
    saveChanges: "Save changes",
    saving: "Saving…",
    deleteGroup: "Delete group",
    deletingGroupProgress: "Deleting…",
    loading: "Loading…",
    manageMembers: "Manage members",
    members: "Members",
    noOneYet: "No one in this group yet.",
    fromOtherGroups: "Saved friends",
    searchFriendsPlaceholder: "Search friends…",
    noMatchingFriends: "No matching friends.",
    noPastSplits: "No saved friends to add, or they’re already in this group.",
    newPerson: "New person",
    namePlaceholder: "Name",
    add: "Add",
    currencyModalTitle: "Currency",
    currencySearchPlaceholder: "Search by code or country",
    currencyEmpty: "No matches. Try another search.",
    a11yAddExpense: "Add expense",
    removeFailed: "Could not remove this person.",
    cannotRemoveTitle: "Cannot remove",
    removeMemberMessage: "Remove {{name}} from this group?",
    removeMemberA11y: "Remove {{name}} from this group",
    removePersonTitle: "Remove person",
    remove: "Remove",
    deleteExpenseMessage:
      'Remove "{{description}}" from this group? Balances will update.',
    deleteExpenseTitle: "Delete expense",
    deleteGroupMessage:
      "Delete this group and all its expenses and balances? This cannot be undone.",
    youLent: "You lent {{amount}}",
    youPaid: "You paid",
    youOweShare: "You owe {{amount}}",
    errSave: "Could not save group settings",
    exportGroup: "Export",
    exportJson: "JSON",
    exportCsv: "CSV",
    exportPng: "PNG",
    exportPdf: "PDF",
    exportBusy: "Exporting…",
  },
};

export const fa: MessageTree = {
  tabs: {
    Groups: { label: "خانه", hint: "گروه‌های مشترک" },
    Friends: { label: "دوستان", hint: "مانده یک‌به‌یک" },
    Activity: { label: "فعالیت", hint: "تاریخچه (به‌زودی)" },
    Account: { label: "تنظیمات", hint: "پروفایل و ترجیحات" },
  },
  sidebar: {
    groupShortcuts: "گروه‌ها",
    profileA11y: "حساب و تنظیمات",
    profileSub: "پروفایل و تنظیمات",
  },
  account: {
    kicker: "تنظیمات",
    title: "تنظیمات",
    displayName: "نام نمایشی",
    displayNamePlaceholder: "نام شما",
    emailOptional: "ایمیل (اختیاری)",
    emailPlaceholder: "you@example.com",
    invalidEmailTitle: "ایمیل نامعتبر",
    invalidEmail: "یک آدرس ایمیل معتبر وارد کنید یا فیلد را خالی بگذارید.",
    saving: "در حال ذخیره…",
    saveProfile: "ذخیره پروفایل",
    defaultCurrency: "ارز پیش‌فرض",
    appearance: "ظاهر",
    appearanceLight: "روشن",
    appearanceDark: "تاریک",
    appearanceSystem: "سیستم",
    language: "زبان",
    languageEnglish: "English",
    languageFarsi: "فارسی",
    languageSpanish: "Español",
    currencyModalTitle: "ارز پیش‌فرض",
    currencyModalDone: "تمام",
    currencySearchPlaceholder: "جستجو با کد یا کشور",
    currencyEmpty: "موردی نیست — عبارت دیگری امتحان کنید.",
    cloudSyncRowLabel: "همگام ابر",
    cloudSyncNotConfigured:
      "این بیلد آدرس/کلید Supabase ندارد؛ داده فقط روی این دستگاه می‌ماند. اگر بیلد بعدی متغیر ابر داشته باشد، سوییچ را روشن نگه دارید.",
    cloudSyncBuildDisabled: "در این بیلد همگام با فلگ محیطی غیرفعال است.",
    cloudSyncEmailRequired:
      "ایمیل را در پروفایل بزنید و «ذخیره پروفایل» بزنید، بعد می‌توانید همگام ابر را روشن کنید.",
    cloudSyncAlertNoEmailTitle: "ابتدا ایمیل را اضافه کنید",
    cloudSyncAlertNoEmailBody:
      "همگام ابر به ایمیل در پروفایل نیاز دارد. پایین وارد و ذخیره کنید، یا دوباره سوییچ را بزنید. SQL جدول‌های Tally را در Supabase اجرا کنید (فایل supabase/tally_remote_schema.sql در ریپو).",
    exportButton: "خروجی JSON",
    exportExporting: "در حال خروجی…",
    exportFailedTitle: "خروجی نشد",
    exportFailedBody: "هنگام ساخت فایل خطایی رخ داد. دوباره امتحان کنید.",
    authTitle: "حساب Supabase",
    authEmailLabel: "ایمیل",
    authPasswordLabel: "رمز عبور",
    authUsesProfileEmailHint: "ورود با همان ایمیلی است که بالا وارد کرده‌اید.",
    authSignIn: "ورود",
    authSignUp: "ایجاد حساب",
    authSignOut: "خروج",
    authBusy: "لطفاً صبر کنید…",
    authSignedInAs: "وارد شده: {{email}}",
    authCheckEmail: "در صورت نیاز، ایمیل را از پیام تأیید کنید، سپس وارد شوید.",
    authAccountConflictTitle: "حساب دیگر روی این دستگاه",
    authAccountConflictBody:
      "این دستگاه قبلاً برای پروفایل دیگری داده دارد. از برنامه خارج شوید یا همان حساب قبلی را استفاده کنید.",
    authErrorTitle: "ورود انجام نشد",
    authPasswordTooShort: "رمز حداقل ۶ کاراکتر باشد.",
    showPassword: "نمایش رمز",
    hidePassword: "پنهان کردن رمز",
    cloudAuthentication: "احراز هویت ابر",
    cloudAuthenticationHint: "برای فعال کردن همگام‌سازی، در حساب ابری خود وارد شوید یا حساب جدید ایجاد کنید.",
    sectionAccountSync: "حساب و همگام‌سازی",
    sectionPreferences: "ترجیحات",
    sectionData: "داده‌های شما",
  },
  sync: {
    loading: "…",
    localFirst: "اجرا محلی",
    upToDate: "به‌روز",
    lineOnline: "آنلاین",
    lineOffline: "آفلاین (محلی)",
    working: "{{ops}}…",
    statusPending: "همگام ابر دوباره تلاش می‌کند",
    verbPull: "دریافت",
    verbPush: "ارسال",
    verbSync: "همگام",
  },
  friends: {
    kicker: "در همه گروه‌ها",
    title: "دوستان",
    sub: "افراد را روی این دستگاه مدیریت کنید و مانده‌های زوجی از هزینه‌های مشترک را ببینید.",
    contactsSection: "افراد",
    balancesSection: "مانده‌ها",
    contactEmpty:
      "هنوز کسی ذخیره نشده — برای استفاده در تقسیم هزینه‌ها در گروه، شخص اضافه کنید.",
    addFriend: "افزودن شخص",
    editFriend: "ویرایش",
    deleteFriend: "حذف",
    friendModalAddTitle: "شخص جدید",
    friendModalEditTitle: "ویرایش شخص",
    friendName: "نام",
    friendNamePlaceholder: "نام",
    friendEmailOptional: "ایمیل (اختیاری)",
    invalidEmailTitle: "ایمیل نامعتبر",
    invalidEmail: "یک آدرس ایمیل معتبر وارد کنید یا فیلد را خالی بگذارید.",
    saveFriend: "ذخیره",
    saving: "در حال ذخیره…",
    cancel: "لغو",
    deleteFriendConfirm:
      "«{{name}}» از این دستگاه حذف شود؟ فقط وقتی ممکن است که در هیچ گروه یا هزینه‌ای نباشد.",
    empty: "هنوز هزینه مشترکی نیست — در یک گروه افراد اضافه کنید و تقسیم کنید.",
    owesYou: "{{amount}} به شما بدهکار است",
    youOwe: "شما {{amount}} بدهکارید",
    settled: "تسویه شده",
  },
  activity: {
    kicker: "فعالیت",
    title: "فعالیت",
    body: "با استفاده از برنامه، خط زمانی افزودن، ویرایش و تسویه‌ها روی این دستگاه اینجا نمایش داده می‌شود.",
    sectionRecent: "اخیر",
    empty: "هنوز فعالیتی نیست — گروه بسازید یا هزینه اضافه کنید.",
    groupSub: "گروه ساخته شد · {{when}}",
    expenseSub: "{{payer}} {{amount}} پرداخت · {{group}} · {{when}}",
    settlementSub: "تسویه · {{amount}} · {{group}} · {{when}}",
  },
  nav: {
    tally: "Tally",
    back: "بازگشت",
    newGroup: "گروه جدید",
    group: "گروه",
    addExpense: "افزودن هزینه",
    editExpense: "ویرایش هزینه",
  },
  categories: {
    general: "عمومی",
    food: "غذا",
    home: "خانه",
    transport: "حمل‌ونقل",
  },
  groupList: {
    totalBalance: "مانده کل",
    net: "خالص",
    youAreOwed: "به شما بدهکارند",
    youOwe: "شما بدهکارید",
    empty: "هنوز گروهی نیست — برای پیگیری هزینه‌های مشترک یک گروه بسازید.",
    deleteConfirm:
      "«{{name}}» و همه هزینه‌هایش حذف شود؟ این کار برگشت‌ناپذیر است.",
    alertDeleteGroup: "حذف گروه",
    delete: "حذف",
    statusSettled: "در این گروه تسویه‌اید",
    statusYouAreOwed: "{{amount}} به شما بدهکارند",
    statusYouOwe: "شما {{amount}} بدهکارید",
    fabQuickAddExpense: "افزودن سریع هزینه",
    menuDismiss: "بستن منو",
    menuMoreActions: "اقدام‌های بیشتر برای {{name}}",
    menuTitleFallback: "گروه",
    editGroup: "ویرایش گروه",
    deleteGroup: "حذف گروه",
  },
  createGroup: {
    kicker: "گروه جدید",
    icon: "آیکن",
    chooseIconA11y: "انتخاب آیکن گروه",
    removePhoto: "حذف عکس",
    groupName: "نام گروه",
    placeholderName: "کلبه آخر هفته",
    groupType: "نوع گروه",
    typeHome: "خانه",
    typeTrip: "سفر",
    typeCouple: "زوج",
    typeOther: "سایر",
    currency: "ارز",
    choose: "انتخاب",
    irrHint:
      "JPY در مبالغ بدون اعشار است. IRT و IRR مثل USD تا دو رقم اعشار پشتیبانی می‌شوند.",
    simplifyDebts: "ساده‌سازی بدهی‌ها",
    simplifyHint: "کمترین تسویه در مانده‌ها به‌صورت پیش‌فرض",
    simplifyDiagramWord: "ساده‌سازی",
    simplifyOnePayment: "یک پرداخت",
    simplifyIllustrationCaption:
      "مانده‌ها می‌توانند زنجیره شوند. با روشن بودن این گزینه، Tally بدهی‌ها را طوری ادغام می‌کند که با جابه‌جایی کمتر تسویه کنید.",
    people: "افراد",
    peopleHint: "دوستان ذخیره‌شده را جستجو کنید یا شخص جدید اضافه کنید.",
    name: "نام",
    searchFriendsPlaceholder: "جستجوی دوستان…",
    linkedHint: "به دوست موجود پیوند خورده",
    searching: "در حال جستجو…",
    link: "پیوند",
    addFriendNoMatchCta: "بدون تطابق — افزودن شخص جدید",
    addPerson: "+ افزودن شخص",
    saving: "در حال ذخیره…",
    saveGroup: "ذخیره گروه",
    modalCurrency: "ارز",
    done: "تمام",
    searchPlaceholder: "جستجو با کد یا کشور",
    emptySearch: "موردی نیست — عبارت دیگری امتحان کنید.",
    errSave: "گروه ساخته نشد",
    inviteQueueHint:
      "با ذخیره گروه، دعوت‌ها ساخته می‌شوند. برای رسیدن به طرف مقابل، همگام ابر را در تنظیمات روشن کنید.",
    addEmailInvite: "افزودن دعوت",
    inviteDuplicate: "این ایمیل قبلاً در فهرست دعوت‌هاست.",
  },
  addExpense: {
    cardExpense: "هزینه",
    withYouPrefix: "با ",
    you: "شما",
    withYouSuffix: " و:",
    categoryA11y: "دسته",
    whatWasIt: "چه بود؟",
    placeholderDescription: "شام، خرید…",
    chooseGroup: "انتخاب گروه",
    date: "تاریخ",
    datePlaceholder: "YYYY-MM-DDTHH:MM (24 ساعته)",
    dateInvalid: "تاریخ و زمان معتبر وارد کنید (YYYY-MM-DD یا YYYY-MM-DDTHH:MM).",
    category: "دسته",
    paidBy: "پرداخت‌کننده",
    splitOptions: "نحوه تقسیم",
    splitEqual: "مساوی",
    splitExact: "مبلغ دقیق",
    splitPercent: "درصد",
    splitShares: "سهم",
    splitAdjust: "مساوی + تعدیل",
    toolEqual: "مساوی",
    toolExact: "دقیق",
    toolPercent: "%",
    toolShares: "سهم",
    toolAdj: "تعدیل",
    includeInSplit: "در تقسیم",
    adjustHint: "تعدیل هر نفر (جمع باید صفر باشد؛ − و + مجاز)",
    percentHint:
      "درصد صحیح برای هر نفر (جمع ۱۰۰). وزن مساوی ≈ {{pct}}٪ برای هر نفر.",
    sharesHint: "بخش‌ها (پیش‌فرض ۱؛ سهم از کل زنده به‌روز می‌شود).",
    whoPaid: "چه کسی پرداخت کرد؟",
    payerAndSplit: "پرداخت‌کننده و تقسیم",
    whoPaidPaidLine: "{{name}} پرداخت کرد",
    whoPaidCalloutHint:
      "برای انتخاب پرداخت‌کننده روی عکس بزنید · برای شمول/حذف از تقسیم روی نام یا مبلغ بزنید",
    paidBadge: "پرداخت",
    inSplitShort: "در تقسیم",
    outOfSplitShort: "خارج",
    participationTapHint:
      "برای شمول یا حذف از تقسیم، زیر عکس روی نام یا مبلغ بزنید.",
    splitHelpPayerLine: "برای انتخاب پرداخت‌کننده روی عکس پروفایل بزنید.",
    splitHelpIncludeLine:
      "برای شمول یا حذف از تقسیم، ردیف تیک یا نام زیر عکس را بزنید.",
    a11yAvatarTapPayer: "برای انتخاب {{name}} به‌عنوان پرداخت‌کننده بزنید",
    memberFallback: "عضو",
    cancel: "لغو",
    save: "ذخیره",
    saving: "در حال ذخیره…",
    errSelectSplit: "حداقل یک نفر را برای تقسیم انتخاب کنید.",
    errExactEach: "برای هر نفر مبلغ معتبر وارد کنید.",
    errExactSum: "جمع اختصاص‌یافته باید با مبلغ هزینه یکی باشد.",
    errExactSumNeedMore: "{{amount}} دیگر اختصاص دهید.",
    errExactSumTooMuch: "{{amount}} از تقسیم کم کنید.",
    errPercentRange: "هر درصد باید عدد صحیح بین ۰ تا ۱۰۰ باشد.",
    errPercentSum: "جمع درصدها باید ۱۰۰٪ باشد.",
    errSharesPositive: "تعداد هر سهم باید عدد صحیح مثبت باشد.",
    errSharesSum: "حداقل یک سهم لازم است.",
    errAdjEach: "برای هر نفر تعدیل معتبر وارد کنید.",
    errAdjSum: "جمع تعدیل‌ها باید صفر باشد.",
    perPersonSame: "{{amount}} / نفر",
    a11yIncluded: "شامل",
    a11yNotIncluded: "شامل نه",
    inSplit: "در تقسیم",
    exactRemaining: "باقی‌مانده: {{amount}}",
    exactOver: "بیش از مبلغ: {{amount}}",
    exactBalanced: "مبلغ کامل تقسیم شد",
    currencyModalTitle: "ارز",
    currencyModalDone: "تمام",
    currencySearchPlaceholder: "جستجو با کد یا کشور",
    currencyEmpty: "نتیجه‌ای نیست. عبارت دیگری امتحان کنید.",
  },
  groupDetail: {
    titleFallback: "گروه",
    a11ySettings: "تنظیمات گروه",
    a11yMembers: "مدیریت اعضا",
    tabExpenses: "هزینه‌ها",
    tabBalances: "مانده‌ها",
    tabTotals: "جمع‌ها",
    groupTotal: "جمع گروه: ",
    yourBalance: "مانده شما: ",
    summaryTheyOweYou: "بقیه به شما بدهکارند",
    summaryYouOwe: "شما بدهکارید",
    balances: "مانده‌ها",
    suggestedSettlements: "تسویه‌های پیشنهادی",
    suggestedSettlementsSub: "کمترین پرداخت برای تسویه همه.",
    transactionsTitle: "چه کسی به کی پول می‌دهد",
    transactionsSub: "همه مستقیما به یکدیگر پرداخت می‌کنند.",
    settlementLine: "{{from}} باید به {{to}} {{amount}} بپردازد",
    remind: "یادآوری",
    allSettledNoPayments: "پرداختی لازم نیست — همه تسویه‌اند.",
    everyone: "همه",
    noPeopleInGroup: "کسی در این گروه نیست.",
    balanceSettled: "تسویه شده",
    balanceGetsBack: "{{amount}} پس می‌گیرد",
    balanceOwes: "{{amount}} بدهکار است",
    totalsPlaceholder:
      "نمودار و تفکیک هزینه گروه اینجا قرار می‌گیرد (دسته‌ها، ماهانه).",
    totalsByCategory: "بر اساس دسته",
    totalsByMonth: "ماه به ماه",
    totalsByPerson: "به‌ازای هر نفر",
    totalsEmpty: "برای دیدن تفکیک دسته و ماه، هزینه اضافه کنید.",
    noExpensesYet: "هنوز هزینه‌ای نیست.",
    emptyTitle: "اولین هزینه را ثبت کنید",
    emptySubtitle:
      "هزینه‌های مشترک را اینجا اضافه کنید — مساوی یا مبلغ دقیق. مانده گروه در لحظه به‌روز می‌شود.",
    emptyCta: "شروع",
    quickEdit: "ویرایش",
    expenseMenuDismiss: "بستن منو",
    simplifyAchievementTitle: "تعداد پرداخت کمتری دارید",
    simplifyAchievementBody:
      "Tally با ساده‌سازی مانده گروه، {{count}} جابه‌جایی را کمتر کرده است.",
    a11ySyncStatus: "وضعیت همگام‌سازی ابری",
    a11yExpenseOptions: "گزینه‌های هزینه",
    paidSuffix: " پرداخت کرد",
    edit: "ویرایش",
    delete: "حذف",
    expenseDeleteBusy: "…",
    detailMetaLogged: " · ثبت ",
    sectionThisMonth: "این ماه در گروه",
    noOtherSpendMonth: "هزینه دیگری این ماه نیست.",
    sectionNotes: "یادداشت",
    notePlaceholder: "یادداشت…",
    groupSettings: "تنظیمات گروه",
    done: "تمام",
    decimalSeparator: "اعشار",
    changeIconA11y: "تغییر آیکن گروه",
    icon: "آیکن",
    name: "نام",
    groupNamePlaceholder: "نام گروه",
    type: "نوع",
    currency: "ارز",
    choose: "انتخاب",
    simplifyDebts: "ساده‌سازی بدهی‌ها",
    simplifyHint: "کمترین تسویه در مانده‌ها به‌صورت پیش‌فرض",
    saveChanges: "ذخیره تغییرات",
    saving: "در حال ذخیره…",
    deleteGroup: "حذف گروه",
    deletingGroupProgress: "در حال حذف…",
    loading: "در حال بارگذاری…",
    manageMembers: "مدیریت اعضا",
    members: "اعضا",
    noOneYet: "هنوز کسی در این گروه نیست.",
    fromOtherGroups: "دوستان ذخیره‌شده",
    searchFriendsPlaceholder: "جستجوی دوستان…",
    noMatchingFriends: "دوست مطابقی نیست.",
    noPastSplits: "دوست ذخیره‌شده‌ای برای افزودن نیست، یا همین‌جا هستند.",
    newPerson: "شخص جدید",
    namePlaceholder: "نام",
    add: "افزودن",
    currencyModalTitle: "ارز",
    currencySearchPlaceholder: "جستجو با کد یا کشور",
    currencyEmpty: "موردی نیست — عبارت دیگری امتحان کنید.",
    a11yAddExpense: "افزودن هزینه",
    removeFailed: "حذف این شخص ممکن نشد.",
    cannotRemoveTitle: "حذف ممکن نیست",
    removeMemberMessage: "{{name}} از این گروه حذف شود؟",
    removeMemberA11y: "حذف {{name}} از این گروه",
    removePersonTitle: "حذف شخص",
    remove: "حذف",
    deleteExpenseMessage:
      "«{{description}}» از این گروه حذف شود؟ مانده‌ها به‌روز می‌شوند.",
    deleteExpenseTitle: "حذف هزینه",
    deleteGroupMessage:
      "این گروه و همه هزینه‌ها و مانده‌ها حذف شود؟ این کار برگشت‌ناپذیر است.",
    youLent: "شما {{amount}} قرض دادید",
    youPaid: "شما پرداخت کردید",
    youOweShare: "شما {{amount}} بدهکارید",
    errSave: "تنظیمات گروه ذخیره نشد",
    exportGroup: "خروجی",
    exportJson: "JSON",
    exportCsv: "CSV",
    exportPng: "PNG",
    exportPdf: "PDF",
    exportBusy: "در حال خروجی…",
  },
};

export const es: MessageTree = {
  tabs: {
    Groups: { label: "Inicio", hint: "Grupos compartidos" },
    Friends: { label: "Amigos", hint: "Saldos 1:1" },
    Activity: { label: "Actividad", hint: "Historial (pronto)" },
    Account: { label: "Ajustes", hint: "Perfil y preferencias" },
  },
  sidebar: {
    groupShortcuts: "Grupos",
    profileA11y: "Cuenta y ajustes",
    profileSub: "Perfil y ajustes",
  },
  account: {
    kicker: "Ajustes",
    title: "Ajustes",
    displayName: "Nombre visible",
    displayNamePlaceholder: "Tu nombre",
    emailOptional: "Correo (opcional)",
    emailPlaceholder: "tu@ejemplo.com",
    invalidEmailTitle: "Correo no válido",
    invalidEmail: "Introduce un correo válido o deja el campo vacío.",
    saving: "Guardando…",
    saveProfile: "Guardar perfil",
    defaultCurrency: "Moneda predeterminada",
    appearance: "Apariencia",
    appearanceLight: "Claro",
    appearanceDark: "Oscuro",
    appearanceSystem: "Sistema",
    language: "Idioma",
    languageEnglish: "English",
    languageFarsi: "فارسی",
    languageSpanish: "Español",
    currencyModalTitle: "Moneda predeterminada",
    currencyModalDone: "Listo",
    currencySearchPlaceholder: "Buscar por código o país",
    currencyEmpty: "Sin resultados. Prueba otra búsqueda.",
    cloudSyncRowLabel: "Sync en la nube",
    cloudSyncNotConfigured:
      "Esta versión no tiene URL/clave de Supabase: los datos quedan en el dispositivo. Puedes dejar el interruptor activado para un build con esas variables.",
    cloudSyncBuildDisabled:
      "La sincronización está desactivada en esta compilación (variable de entorno).",
    cloudSyncEmailRequired:
      "Añade el correo en Perfil, pulsa Guardar perfil y luego activa el sync en la nube.",
    cloudSyncAlertNoEmailTitle: "Añade tu correo primero",
    cloudSyncAlertNoEmailBody:
      "La sincronización en la nube requiere tu correo en Perfil. Escribe el email abajo, pulsa Guardar o vuelve a activar el interruptor (el guardado se puede hacer automáticamente). Crea las tablas en Supabase: ejecuta el SQL del repositorio en el editor SQL (archivo supabase/tally_remote_schema.sql).",
    exportButton: "Exportar JSON",
    exportExporting: "Exportando…",
    exportFailedTitle: "No se pudo exportar",
    exportFailedBody: "Algo salió mal al crear el archivo. Inténtalo de nuevo.",
    authTitle: "Cuenta Supabase",
    authEmailLabel: "Correo",
    authPasswordLabel: "Contraseña",
    authUsesProfileEmailHint: "El inicio de sesión usa el correo que escribiste arriba.",
    authSignIn: "Entrar",
    authSignUp: "Crear cuenta",
    authSignOut: "Cerrar sesión",
    authBusy: "Espera…",
    authSignedInAs: "Sesión: {{email}}",
    authCheckEmail: "Si hace falta, confirma el correo del mensaje y luego entra.",
    authAccountConflictTitle: "Otra cuenta en este dispositivo",
    authAccountConflictBody:
      "Este dispositivo ya tiene datos locales de otro perfil. Cierra sesión en la app o usa la misma cuenta de antes.",
    authErrorTitle: "No se pudo iniciar sesión",
    authPasswordTooShort: "Usa al menos 6 caracteres en la contraseña.",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
    cloudAuthentication: "Autenticación en la nube",
    cloudAuthenticationHint: "Inicia sesión o crea una cuenta en la nube para habilitar la sincronización.",
    sectionAccountSync: "Cuenta y sincronización",
    sectionPreferences: "Preferencias",
    sectionData: "Tus datos",
  },
  sync: {
    loading: "…",
    localFirst: "En local",
    upToDate: "Al día",
    lineOnline: "En línea",
    lineOffline: "Fuera de línea (local)",
    working: "{{ops}}…",
    statusPending: "Se volverá a intentar el sync con la nube",
    verbPull: "descarga",
    verbPush: "subida",
    verbSync: "sincronización",
  },
  friends: {
    kicker: "Entre grupos",
    title: "Amigos",
    sub: "Gestiona personas en este dispositivo y ve saldos de gastos compartidos.",
    contactsSection: "Personas",
    balancesSection: "Saldos",
    contactEmpty:
      "Aún no hay personas guardadas. Añade alguien para reutilizarlo al dividir gastos.",
    addFriend: "Añadir persona",
    editFriend: "Editar",
    deleteFriend: "Eliminar",
    friendModalAddTitle: "Nueva persona",
    friendModalEditTitle: "Editar persona",
    friendName: "Nombre",
    friendNamePlaceholder: "Nombre",
    friendEmailOptional: "Correo (opcional)",
    invalidEmailTitle: "Correo no válido",
    invalidEmail: "Introduce un correo válido o deja el campo vacío.",
    saveFriend: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    deleteFriendConfirm:
      "¿Quitar a {{name}} de este dispositivo? Solo es posible si no está en ningún grupo ni gasto.",
    empty: "Aún no hay gastos compartidos — añade personas en un grupo y divide.",
    owesYou: "te debe {{amount}}",
    youOwe: "debes {{amount}}",
    settled: "saldo cero",
  },
  activity: {
    kicker: "Actividad",
    title: "Actividad",
    body: "A medida que uses la app, aquí verás una línea de tiempo de cambios y pagos en este dispositivo.",
    sectionRecent: "Reciente",
    empty:
      "Aún no hay actividad. Crea un grupo o añade un gasto para ver la línea de tiempo.",
    groupSub: "Grupo creado · {{when}}",
    expenseSub: "{{payer}} pagó {{amount}} · {{group}} · {{when}}",
    settlementSub: "Pago · {{amount}} · {{group}} · {{when}}",
  },
  nav: {
    tally: "Tally",
    back: "Atrás",
    newGroup: "Nuevo grupo",
    group: "Grupo",
    addExpense: "Añadir gasto",
    editExpense: "Editar gasto",
  },
  categories: {
    general: "General",
    food: "Comida",
    home: "Hogar",
    transport: "Transporte",
  },
  groupList: {
    totalBalance: "Saldo total",
    net: "Neto",
    youAreOwed: "Te deben",
    youOwe: "Debes",
    empty: "Aún no hay grupos. Crea uno para llevar gastos compartidos.",
    deleteConfirm:
      '¿Eliminar «{{name}}» y todos sus gastos? No se puede deshacer.',
    alertDeleteGroup: "Eliminar grupo",
    delete: "Eliminar",
    statusSettled: "Estás al día en este grupo",
    statusYouAreOwed: "Te deben {{amount}}",
    statusYouOwe: "Debes {{amount}}",
    fabQuickAddExpense: "Añadir gasto rápido",
    menuDismiss: "Cerrar menú",
    menuMoreActions: "Más acciones para {{name}}",
    menuTitleFallback: "Grupo",
    editGroup: "Editar grupo",
    deleteGroup: "Eliminar grupo",
  },
  createGroup: {
    kicker: "Nuevo grupo",
    icon: "Icono",
    chooseIconA11y: "Elegir icono del grupo",
    removePhoto: "Quitar foto",
    groupName: "Nombre del grupo",
    placeholderName: "Cabaña de fin de semana",
    groupType: "Tipo de grupo",
    typeHome: "Hogar",
    typeTrip: "Viaje",
    typeCouple: "Pareja",
    typeOther: "Otro",
    currency: "Moneda",
    choose: "Elegir",
    irrHint:
      "JPY usa unidades enteras. IRT e IRR admiten dos decimales (como USD).",
    simplifyDebts: "Simplificar deudas",
    simplifyHint: "Menos pagos en saldos por defecto",
    simplifyDiagramWord: "Simplificar",
    simplifyOnePayment: "Un pago",
    simplifyIllustrationCaption:
      "Los saldos pueden encadenarse entre personas. Si está activo, Tally fusiona deudas para que saldes con menos transferencias.",
    people: "Personas",
    peopleHint: "Busca entre amigos guardados o añade a alguien nuevo.",
    name: "Nombre",
    searchFriendsPlaceholder: "Buscar amigos…",
    linkedHint: "Enlazado a un amigo existente",
    searching: "Buscando…",
    link: "Enlazar",
    addFriendNoMatchCta: "Sin coincidencia — añadir persona",
    addPerson: "+ Añadir persona",
    saving: "Guardando…",
    saveGroup: "Guardar grupo",
    modalCurrency: "Moneda",
    done: "Listo",
    searchPlaceholder: "Buscar por código o país",
    emptySearch: "Sin resultados. Prueba otra búsqueda.",
    errSave: "No se pudo crear el grupo",
    inviteQueueHint:
      "Las invitaciones se crean al guardar el grupo. Activa la sincronización en Ajustes para que lleguen a la otra persona.",
    addEmailInvite: "Añadir invitación",
    inviteDuplicate: "Ese correo ya está en la lista de invitaciones.",
  },
  addExpense: {
    cardExpense: "Gasto",
    withYouPrefix: "Con ",
    you: "tú",
    withYouSuffix: " y:",
    categoryA11y: "Categoría",
    whatWasIt: "¿En qué fue?",
    placeholderDescription: "Cena, compras…",
    chooseGroup: "Elegir grupo",
    date: "Fecha",
    datePlaceholder: "AAAA-MM-DDTHH:MM (24h)",
    dateInvalid: "Usa una fecha y hora local válida (AAAA-MM-DD o AAAA-MM-DDTHH:MM).",
    category: "Categoría",
    paidBy: "Pagado por",
    splitOptions: "Opciones de reparto",
    splitEqual: "Partir por igual",
    splitExact: "Importes exactos",
    splitPercent: "Porcentajes",
    splitShares: "Partes",
    splitAdjust: "Igual + ajuste",
    toolEqual: "Igual",
    toolExact: "Exacto",
    toolPercent: "%",
    toolShares: "Partes",
    toolAdj: "Ajuste",
    includeInSplit: "Incluir en el reparto",
    adjustHint: "Ajuste por persona (debe sumar cero; − y + OK)",
    percentHint:
      "% enteros por persona (deben sumar 100). Peso igual ≈ {{pct}}% cada uno.",
    sharesHint: "Partes (por defecto 1; la parte del total se actualiza al vuelo).",
    whoPaid: "¿Quién pagó?",
    payerAndSplit: "Quién pagó y reparto",
    whoPaidPaidLine: "Pagó {{name}}",
    whoPaidCalloutHint:
      "Toca la foto para elegir quién pagó · Toca el nombre o el importe para incluir o excluir",
    paidBadge: "Pagó",
    inSplitShort: "Incluido",
    outOfSplitShort: "Fuera",
    participationTapHint:
      "Toca el nombre o el importe debajo de una foto para incluir o excluir a alguien.",
    splitHelpPayerLine: "Toca una foto de perfil para elegir quién pagó.",
    splitHelpIncludeLine:
      "Toca la fila del check o el nombre de abajo para incluir o excluir a alguien del reparto.",
    a11yAvatarTapPayer: "Toca para poner a {{name}} como quien pagó",
    memberFallback: "Miembro",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "Guardando…",
    errSelectSplit: "Selecciona al menos una persona con quien repartir.",
    errExactEach: "Introduce un importe válido para cada persona.",
    errExactSum: "El total asignado debe coincidir con el gasto.",
    errExactSumNeedMore: "Asigna {{amount}} más.",
    errExactSumTooMuch: "Reduce el reparto en {{amount}}.",
    errPercentRange: "Cada porcentaje debe ser un entero de 0 a 100.",
    errPercentSum: "Los porcentajes deben sumar 100%.",
    errSharesPositive: "Cada parte debe ser un entero positivo.",
    errSharesSum: "Se necesita al menos una parte.",
    errAdjEach: "Introduce un ajuste válido para cada persona.",
    errAdjSum: "Los ajustes deben sumar cero.",
    perPersonSame: "{{amount}} / persona",
    a11yIncluded: "incluido",
    a11yNotIncluded: "no incluido",
    inSplit: "en el reparto",
    exactRemaining: "Falta asignar: {{amount}}",
    exactOver: "Te pasas por: {{amount}}",
    exactBalanced: "Totalmente asignado",
    currencyModalTitle: "Moneda",
    currencyModalDone: "Listo",
    currencySearchPlaceholder: "Buscar por código o país",
    currencyEmpty: "Sin coincidencias. Prueba otra búsqueda.",
  },
  groupDetail: {
    titleFallback: "Grupo",
    a11ySettings: "Ajustes del grupo",
    a11yMembers: "Gestionar miembros",
    tabExpenses: "Gastos",
    tabBalances: "Saldos",
    tabTotals: "Totales",
    groupTotal: "Total del grupo: ",
    yourBalance: "Tu saldo: ",
    summaryTheyOweYou: "Te deben",
    summaryYouOwe: "Tú debes",
    balances: "Saldos",
    suggestedSettlements: "Pagos sugeridos",
    suggestedSettlementsSub: "Menos pagos para saldar a todos.",
    transactionsTitle: "Quién paga a quién",
    transactionsSub: "Todos pagan directamente a todos.",
    settlementLine: "{{from}} debe pagar a {{to}} {{amount}}",
    remind: "Recordar",
    allSettledNoPayments: "No hacen falta pagos — todos al día.",
    everyone: "Todos",
    noPeopleInGroup: "No hay personas en este grupo.",
    balanceSettled: "al día",
    balanceGetsBack: "recupera {{amount}}",
    balanceOwes: "debe {{amount}}",
    totalsPlaceholder:
      "Aquí pueden ir gráficos y desglose de gastos (categorías, totales mensuales).",
    totalsByCategory: "Por categoría",
    totalsByMonth: "Por mes",
    totalsByPerson: "Por persona",
    totalsEmpty: "Añade gastos para ver el desglose por categoría y mes.",
    noExpensesYet: "Aún no hay gastos.",
    emptyTitle: "Añade tu primer gasto",
    emptySubtitle:
      "Carga gastos compartidos: reparte en partes iguales o fija importes. El saldo se actualiza al instante.",
    emptyCta: "Empezar",
    quickEdit: "Editar",
    expenseMenuDismiss: "Cerrar menú",
    simplifyAchievementTitle: "Menos pagos con la optimización",
    simplifyAchievementBody:
      "Tally te ahorró {{count}} pago(s) al simplificar los saldos de este grupo.",
    a11ySyncStatus: "Estado de sincronización en la nube",
    a11yExpenseOptions: "Opciones del gasto",
    paidSuffix: " pagó",
    edit: "Editar",
    delete: "Eliminar",
    expenseDeleteBusy: "…",
    detailMetaLogged: " · registrado ",
    sectionThisMonth: "Este mes en el grupo",
    noOtherSpendMonth: "No hay más gasto este mes.",
    sectionNotes: "Notas",
    notePlaceholder: "Añade una nota…",
    groupSettings: "Ajustes del grupo",
    done: "Listo",
    decimalSeparator: "Punto decimal",
    changeIconA11y: "Cambiar icono del grupo",
    icon: "Icono",
    name: "Nombre",
    groupNamePlaceholder: "Nombre del grupo",
    type: "Tipo",
    currency: "Moneda",
    choose: "Elegir",
    simplifyDebts: "Simplificar deudas",
    simplifyHint: "Menos pagos en saldos por defecto",
    saveChanges: "Guardar cambios",
    saving: "Guardando…",
    deleteGroup: "Eliminar grupo",
    deletingGroupProgress: "Eliminando…",
    loading: "Cargando…",
    manageMembers: "Gestionar miembros",
    members: "Miembros",
    noOneYet: "Aún no hay nadie en este grupo.",
    fromOtherGroups: "Amigos guardados",
    searchFriendsPlaceholder: "Buscar amigos…",
    noMatchingFriends: "Ningún amigo coincide.",
    noPastSplits: "No hay amigos guardados por añadir, o ya están en el grupo.",
    newPerson: "Persona nueva",
    namePlaceholder: "Nombre",
    add: "Añadir",
    currencyModalTitle: "Moneda",
    currencySearchPlaceholder: "Buscar por código o país",
    currencyEmpty: "Sin resultados. Prueba otra búsqueda.",
    a11yAddExpense: "Añadir gasto",
    removeFailed: "No se pudo quitar a esta persona.",
    cannotRemoveTitle: "No se puede quitar",
    removeMemberMessage: "¿Quitar a {{name}} de este grupo?",
    removeMemberA11y: "Quitar a {{name}} de este grupo",
    removePersonTitle: "Quitar persona",
    remove: "Quitar",
    deleteExpenseMessage:
      '¿Quitar «{{description}}» de este grupo? Los saldos se actualizarán.',
    deleteExpenseTitle: "Eliminar gasto",
    deleteGroupMessage:
      "¿Eliminar este grupo y todos sus gastos y saldos? No se puede deshacer.",
    youLent: "Prestaste {{amount}}",
    youPaid: "Pagaste",
    youOweShare: "Debes {{amount}}",
    errSave: "No se pudieron guardar los ajustes del grupo",
    exportGroup: "Exportar",
    exportJson: "JSON",
    exportCsv: "CSV",
    exportPng: "PNG",
    exportPdf: "PDF",
    exportBusy: "Exportando…",
  },
};

export const translations: Record<AppLocale, MessageTree> = { en, fa, es };
