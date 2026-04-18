export type AppLocale = "en" | "fa" | "es";

export type MessageTree = {
  tabs: {
    Groups: { label: string; hint: string };
    Friends: { label: string; hint: string };
    Activity: { label: string; hint: string };
    Account: { label: string; hint: string };
  };
  sidebar: { groupShortcuts: string };
  account: {
    kicker: string;
    title: string;
    body: string;
    profile: string;
    displayName: string;
    displayNamePlaceholder: string;
    emailOptional: string;
    emailPlaceholder: string;
    saving: string;
    saveProfile: string;
    profileHint: string;
    defaultCurrency: string;
    defaultCurrencyHint: string;
    choose: string;
    appearance: string;
    appearanceHint: string;
    appearanceLight: string;
    appearanceDark: string;
    appearanceSystem: string;
    language: string;
    languageHint: string;
    languageEnglish: string;
    languageFarsi: string;
    languageSpanish: string;
    currencyModalTitle: string;
    currencyModalDone: string;
    currencySearchPlaceholder: string;
    currencyEmpty: string;
    cloudSyncTitle: string;
    cloudSyncRowLabel: string;
    cloudSyncHint: string;
    cloudSyncNotConfigured: string;
    cloudSyncBuildDisabled: string;
  };
  sync: {
    loading: string;
    localFirst: string;
    upToDate: string;
    lineOnline: string;
    lineOffline: string;
    working: string;
    error: string;
    verbPull: string;
    verbPush: string;
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
    people: string;
    peopleHint: string;
    name: string;
    linkedHint: string;
    searching: string;
    noNameMatch: string;
    link: string;
    emailOptional: string;
    addPerson: string;
    saving: string;
    saveGroup: string;
    modalCurrency: string;
    done: string;
    searchPlaceholder: string;
    emptySearch: string;
  };
  addExpense: {
    cardExpense: string;
    withYouPrefix: string;
    you: string;
    withYouSuffix: string;
    categoryA11y: string;
    whatWasIt: string;
    placeholderDescription: string;
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
    exactHint: string;
    percentHint: string;
    sharesHint: string;
    whoPaid: string;
    memberFallback: string;
    cancel: string;
    save: string;
    saving: string;
    errSelectSplit: string;
    errExactEach: string;
    errExactSum: string;
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
    balances: string;
    suggestedSettlements: string;
    suggestedSettlementsSub: string;
    settlementLine: string;
    remind: string;
    allSettledNoPayments: string;
    everyone: string;
    noPeopleInGroup: string;
    balanceSettled: string;
    balanceGetsBack: string;
    balanceOwes: string;
    totalsPlaceholder: string;
    noExpensesYet: string;
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
  };
};

export const en: MessageTree = {
  tabs: {
    Groups: { label: "Home", hint: "Shared groups" },
    Friends: { label: "Friends", hint: "1:1 balances" },
    Activity: { label: "Activity", hint: "History (soon)" },
    Account: { label: "Settings", hint: "Profile and preferences" },
  },
  sidebar: { groupShortcuts: "Groups" },
  account: {
    kicker: "Settings",
    title: "Settings",
    body: "Manage your profile, default currency, appearance, language, and device sync from here.",
    profile: "Profile",
    displayName: "Display name",
    displayNamePlaceholder: "Your name",
    emailOptional: "Email (optional)",
    emailPlaceholder: "you@example.com",
    saving: "Saving…",
    saveProfile: "Save profile",
    profileHint:
      "This name appears in groups and on splits. Stored on this device only.",
    defaultCurrency: "Default currency",
    defaultCurrencyHint:
      "Pre-selected when you create a new group. You can still pick another per group.",
    choose: "Choose",
    appearance: "Appearance",
    appearanceHint: "Choose light, dark, or match your device settings.",
    appearanceLight: "Light",
    appearanceDark: "Dark",
    appearanceSystem: "System",
    language: "Language",
    languageHint:
      "English, Persian (Farsi), or Spanish. Interface uses right-to-left layout for Persian.",
    languageEnglish: "English",
    languageFarsi: "Persian (Farsi)",
    languageSpanish: "Spanish",
    currencyModalTitle: "Default currency",
    currencyModalDone: "Done",
    currencySearchPlaceholder: "Search by code or country",
    currencyEmpty: "No matches. Try another search.",
    cloudSyncTitle: "Sync between devices",
    cloudSyncRowLabel: "Cloud sync",
    cloudSyncHint:
      "Use cloud sync to keep data updated across your phones and tablets. Requires a PowerSync endpoint in the app build and sign-in.",
    cloudSyncNotConfigured:
      "This build has no cloud endpoint configured, so data stays on this device only. You can still keep this switch on for when you use a build that has sync.",
    cloudSyncBuildDisabled:
      "Sync is turned off in this app build (environment flag).",
  },
  sync: {
    loading: "…",
    localFirst: "Local-first",
    upToDate: "✅ Up to date",
    lineOnline: "Online",
    lineOffline: "Offline (local)",
    working: "☁️ {{ops}}…",
    error: "⚠️ Sync error",
    verbPull: "pull",
    verbPush: "push",
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
    body: 'A timeline of adds, edits, and settlements will live here. Data can stay local-first; sync can layer on later with a "Syncing…" indicator.',
    sectionRecent: "Recent",
    empty:
      "No activity yet. Create a group or add an expense to see a timeline on this device.",
    groupSub: "Group created · {{when}}",
    expenseSub: "{{payer}} paid {{amount}} · {{group}} · {{when}}",
    settlementSub: "Settlement · {{amount}} · {{group}} · {{when}}",
  },
  nav: {
    tally: "Tally",
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
    irrHint: "IRR / IRT (toman) and JPY use whole units in amounts.",
    simplifyDebts: "Simplify debts",
    simplifyHint: "Fewest settlements in balances by default",
    people: "People",
    peopleHint: "Add names; matching friends can be linked to avoid duplicates.",
    name: "Name",
    linkedHint: "Linked to existing friend",
    searching: "Searching…",
    noNameMatch: "No saved names match.",
    link: "Link",
    emailOptional: "Email (optional)",
    addPerson: "+ Add a person",
    saving: "Saving…",
    saveGroup: "Save group",
    modalCurrency: "Currency",
    done: "Done",
    searchPlaceholder: "Search by code or country",
    emptySearch: "No matches. Try another search.",
  },
  addExpense: {
    cardExpense: "Expense",
    withYouPrefix: "With ",
    you: "you",
    withYouSuffix: " and:",
    categoryA11y: "Category",
    whatWasIt: "What was it?",
    placeholderDescription: "Dinner, groceries…",
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
    exactHint: "Amount each person owes (total must match)",
    percentHint:
      "Whole % per person (must sum to 100). Equal weight ≈ {{pct}}% each.",
    sharesHint: "Parts (defaults to 1 each; share of total updates live).",
    whoPaid: "Who paid?",
    memberFallback: "Member",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    errSelectSplit: "Select at least one person to split with.",
    errExactEach: "Enter a valid amount for each person.",
    errExactSum: "Exact amounts must equal the total.",
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
  },
  groupDetail: {
    titleFallback: "Group",
    a11ySettings: "Group settings",
    a11yMembers: "Manage members",
    tabExpenses: "Expenses",
    tabBalances: "Balances",
    tabTotals: "Totals",
    groupTotal: "Group Total: ",
    yourBalance: "Your Balance: ",
    balances: "Balances",
    suggestedSettlements: "Suggested settlements",
    suggestedSettlementsSub: "Fewest payments to settle everyone up.",
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
    noExpensesYet: "No expenses yet.",
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
    members: "Members",
    noOneYet: "No one in this group yet.",
    fromOtherGroups: "From your other groups",
    searchFriendsPlaceholder: "Search friends…",
    noMatchingFriends: "No matching friends.",
    noPastSplits: "No one from past splits, or they’re already here.",
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
  },
};

export const fa: MessageTree = {
  tabs: {
    Groups: { label: "خانه", hint: "گروه‌های مشترک" },
    Friends: { label: "دوستان", hint: "مانده یک‌به‌یک" },
    Activity: { label: "فعالیت", hint: "تاریخچه (به‌زودی)" },
    Account: { label: "تنظیمات", hint: "پروفایل و ترجیحات" },
  },
  sidebar: { groupShortcuts: "گروه‌ها" },
  account: {
    kicker: "تنظیمات",
    title: "تنظیمات",
    body: "پروفایل، ارز پیش‌فرض، ظاهر، زبان و همگام‌سازی دستگاه را از اینجا مدیریت کنید.",
    profile: "پروفایل",
    displayName: "نام نمایشی",
    displayNamePlaceholder: "نام شما",
    emailOptional: "ایمیل (اختیاری)",
    emailPlaceholder: "you@example.com",
    saving: "در حال ذخیره…",
    saveProfile: "ذخیره پروفایل",
    profileHint:
      "این نام در گروه‌ها و تقسیم‌ها دیده می‌شود. فقط روی این دستگاه ذخیره می‌شود.",
    defaultCurrency: "ارز پیش‌فرض",
    defaultCurrencyHint:
      "هنگام ساخت گروه جدید از پیش انتخاب می‌شود؛ می‌توانید برای هر گروه جداگانه عوض کنید.",
    choose: "انتخاب",
    appearance: "ظاهر",
    appearanceHint: "روشن، تاریک، یا هماهنگ با دستگاه.",
    appearanceLight: "روشن",
    appearanceDark: "تاریک",
    appearanceSystem: "سیستم",
    language: "زبان",
    languageHint:
      "انگلیسی، فارسی یا اسپانیایی. برای فارسی، چیدمان راست‌به‌چپ است.",
    languageEnglish: "English",
    languageFarsi: "فارسی",
    languageSpanish: "Español",
    currencyModalTitle: "ارز پیش‌فرض",
    currencyModalDone: "تمام",
    currencySearchPlaceholder: "جستجو با کد یا کشور",
    currencyEmpty: "موردی نیست — عبارت دیگری امتحان کنید.",
    cloudSyncTitle: "همگام‌سازی بین دستگاه‌ها",
    cloudSyncRowLabel: "همگام ابر",
    cloudSyncHint:
      "برای به‌روز ماندن داده روی گوشی‌ها و تبلت‌ها، همگام ابر فعال کنید. به آدرس PowerSync در بیلد و ورود به حساب نیاز است.",
    cloudSyncNotConfigured:
      "این بیلد نقطه ابری ندارد؛ داده فقط روی این دستگاه می‌ماند. اگر بیلد بعدی همگام داشته باشد، می‌توانید سوییچ را روشن نگه دارید.",
    cloudSyncBuildDisabled: "در این بیلد همگام با فلگ محیطی غیرفعال است.",
  },
  sync: {
    loading: "…",
    localFirst: "اجرا محلی",
    upToDate: "✅ به‌روز",
    lineOnline: "آنلاین",
    lineOffline: "آفلاین (محلی)",
    working: "☁️ {{ops}}…",
    error: "⚠️ خطای همگام",
    verbPull: "دریافت",
    verbPush: "ارسال",
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
    body: "خط زمانی افزودن، ویرایش و تسویه‌ها اینجا قرار می‌گیرد. داده می‌تواند محلی بماند؛ همگام‌سازی بعداً اضافه می‌شود.",
    sectionRecent: "اخیر",
    empty: "هنوز فعالیتی نیست — گروه بسازید یا هزینه اضافه کنید.",
    groupSub: "گروه ساخته شد · {{when}}",
    expenseSub: "{{payer}} {{amount}} پرداخت · {{group}} · {{when}}",
    settlementSub: "تسویه · {{amount}} · {{group}} · {{when}}",
  },
  nav: {
    tally: "Tally",
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
    irrHint: "IRR / IRT (تومان) و JPY در مبالغ به واحد کامل هستند.",
    simplifyDebts: "ساده‌سازی بدهی‌ها",
    simplifyHint: "کمترین تسویه در مانده‌ها به‌صورت پیش‌فرض",
    people: "افراد",
    peopleHint:
      "نام اضافه کنید؛ در صورت تطابق می‌توانید به دوستان پیوند دهید تا تکراری نشود.",
    name: "نام",
    linkedHint: "به دوست موجود پیوند خورده",
    searching: "در حال جستجو…",
    noNameMatch: "نام ذخیره‌شده‌ای مطابقت ندارد.",
    link: "پیوند",
    emailOptional: "ایمیل (اختیاری)",
    addPerson: "+ افزودن شخص",
    saving: "در حال ذخیره…",
    saveGroup: "ذخیره گروه",
    modalCurrency: "ارز",
    done: "تمام",
    searchPlaceholder: "جستجو با کد یا کشور",
    emptySearch: "موردی نیست — عبارت دیگری امتحان کنید.",
  },
  addExpense: {
    cardExpense: "هزینه",
    withYouPrefix: "با ",
    you: "شما",
    withYouSuffix: " و:",
    categoryA11y: "دسته",
    whatWasIt: "چه بود؟",
    placeholderDescription: "شام، خرید…",
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
    exactHint: "مبلغ بدهی هر نفر (جمع باید با کل برابر باشد)",
    percentHint:
      "درصد صحیح برای هر نفر (جمع ۱۰۰). وزن مساوی ≈ {{pct}}٪ برای هر نفر.",
    sharesHint: "بخش‌ها (پیش‌فرض ۱؛ سهم از کل زنده به‌روز می‌شود).",
    whoPaid: "چه کسی پرداخت کرد؟",
    memberFallback: "عضو",
    cancel: "لغو",
    save: "ذخیره",
    saving: "در حال ذخیره…",
    errSelectSplit: "حداقل یک نفر را برای تقسیم انتخاب کنید.",
    errExactEach: "برای هر نفر مبلغ معتبر وارد کنید.",
    errExactSum: "جمع مبالغ باید با کل برابر باشد.",
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
    balances: "مانده‌ها",
    suggestedSettlements: "تسویه‌های پیشنهادی",
    suggestedSettlementsSub: "کمترین پرداخت برای تسویه همه.",
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
    noExpensesYet: "هنوز هزینه‌ای نیست.",
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
    members: "اعضا",
    noOneYet: "هنوز کسی در این گروه نیست.",
    fromOtherGroups: "از گروه‌های دیگر شما",
    searchFriendsPlaceholder: "جستجوی دوستان…",
    noMatchingFriends: "دوست مطابقی نیست.",
    noPastSplits: "کسی از تقسیم‌های قبلی نیست، یا همین‌جا هستند.",
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
  },
};

export const es: MessageTree = {
  tabs: {
    Groups: { label: "Inicio", hint: "Grupos compartidos" },
    Friends: { label: "Amigos", hint: "Saldos 1:1" },
    Activity: { label: "Actividad", hint: "Historial (pronto)" },
    Account: { label: "Ajustes", hint: "Perfil y preferencias" },
  },
  sidebar: { groupShortcuts: "Grupos" },
  account: {
    kicker: "Ajustes",
    title: "Ajustes",
    body: "Gestiona tu perfil, moneda predeterminada, apariencia, idioma y sincronización de dispositivos aquí.",
    profile: "Perfil",
    displayName: "Nombre visible",
    displayNamePlaceholder: "Tu nombre",
    emailOptional: "Correo (opcional)",
    emailPlaceholder: "tu@ejemplo.com",
    saving: "Guardando…",
    saveProfile: "Guardar perfil",
    profileHint:
      "Este nombre aparece en grupos y gastos. Solo se guarda en este dispositivo.",
    defaultCurrency: "Moneda predeterminada",
    defaultCurrencyHint:
      "Se preselecciona al crear un grupo; puedes elegir otra por grupo.",
    choose: "Elegir",
    appearance: "Apariencia",
    appearanceHint: "Claro, oscuro o igual que el dispositivo.",
    appearanceLight: "Claro",
    appearanceDark: "Oscuro",
    appearanceSystem: "Sistema",
    language: "Idioma",
    languageHint:
      "Inglés, persa (farsi) o español. La interfaz en persa es de derecha a izquierda.",
    languageEnglish: "English",
    languageFarsi: "فارسی",
    languageSpanish: "Español",
    currencyModalTitle: "Moneda predeterminada",
    currencyModalDone: "Listo",
    currencySearchPlaceholder: "Buscar por código o país",
    currencyEmpty: "Sin resultados. Prueba otra búsqueda.",
    cloudSyncTitle: "Sincronizar entre dispositivos",
    cloudSyncRowLabel: "Sync en la nube",
    cloudSyncHint:
      "Mantén los datos al día en tus teléfonos y tabletas. Requiere un endpoint de PowerSync en el build e inicio de sesión.",
    cloudSyncNotConfigured:
      "Esta versión no tiene nube configurada: los datos quedan en este dispositivo. Puedes dejar el interruptor activado para cuando uses un build con sincronización.",
    cloudSyncBuildDisabled:
      "La sincronización está desactivada en esta compilación (variable de entorno).",
  },
  sync: {
    loading: "…",
    localFirst: "En local",
    upToDate: "✅ Al día",
    lineOnline: "En línea",
    lineOffline: "Fuera de línea (local)",
    working: "☁️ {{ops}}…",
    error: "⚠️ Error de sync",
    verbPull: "descarga",
    verbPush: "subida",
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
    body: "Aquí irá una línea de tiempo de añadidos, ediciones y pagos. Los datos pueden ser locales primero.",
    sectionRecent: "Reciente",
    empty:
      "Aún no hay actividad. Crea un grupo o añade un gasto para ver la línea de tiempo.",
    groupSub: "Grupo creado · {{when}}",
    expenseSub: "{{payer}} pagó {{amount}} · {{group}} · {{when}}",
    settlementSub: "Pago · {{amount}} · {{group}} · {{when}}",
  },
  nav: {
    tally: "Tally",
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
    irrHint: "IRR / IRT (toman) y JPY usan unidades enteras en importes.",
    simplifyDebts: "Simplificar deudas",
    simplifyHint: "Menos pagos en saldos por defecto",
    people: "Personas",
    peopleHint:
      "Añade nombres; puedes enlazar amigos coincidentes para evitar duplicados.",
    name: "Nombre",
    linkedHint: "Enlazado a un amigo existente",
    searching: "Buscando…",
    noNameMatch: "Ningún nombre guardado coincide.",
    link: "Enlazar",
    emailOptional: "Correo (opcional)",
    addPerson: "+ Añadir persona",
    saving: "Guardando…",
    saveGroup: "Guardar grupo",
    modalCurrency: "Moneda",
    done: "Listo",
    searchPlaceholder: "Buscar por código o país",
    emptySearch: "Sin resultados. Prueba otra búsqueda.",
  },
  addExpense: {
    cardExpense: "Gasto",
    withYouPrefix: "Con ",
    you: "tú",
    withYouSuffix: " y:",
    categoryA11y: "Categoría",
    whatWasIt: "¿En qué fue?",
    placeholderDescription: "Cena, compras…",
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
    exactHint: "Importe que debe cada persona (debe coincidir con el total)",
    percentHint:
      "% enteros por persona (deben sumar 100). Peso igual ≈ {{pct}}% cada uno.",
    sharesHint: "Partes (por defecto 1; la parte del total se actualiza al vuelo).",
    whoPaid: "¿Quién pagó?",
    memberFallback: "Miembro",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "Guardando…",
    errSelectSplit: "Selecciona al menos una persona con quien repartir.",
    errExactEach: "Introduce un importe válido para cada persona.",
    errExactSum: "Los importes exactos deben igualar el total.",
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
    balances: "Saldos",
    suggestedSettlements: "Pagos sugeridos",
    suggestedSettlementsSub: "Menos pagos para saldar a todos.",
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
    noExpensesYet: "Aún no hay gastos.",
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
    members: "Miembros",
    noOneYet: "Aún no hay nadie en este grupo.",
    fromOtherGroups: "De tus otros grupos",
    searchFriendsPlaceholder: "Buscar amigos…",
    noMatchingFriends: "Ningún amigo coincide.",
    noPastSplits: "Nadie de repartos anteriores, o ya están aquí.",
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
  },
};

export const translations: Record<AppLocale, MessageTree> = { en, fa, es };
