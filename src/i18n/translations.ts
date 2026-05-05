export type AppLocale = "en" | "fa" | "es";

export type MessageTree = {
  startup: {
    appName: string;
    slogan: string;
  };
  tabs: {
    Groups: { label: string; hint: string };
    Friends: { label: string; hint: string };
    Activity: { label: string; hint: string };
    AiReceipt: { label: string; hint: string };
    Settings: { label: string; hint: string };
  };
  sidebar: { groupShortcuts: string; profileA11y: string; profileSub: string };
  account: {
    kicker: string;
    title: string;
    displayName: string;
    displayNamePlaceholder: string;
    email: string;
    emailOptional: string;
    emailPlaceholder: string;
    invalidEmailTitle: string;
    invalidEmail: string;
    saving: string;
    saveProfile: string;
    /** UPPERCASE labels for the three-stat row at the top of Account. */
    statNet: string;
    statGroups: string;
    statFriends: string;
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
    /** Shown before sign-in when the typed email differs from the one
     * cached on the local profile, so the user can confirm or cancel. */
    authAccountChangeTitle: string;
    /** Body uses {{previous}} and {{next}} placeholders. */
    authAccountChangeBody: string;
    authAccountChangeContinue: string;
    /** Cloud-sync gate overlay (image-#10 design). Shown over the
     * dimmed Cloud sync & backup card when the user isn't signed in
     * or doesn't have premium. */
    gateOverlayPro: string;
    gateOverlaySignInTitle: string;
    gateOverlaySignInBody: string;
    gateOverlaySignInCta: string;
    gateOverlayNoAccount: string;
    gateOverlayLearnMore: string;
    authErrorTitle: string;
    authPasswordTooShort: string;
    /** Shown when the email already belongs to an account but the password is wrong. */
    authWrongPasswordTitle: string;
    authWrongPasswordBody: string;
    /** Hero marketing copy shown when signed out */
    authHeroTitle: string;
    authHeroSubtitle: string;
    /** Cloud sync hero (signed-out) — footer copy under the form */
    cloudFooter: string;
    cloudGoCta: string;
    /** Premium-gate primary CTA on the AI Receipt screen. */
    aiGoCta: string;
    cloudSignInWithEmail: string;
    /** Unified sign-in / sign-up primary CTA */
    authContinue: string;
    authContinueBusy: string;
    /** Kit-aligned hero copy (title + subtitle) for Sign-in mode. */
    authWelcomeBackTitle: string;
    authWelcomeBackSubtitle: string;
    /** Kit-aligned hero copy (title + subtitle) for Create-account mode. */
    authCreateAccountTitle: string;
    authCreateAccountSubtitle: string;
    /** Mode-toggle segments. */
    authModeSignIn: string;
    authModeCreate: string;
    /** Tertiary "Use locally without an account" link below the social row. */
    authUseLocallyLink: string;
    /** Google OAuth button + busy label + "or" divider between auth options. */
    authContinueWithGoogle: string;
    authGoogleBusy: string;
    /** Shown when Supabase rejects Google sign-in because the provider is not enabled in the project. */
    authGoogleProviderDisabledTitle: string;
    authGoogleProviderDisabledBody: string;
    /** Sign in with Apple button + busy label + provider-disabled alert. */
    authContinueWithApple: string;
    authAppleBusy: string;
    authAppleProviderDisabledTitle: string;
    authAppleProviderDisabledBody: string;
    authOrDivider: string;
    /** Shown on successful sign-up when email confirmation is required */
    authWelcomeNewAccount: string;
    /** Inline forgot-password affordance + reset flow */
    authForgotPassword: string;
    authForgotPasswordNoEmail: string;
    authForgotPasswordBusy: string;
    authForgotPasswordSentTitle: string;
    authForgotPasswordSentBody: string;
    authForgotPasswordFailedTitle: string;
    /** Shown when the device appears offline before/after an auth request. */
    authOfflineTitle: string;
    authOfflineBody: string;
    /** Email verification badge on the signed-in sync card */
    authEmailVerified: string;
    authEmailUnverified: string;
    /** Shown when sign-in fails with `email_not_confirmed` */
    authEmailNotConfirmedTitle: string;
    authEmailNotConfirmedBody: string;
    authResendConfirmation: string;
    authResendConfirmationSentTitle: string;
    authResendConfirmationSentBody: string;
    /** Generic cancel (used in action sheets / dialogs inside Account) */
    cancel: string;
    /** Signed-in dashboard sync tile */
    syncStatusOn: string;
    syncStatusOff: string;
    syncStatusLocalOnly: string;
    showPassword: string;
    hidePassword: string;
    cloudAuthentication: string;
    cloudAuthenticationHint: string;
    /** Card section titles (settings layout) */
    sectionAccountSync: string;
    sectionAccount: string;
    sectionSync: string;
    sectionPreferences: string;
    /** New settings-list rows (image-#15 design). */
    rowDataExport: string;
    rowNotifications: string;
    rowHelpSupport: string;
    rowAboutTally: string;
    /** "Last synced: {{when}}" line on the Cloud sync card. */
    syncLastSynced: string;
    /** About Tally modal copy. */
    aboutTitle: string;
    aboutVersion: string;
    aboutTagline: string;
    /** Data & export modal copy (placeholder for now). */
    dataExportTitle: string;
    dataExportBody: string;
    dataExportComingSoon: string;
    avatarA11y: string;
    photoMenuTitle: string;
    photoChoose: string;
    photoTakePhoto: string;
    photoRemove: string;
    photoPermissionTitle: string;
    photoPermissionBody: string;
    photoCameraPermissionTitle: string;
    photoCameraPermissionBody: string;
    photoChangeHint: string;
    photoTapToAdd: string;
    sectionFeedback: string;
    feedbackHint: string;
    feedbackTitleLabel: string;
    feedbackTitlePlaceholder: string;
    feedbackMessageLabel: string;
    feedbackMessagePlaceholder: string;
    feedbackSend: string;
    feedbackSending: string;
    feedbackSentTitle: string;
    feedbackSentBody: string;
    feedbackMissingTitle: string;
    feedbackMissingBody: string;
    feedbackFailedTitle: string;
    feedbackFailedBody: string;
    dangerZone: string;
    deleteAccount: string;
    deleteAccountTitle: string;
    deleteAccountHint: string;
    deleteAccountConfirmBody: string;
    deleteAccountTypeToConfirm: string;
    deleteAccountConfirmCta: string;
    deleteAccountDoneTitle: string;
    deleteAccountDoneBody: string;
    /** "Clear local data" button — wipes the on-device DB / cache while
        leaving the cloud account intact. Distinct from deleteAccount. */
    clearLocalData: string;
    clearLocalDataHint: string;
    clearLocalDataConfirmTitle: string;
    clearLocalDataConfirmBody: string;
    clearLocalDataConfirmCta: string;
    /** Prompt shown after sign-in when the account was previously soft-deleted. */
    restorePromptTitle: string;
    restorePromptBody: string;
    restorePromptRestore: string;
    restorePromptStaySignedOut: string;
    sectionPremium: string;
    premiumTitle: string;
    premiumStatusActive: string;
    premiumStatusInactive: string;
    premiumUpgrade: string;
    premiumRestore: string;
    premiumBusy: string;
    premiumErrorTitle: string;
    premiumCloudBlockTitle: string;
    premiumCloudBlockBody: string;
    premiumSignInFirst: string;
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
    /** Cloud sync toggle on but Premium subscription inactive */
    premiumRequired: string;
    verbPull: string;
    verbPush: string;
    /** Combined pull+push, shown while Supabase is busy */
    verbSync: string;
  };
  friends: {
    kicker: string;
    title: string;
    sub: string;
    /** Section heading above the contact list. */
    myFriends: string;
    /** a11y label for the "..." row menu button. */
    rowMenuA11y: string;
    /** Bottom invite-friends card title, body, and CTA. */
    inviteTitle: string;
    inviteBody: string;
    inviteCta: string;
    /** Default Share message used by the "Invite friends" CTA. */
    inviteShareMessage: string;
    contactEmpty: string;
    searchPlaceholder: string;
    filterAll: string;
    filterWithBalance: string;
    filterYouOwe: string;
    filterOwesYou: string;
    filterSettled: string;
    multiCurrencyHint: string;
    settledHint: string;
    addFriend: string;
    editFriend: string;
    deleteFriend: string;
    /** e.g. "Delete {{name}}" (swipe delete action) */
    deleteFriendA11y: string;
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
    /** Sub-line under the title — e.g. "{{count}} people". */
    peopleCount: string;
    /** Right-side eyebrow on the friends list when this friend owes the user. */
    owesYouLabel: string;
    /** Right-side eyebrow on the friends list when the user owes this friend. */
    youOweLabel: string;
    /** Subtitle: "{{group}}" where the bulk of the debt is, owed to user. */
    owesYouInGroup: string;
    /** Subtitle: "{{group}}" where the bulk of the debt is, owed by user. */
    youOweInGroup: string;
    /** Fallback subtitle when no specific group context is available. */
    owesYouShort: string;
    /** Fallback subtitle when no specific group context is available. */
    youOweShort: string;
    /** Subtitle for friends with zero net balance. */
    allSettled: string;
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
    /** Filter tab labels for the new design. */
    tabAll: string;
    tabExpenses: string;
    tabPayments: string;
    tabSettlements: string;
    /** Day-section headings. */
    dayToday: string;
    dayYesterday: string;
    /** Row primary text variants. */
    rowYouAdded: string;
    rowPersonPaid: string;
    rowYouPaid: string;
    rowGroupCreated: string;
    rowSettlementSent: string;
    rowSettlementReceived: string;
    /** Subtitle template: "Group · time". */
    rowSubGroupTime: string;
    /** Relative-time formats. */
    relJustNow: string;
    relMinutes: string;
    relHours: string;
    /** Filter button a11y label. */
    filterA11y: string;
    /** Search round-button a11y on the title row. */
    searchA11y: string;
    /** Empty-state title shown when no activity has happened yet. */
    emptyTitle: string;
    /** Inline verbs used by the kit-aligned row template. */
    rowGroupCreatedVerb: string;
    rowAddedVerb: string;
    rowInGroup: string;
    rowPaidVerb: string;
    rowPaidYouVerb: string;
  };
  aiReceipt: {
    premiumPill: string;
    /** Page heading at the top of the AI screen, mirroring `friends.title` / `activity.title`. */
    pageTitle: string;
    title: string;
    /** "Add expense to" prefix above the group selector. */
    addExpenseTo: string;
    /** Hero title shown next to the sparkle icon ("Add with AI"). */
    heroTitle: string;
    /** Sub-line under the hero title ("Faster than typing it in"). */
    heroSubtitle: string;
    /** Pill copy "Adding to · {{name}}" shown under the hero. */
    addingToPill: string;
    /** "Choose input method" / "ADD WITH AI" section heading. */
    chooseInputMethod: string;
    /** "ADD WITH AI" eyebrow above the tile grid. */
    addWithAi: string;
    /** "OR DESCRIBE IT…" eyebrow above the textarea. */
    orDescribe: string;
    /** "OR JUST TYPE IT" eyebrow above the redesigned typed-prompt textarea. */
    orJustTypeIt: string;
    /** Helper line shown under the typed-prompt input. */
    tallyFiguresOut: string;
    /** Compact "Analyze" CTA shown inline with the typed-prompt input. */
    analyzeShort: string;
    /** Caption under the large round mic button. */
    tapToSpeak: string;
    /** Input-method tiles: label + secondary line. */
    tilePhoto: string;
    tilePhotoSub: string;
    tileGallery: string;
    tileGallerySub: string;
    tileText: string;
    tileTextSub: string;
    tileVoice: string;
    tileVoiceSub: string;
    lead: string;
    unavailableBuild: string;
    primaryAddReceipt: string;
    changeGroup: string;
    groupSummary: string;
    removePhoto: string;
    previewPhoto: string;
    closePreview: string;
    openSettings: string;
    reanalyze: string;
    takePhoto: string;
    analyzing: string;
    parseFailed: string;
    cameraDenied: string;
    libraryDenied: string;
    noBase64: string;
    linesHeading: string;
    /** a11y label for the per-row "remove item" button on the detected lines list. */
    removeLine: string;
    /** a11y labels for the per-row enable/disable toggle (replaces removal). */
    disableLine: string;
    enableLine: string;
    /** Placeholder shown in the inline-editable line label input. */
    lineLabelPlaceholder: string;
    payerLabel: string;
    pickMemberTitle: string;
    assignedTotal: string;
    sumMismatch: string;
    continueToSplit: string;
    save: string;
    saving: string;
    cancel: string;
    payerBadge: string;
    includedLabel: string;
    excludedLabel: string;
    dragHint: string;
    unassignLineA11y: string;
    whoPaidAndSplit: string;
    modeEqual: string;
    modeExact: string;
    modePercent: string;
    modeShares: string;
    modeAdj: string;
    splitMode_equal: string;
    splitMode_exact: string;
    splitMode_percent: string;
    splitMode_shares: string;
    splitMode_adj: string;
    tileFooterHintPayer: string;
    tileFooterHintInclude: string;
    noLines: string;
    noGroups: string;
    goHome: string;
    receiptCurrency: string;
    modelConfidence: string;
    defaultDescription: string;
    fallbackTotalLabel: string;
    premiumRequiredTitle: string;
    premiumRequiredBody: string;
    premiumUpgradeCta: string;
    /** Shown when the user tries to use AI features while signed out. */
    signInRequiredTitle: string;
    signInRequiredBody: string;
    signInCta: string;
    /** Hero copy shown above the sign-in form on the AI gate panel. */
    gateHeroTitle: string;
    gateHeroSubtitle: string;
    /** Section label above the email/password form. */
    gateSignInWithEmailLabel: string;
    /** Footer disclaimer below the form. */
    gateFooter: string;
    /** Shown when signed in but the email hasn't been confirmed yet. */
    emailUnverifiedTitle: string;
    emailUnverifiedBody: string;
    voiceStart: string;
    voiceStopHint: string;
    voiceRecording: string;
    voiceProcessingTitle: string;
    voiceProcessingBody: string;
    voiceMicDenied: string;
    voiceMicDeniedOpenSettings: string;
    voiceFailed: string;
    /** Shown when the native audio module isn't in the running build. */
    voiceNativeUnavailable: string;
    /** Generic message shown for unexpected AI failures; detail is logged to Supabase. */
    aiErrorGeneric: string;
    /** Shown when an AI call is skipped because the device is offline. */
    offlineError: string;
    /** Label on a button that opens the drag-and-drop assignment modal */
    dndOpen: string;
    /** Header title in the drag-and-drop modal (nav-bar title) */
    dndHeader: string;
    dndCancel: string;
    dndDone: string;
    /** Big title inside the modal body */
    dndTitle: string;
    /** One-line hint under the title */
    dndSubtitle: string;
    dndUnassignedSection: string;
    dndPeopleSection: string;
    dndAllAssigned: string;
    /** a11y label for the "remove from this person" chip — {{name}} = item label */
    dndUnassignA11y: string;
    describeHeading: string;
    describeLead: string;
    describePlaceholder: string;
    describeAnalyze: string;
    describeAnalyzing: string;
    describeEmpty: string;
    describeFailed: string;
    /** Card title for AI-proposed expenses (result of the describe flow) */
    proposedHeading: string;
    proposedPaidBy: string;
    proposedAddAll: string;
    proposedAdding: string;
    proposedAddFailed: string;
    /** Line summarizing n-way split inside the proposed card */
    proposedSplitSummary: string;
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
    snack: string;
    drink: string;
    home: string;
    transport: string;
  };
  groupList: {
    totalBalance: string;
    /** Hero label above the big net amount on the groups summary card. */
    netBalance: string;
    /** Suffix "across {{count}} groups" rendered next to the net amount. */
    acrossGroups: string;
    net: string;
    youAreOwed: string;
    /** UPPERCASE small caption inside the soft-mint stat pill on Home. */
    peopleOweYou: string;
    /** UPPERCASE small caption used on group rows when the user is owed. */
    rowYouLent: string;
    /** UPPERCASE small caption used on group rows when the user owes. */
    rowYouOwe: string;
    /** UPPERCASE small caption used on group rows for settled state. */
    rowSettled: string;
    youOwe: string;
    createdAt: string;
    empty: string;
    deleteConfirm: string;
    alertDeleteGroup: string;
    delete: string;
    statusSettled: string;
    statusYouAreOwed: string;
    statusYouOwe: string;
    fabQuickAddExpense: string;
    /** a11y label for the mic half of the split FAB (starts voice AI capture). */
    fabMicA11y: string;
    menuDismiss: string;
    menuMoreActions: string;
    menuTitleFallback: string;
    editGroup: string;
    deleteGroup: string;
    /** e.g. "Delete group {{name}}" (swipe delete) */
    deleteGroupA11y: string;
    /** Title for the currency picker sheet that filters the summary card. */
    pickSummaryCurrency: string;
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
    /** Subline under the currency pill, e.g. "Used for all expenses in this group". */
    currencySub: string;
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
    /** Inline CTA shown above the empty member list to make adding people obvious. */
    peopleEmptyCta: string;
    /** Placeholder for the unified add/search input in the people composer. */
    peopleInputPlaceholder: string;
    /** Suggest list message when the friend list is empty and nothing has been typed yet. */
    noFriendsYet: string;
    linkedHint: string;
    searching: string;
    link: string;
    /** Row action when no friend matches — opens add-friend, then returns here */
    addFriendNoMatchCta: string;
    /** SUGGESTED card label between People composer and the suggested-friends list. */
    suggestedSection: string;
    /** Title of the "Invite by link" card at the bottom of suggestions. */
    inviteByLink: string;
    /** Subline under the "Invite by link" card title. */
    inviteByLinkSub: string;
    addPerson: string;
    saving: string;
    saveGroup: string;
    modalCurrency: string;
    done: string;
    searchPlaceholder: string;
    emptySearch: string;
    /** Shown if creating the group failed (e.g. database error) */
    errSave: string;
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
    /** Label next to the time picker in the date sheet. */
    time: string;
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
    loadingExpense: string;
    /** Save button label/a11y when title is empty — focuses the title field. */
    needDescription: string;
    /** Save button label/a11y when amount is empty — focuses the amount field. */
    needAmount: string;
    /** Save button label/a11y when no members are present — opens add-person. */
    needSomeoneToSplit: string;
    /** Share-on-save sheet: title above the share actions. */
    sharePromptTitle: string;
    /** Share-on-save sheet: native share CTA. */
    shareNow: string;
    /** Share-on-save sheet: secondary CTA — start a new expense. */
    addAnother: string;
    /** Share-on-save sheet: tertiary CTA — close and return. */
    doneSharing: string;
    /** Share message body — {{description}} {{amount}}. */
    shareMessageBody: string;
    /** Toast/announcement when expense is saved (used for optimistic UI). */
    savedToast: string;
    /** Chip row title — "Who's this with?" replaces the auto-group prereq. */
    chipsTitle: string;
    /** Chip "+ Add" affordance shown at the end of the chip row. */
    chipsAddPerson: string;
    /** Self chip label when no name set yet. */
    chipsYouLabel: string;
    /** Toggle to expose Exact/Percent/Shares/Adjust beyond default Equal. */
    advancedSplitToggle: string;
    /** Subtitle under the Advanced toggle when collapsed. */
    advancedSplitHint: string;
    /** Text-link affordance shown when payer is the local user. */
    paidByYou: string;
    /** Banner label when someone else is the payer. */
    paidByName: string;
    /** "Change" CTA inside the payer banner / picker. */
    changePayer: string;
    /** Picker sheet title — "Who paid?" */
    payerPickerTitle: string;
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
    /** Accessibility label for the dashed "+" tile in the split row. */
    addPersonA11y: string;
    /** Label/title for the inline add-person row. */
    addPersonTitle: string;
    /** Placeholder shown inside the inline add-person text input. */
    addPersonNamePlaceholder: string;
    /** Centred screen title — kit-aligned redesign. */
    title: string;
    /** Eyebrow above the big amount input. */
    amountLabel: string;
    /** Eyebrow above the description field. */
    fieldDescriptionLabel: string;
    /** Banner under "Paid by" — "{{each}} each · {{count}} people". */
    splitEqualEach: string;
    /** Eyebrow above the split-method chip row. */
    splitMethod: string;
    /** Eyebrow above the equal-mode included-members rows. */
    whoIsIn: string;
    /** Eyebrow above the per-member exact amount inputs. */
    exactAmounts: string;
    /** Eyebrow above the percentage inputs. */
    percentages: string;
    /** Eyebrow above the per-member share steppers. */
    sharesSection: string;
    /** Eyebrow above the per-member +/- adjustment inputs. */
    adjustments: string;
    /** Sub-line shown when a member is excluded from an equal split. */
    notIncluded: string;
    /** Sub-line shown after the share count, e.g. "1 share". */
    sharesUnit: string;
    /** Sub-line shown when no adjustment is set on a member. */
    adjustZero: string;
    /** Stepper a11y label — decrement share count. */
    decrementShare: string;
    /** Stepper a11y label — increment share count. */
    incrementShare: string;
    /** Footer label below per-member split rows: "Total". */
    totalLabel: string;
    /** Footer label below per-member shares list: "Total shares". */
    totalSharesLabel: string;
    /** Footer summary for shares mode: "{{count}} / 1 share = {{amount}}". */
    sharesSummaryLine: string;
    /** Footer summary for equal mode left side: "{{count}} of {{total}} included". */
    equalSummaryIncluded: string;
    /** Footer summary for equal mode right side: "{{amount}} each". */
    equalSummaryEach: string;
    /** Footer summary suffix when split is balanced. */
    summaryBalanced: string;
    /** Footer summary suffix when % split exceeds 100: "{{percent}}% over". */
    summaryPercentOver: string;
    /** Footer summary suffix when % split below 100: "{{percent}}% under". */
    summaryPercentUnder: string;
    /** Footer summary suffix for adjust mode when sum is positive: "{{amount}} over". */
    summaryAdjustOver: string;
    /** Footer summary suffix for adjust mode when sum is negative: "{{amount}} under". */
    summaryAdjustUnder: string;
  };
  groupDetail: {
    titleFallback: string;
    a11ySettings: string;
    a11yMembers: string;
    tabExpenses: string;
    tabBalances: string;
    tabTotals: string;
    groupTotal: string;
    /** Under group total: total number of expense rows ({{count}}). */
    expensesCount: string;
    yourBalance: string;
    /** Summary zone: amount others owe the user in this group */
    summaryTheyOweYou: string;
    /** Summary zone: amount the user owes in this group */
    summaryYouOwe: string;
    /** Summary zone label when the user has zero net balance in this group. */
    summaryAllSettled: string;
    balances: string;
    suggestedSettlements: string;
    suggestedSettlementsSub: string;
    transactionsTitle: string;
    transactionsSub: string;
    settlementLine: string;
    remind: string;
    /** Share sheet: suggested settlements list */
    shareSettlementsA11y: string;
    /** First line of shared message; {{group}} = group display name */
    shareSettlementsIntro: string;
    /** Closing line of shared message (friendly reminder) */
    shareSettlementsFooter: string;
    /** PNG/table: payer column */
    settlementExportColFrom: string;
    /** PNG/table: recipient column */
    settlementExportColTo: string;
    /** PNG/table: amount column */
    settlementExportColAmount: string;
    allSettledNoPayments: string;
    everyone: string;
    /** Collapsible net balances: expand control */
    showNetBalances: string;
    hideNetBalances: string;
    /** One line under group total / balances hero: transfer count + total volume */
    balancesSettlementSummary: string;
    /** Short value prop under “Simplify debts” title */
    simplifyBenefitOneLiner: string;
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
    /** Swipe-delete action for an expense row */
    deleteExpenseA11y: string;
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
    /** Email invite when adding someone new to the group (optional email) */
    inviteByEmail: string;
    inviteHint: string;
    inviteRoleCooperate: string;
    inviteRoleWatch: string;
    inviteEmailPlaceholder: string;
    inviteFailedTitle: string;
  };
  /** Share-via-QR screen for group invites. */
  groupShare: {
    headerTitle: string;
    title: string;
    subtitle: string;
    copyLink: string;
    copyShareLink: string;
    copied: string;
    continueWithoutSharing: string;
    peopleJoined: string;
    /** "{{count}} people joined" — pluralized variants live in the host language. */
    peopleJoinedCount: string;
    noOneJoinedYet: string;
    /** Footer caption shown under the join section, references the group name. */
    footerHint: string;
    /** Entry-point button label, used in GroupDetail to open the share screen. */
    openCta: string;
  };
  /** Confirmation screen shown after a deep-linked invite is accepted. */
  inviteAccepted: {
    title: string;
    youJoined: string;
    viewGroup: string;
    /** Body line shown under the title. */
    bodyLine: string;
    /** Members count line on the group card — "{{count}} members". */
    memberCount: string;
    /** Secondary CTA — return to the Groups list. */
    viewAll: string;
    /** Close-button accessibility label (✕). */
    closeA11y: string;
  };
  /**
   * First-run feature tour. Step entries are keyed off `TOUR_STEPS` in
   * `src/providers/TourContext.tsx` — adding a new step requires both a
   * `TOUR_STEPS` entry and matching `tour.<step>.title` / `tour.<step>.body`
   * across every locale.
   */
  tour: {
    skipBtn: string;
    backBtn: string;
    nextBtn: string;
    doneBtn: string;
    fab: { title: string; body: string };
    ai: { title: string; body: string };
    qr: { title: string; body: string };
  };
  /** App preferences tab — strings live in `account.*` for shared rows. */
  settings: {
    title: string;
    preferencesSection: string;
  };
  /** Full-screen QR scanner for invite links. */
  qrScan: {
    title: string;
    cancel: string;
    scanning: string;
    holdSteady: string;
    tryAgain: string;
    permissionTitle: string;
    permissionBody: string;
    permissionGrant: string;
    openSettings: string;
    unrecognizedTitle: string;
    unrecognizedBody: string;
    expenseNotFoundTitle: string;
    expenseNotFoundBody: string;
    /** Caption rendered under the viewfinder while scanning. */
    pointAtCode: string;
    /** Bottom paste-link hint title + body. */
    pasteLinkTitle: string;
    pasteLinkBody: string;
    /** Title shown briefly when a code is detected before the deep link opens. */
    joiningCaption: string;
    /** Permission-denied secondary CTA copy. */
    pasteLinkCta: string;
  };
  /** Reusable share-via-QR card embedded on multiple screens. */
  joinQr: {
    title: string;
    copyLink: string;
    expenseSubtitle: string;
    groupSubtitle: string;
    openButton: string;
    closeButton: string;
    /** Title shown on the redesigned group invite sheet ("Invite to {{name}}"). */
    sheetTitle: string;
    /** Subtitle under the sheet title. */
    sheetSubtitle: string;
    /** Action tile labels under the QR. */
    shareTile: string;
    whatsappTile: string;
    emailTile: string;
  };
  /** Notification center header + empty state + section labels. */
  notifications: {
    title: string;
    markAllRead: string;
    markRead: string;
    archive: string;
    emptyTitle: string;
    emptyBody: string;
    section_action_required: string;
    section_money_updates: string;
    section_activity: string;
    section_system: string;
    seeAll: string;
    /** Time-bucket section eyebrows (kit-aligned). */
    bucketToday: string;
    bucketYesterday: string;
    bucketEarlier: string;
    /** Pill at the top — "You have {{count}} unread". */
    unreadCount: string;
    /** Ellipsis-menu accessibility label. */
    moreA11y: string;
    /** Invite-row buttons. */
    accept: string;
    decline: string;
  };
  premium: {
    gateTitle: string;
    gateBody: string;
    gateCta: string;
    gateBusy: string;
    /** External subscribe button — fallback when IAP isn't available. */
    gateSubscribeWebCta: string;
    gateAiTitle: string;
    gateAiBody: string;
    gateSyncTitle: string;
    gateSyncBody: string;
  };
  plans: {
    /** Plans screen hero. */
    title: string;
    subtitle: string;
    /** Free row. */
    freeName: string;
    freePrice: string;
    freeTagline: string;
    freeFeature1: string;
    freeFeature2: string;
    freeFeature3: string;
    /** Pass features — shared by all three pass types since they unlock
     * the same toolset; only the duration changes between passes. */
    passFeature1: string;
    passFeature2: string;
    passFeature3: string;
    passFeature4: string;
    /** Night Out pass card. */
    nightName: string;
    nightDuration: string;
    nightPrice: string;
    nightExtendPrice: string;
    nightTagline: string;
    /** Trip pass card (most popular). */
    tripName: string;
    tripBadge: string;
    tripDuration: string;
    tripPrice: string;
    tripExtendPrice: string;
    tripTagline: string;
    /** Explorer pass card. */
    explorerName: string;
    explorerDuration: string;
    explorerPrice: string;
    explorerExtendPrice: string;
    explorerTagline: string;
    /** CTAs that the same card uses depending on pass state. */
    ctaBuy: string;
    ctaExtend: string;
    ctaActive: string;
    /** Active-pass banner. */
    activeStatusActive: string;
    activeStatusExtended: string;
    activeStatusEnded: string;
    /** Time-remaining display. Use {{d}} {{h}} {{m}} placeholders as needed. */
    remainingDaysHours: string;
    remainingHoursMinutes: string;
    remainingMinutes: string;
    remainingExpired: string;
    /** Footer / fallbacks. */
    restoreCta: string;
    legalFinePrint: string;
    webFallbackHint: string;
    webFallbackCta: string;
    iapErrorTitle: string;
    iapErrorBody: string;
  };
  onboarding: {
    next: string;
    page1Title: string;
    page1Body: string;
    page2Title: string;
    page2Body: string;
    page3Title: string;
    page3Body: string;
    page4Title: string;
    page4Body: string;
    /** Single-screen onboarding: hero title above the name field. */
    intentTitle: string;
    /** First fragment of the welcome headline (before the accented word). */
    welcomeHeadlineLead: string;
    /** Accented word at the end of the welcome headline. */
    welcomeHeadlineAccent: string;
    /** Single-screen onboarding: short value-prop body under the title. */
    intentBody: string;
    /** Welcome screen feature row titles. */
    featureAiTitle: string;
    featureAiBody: string;
    featureSimplifyTitle: string;
    featureSimplifyBody: string;
    featureSyncTitle: string;
    featureSyncBody: string;
    /** Helper line under the welcome CTA. */
    welcomeFooter: string;
    /** Welcome CTA — proceeds into the app. */
    welcomeCta: string;
    /** Placeholder for the name input on the single-screen onboarding. */
    namePlaceholder: string;
    /** Primary CTA — drops the user straight into AddExpense. */
    primaryCta: string;
    /** Default group name auto-created on first launch (renamable later). */
    defaultGroupName: string;
    /** Tertiary link to the existing sign-in flow. */
    signInLink: string;
    useLocally: string;
    /** Single CTA that leads to the unified sign-in/register page. */
    authCta: string;
    /** Confirm-email overlay — shown post-signup until email is verified. */
    confirmEmailTitle: string;
    confirmEmailBody: string;
    confirmEmailHint: string;
    confirmEmailResendCta: string;
    confirmEmailResending: string;
    confirmEmailResendSent: string;
    /** "Use a different email" CTA on the confirm overlay — typo escape hatch. */
    confirmEmailEditCta: string;
    /** "I've confirmed — continue" CTA — cross-device verification escape hatch. */
    confirmEmailContinueCta: string;
    /** Continue button while the verification check is in flight. */
    confirmEmailContinueBusy: string;
    /** Continue button after the check confirmed the email is still pending. */
    confirmEmailContinueFailed: string;
  };
};

export const en: MessageTree = {
  startup: {
    appName: "Tally",
    slogan: "Track shared expenses. Settle up fast.",
  },
  tabs: {
    Groups: { label: "Home", hint: "Shared groups" },
    Friends: { label: "Friends", hint: "1:1 balances" },
    Activity: { label: "Activity", hint: "History" },
    AiReceipt: { label: "AI", hint: "Receipt scan (premium)" },
    Settings: { label: "Settings", hint: "App preferences" },
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
    email: "Email",
    emailOptional: "Email (optional)",
    emailPlaceholder: "you@example.com",
    invalidEmailTitle: "Invalid email",
    invalidEmail: "Please enter a valid email address, or leave this field empty.",
    statNet: "Net",
    statGroups: "Groups",
    statFriends: "Friends",
    saving: "Saving…",
    saveProfile: "Save profile",
    defaultCurrency: "Default currency",
    appearance: "Theme",
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
    exportFailedTitle: "Could not export",
    exportFailedBody: "Something went wrong while creating the file. Try again.",
    authTitle: "Tally",
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
    authAccountChangeTitle: "Sign in with a different account?",
    authAccountChangeBody:
      "This device is currently linked to {{previous}}. Continuing will sign in as {{next}} instead.",
    authAccountChangeContinue: "Continue",
    gateOverlayPro: "Pro",
    gateOverlaySignInTitle: "Sign in for cloud sync",
    gateOverlaySignInBody:
      "Cloud sync & backup require a signed-in Tally account.",
    gateOverlaySignInCta: "Sign in with Tally",
    gateOverlayNoAccount: "Don't have an account?",
    gateOverlayLearnMore: "More",
    authErrorTitle: "Could not sign in",
    authPasswordTooShort: "Use at least 6 characters for the password.",
    authWrongPasswordTitle: "Wrong password",
    authWrongPasswordBody:
      "This email already has a Tally account, but the password is incorrect. Try again, or tap Forgot password.",
    authHeroTitle: "Never lose a receipt again.",
    authHeroSubtitle: "Your finances, everywhere you are.",
    cloudFooter: "*Your data is encrypted and local-first by default.",
    cloudGoCta: "Go Cloud",
    aiGoCta: "Go Pro",
    cloudSignInWithEmail: "Sign in with Email",
    authContinue: "Continue",
    authContinueBusy: "Working…",
    authWelcomeBackTitle: "Welcome back",
    authWelcomeBackSubtitle: "Sign in to sync across devices.",
    authCreateAccountTitle: "Create your account",
    authCreateAccountSubtitle:
      "Sync expenses everywhere — free, no credit card.",
    authModeSignIn: "Sign in",
    authModeCreate: "Create account",
    authUseLocallyLink: "Use locally without an account",
    authContinueWithGoogle: "Continue with Google",
    authGoogleBusy: "Opening Google…",
    authGoogleProviderDisabledTitle: "Google sign-in unavailable",
    authGoogleProviderDisabledBody: "Google sign-in isn't enabled on this build. Please use email and password instead.",
    authContinueWithApple: "Continue with Apple",
    authAppleBusy: "Opening Apple…",
    authAppleProviderDisabledTitle: "Apple sign-in unavailable",
    authAppleProviderDisabledBody: "Apple sign-in isn't enabled on this build. Please use email and password instead.",
    authOrDivider: "or",
    authWelcomeNewAccount:
      "Welcome to Tally! We sent a confirmation link to your email — confirm it to finish signing in.",
    authForgotPassword: "Forgot password?",
    authForgotPasswordNoEmail: "Enter your email in the Account section first.",
    authForgotPasswordBusy: "Sending reset link…",
    authForgotPasswordSentTitle: "Reset link sent",
    authForgotPasswordSentBody:
      "Check your inbox for a link to reset your password. Follow it, then come back and sign in.",
    authForgotPasswordFailedTitle: "Could not send reset email",
    authOfflineTitle: "You're offline",
    authOfflineBody:
      "No internet connection. Connect to Wi-Fi or cellular data, then try again.",
    authEmailVerified: "Verified",
    authEmailUnverified: "Not verified",
    authEmailNotConfirmedTitle: "Confirm your email",
    authEmailNotConfirmedBody:
      "We sent a confirmation link to your inbox. Click it, then try signing in again.",
    authResendConfirmation: "Resend email",
    authResendConfirmationSentTitle: "Confirmation email sent",
    authResendConfirmationSentBody:
      "Check your inbox (and spam folder) for the new confirmation link.",
    cancel: "Cancel",
    syncStatusOn: "Sync is on",
    syncStatusOff: "Sync is off",
    syncStatusLocalOnly: "Local-only",
    showPassword: "Show password",
    hidePassword: "Hide password",
    cloudAuthentication: "Cloud authentication",
    cloudAuthenticationHint: "Sign in or create a cloud account to enable sync across devices.",
    sectionAccountSync: "Account & sync",
    sectionAccount: "Account",
    sectionSync: "Cloud sync & backup",
    sectionPreferences: "Preferences",
    rowDataExport: "Data & export",
    rowNotifications: "Notifications",
    rowHelpSupport: "Help & support",
    rowAboutTally: "About Tally",
    syncLastSynced: "Last synced: {{when}}",
    aboutTitle: "About Tally",
    aboutVersion: "Version {{version}}",
    aboutTagline: "Split bills with friends, keep balances honest.",
    dataExportTitle: "Data & export",
    dataExportBody: "Export your local data as CSV or JSON for archiving and backup.",
    dataExportComingSoon: "Coming soon.",
    avatarA11y: "Profile photo",
    photoMenuTitle: "Profile photo",
    photoChoose: "Choose from library",
    photoTakePhoto: "Take photo",
    photoRemove: "Remove photo",
    photoPermissionTitle: "Photos access needed",
    photoPermissionBody:
      "Allow photo library access in your device settings to set a profile picture.",
    photoCameraPermissionTitle: "Camera access needed",
    photoCameraPermissionBody:
      "Allow camera access in your device settings to take a profile picture.",
    photoChangeHint: "Tap your photo to change or remove it.",
    photoTapToAdd: "Tap the circle to add a profile picture.",
    sectionFeedback: "Feedback",
    feedbackHint:
      "Send feedback to help improve Tally. If the app crashes or hits an error, it will also save an automatic error report separately.",
    feedbackTitleLabel: "Title (optional)",
    feedbackTitlePlaceholder: "Short summary",
    feedbackMessageLabel: "Message",
    feedbackMessagePlaceholder: "What happened? What should we change?",
    feedbackSend: "Send feedback",
    feedbackSending: "Sending…",
    feedbackSentTitle: "Thanks!",
    feedbackSentBody: "Your feedback means a lot to us. We'll use it to improve Tally.",
    feedbackMissingTitle: "Add a message",
    feedbackMissingBody: "Please write a short message before sending.",
    feedbackFailedTitle: "Could not send",
    feedbackFailedBody: "Something went wrong while saving your feedback. Try again.",
    dangerZone: "Danger zone",
    deleteAccount: "Delete account",
    deleteAccountTitle: "Delete account",
    deleteAccountHint:
      "This will sign you out and permanently remove local data from this device.",
    deleteAccountConfirmBody:
      'To confirm, type "DELETE". This cannot be undone on this device.',
    deleteAccountTypeToConfirm: 'Type "DELETE" to confirm',
    deleteAccountConfirmCta: "Delete now",
    deleteAccountDoneTitle: "Deleted",
    deleteAccountDoneBody:
      "Local data has been removed from this device. You may need to restart the app.",
    clearLocalData: "Clear local data",
    clearLocalDataHint:
      "Wipes everything stored on this device while keeping your cloud account intact. After signing in again, your synced groups will reload.",
    clearLocalDataConfirmTitle: "Clear local data?",
    clearLocalDataConfirmBody:
      "This will sign you out, remove all groups, friends, and settings from this device, and reload the app. Your cloud account is not affected.",
    clearLocalDataConfirmCta: "Clear and restart",
    restorePromptTitle: "Restore your account?",
    restorePromptBody:
      "You deleted this account on {{when}}. Your shared groups and history are still here — restoring will reactivate the account.",
    restorePromptRestore: "Restore",
    restorePromptStaySignedOut: "Stay signed out",
    sectionPremium: "Premium",
    premiumTitle: "Tally Premium",
    premiumStatusActive: "Active — thank you for supporting Tally.",
    premiumStatusInactive: "Not subscribed",
    premiumUpgrade: "Upgrade",
    premiumRestore: "Restore purchases",
    premiumBusy: "Contacting App Store…",
    premiumErrorTitle: "Purchase",
    premiumCloudBlockTitle: "Premium required",
    premiumCloudBlockBody:
      "Cloud sync across devices is included with Tally Premium. Subscribe on this screen, then turn cloud sync on again.",
    premiumSignInFirst: "Sign in to a cloud account before upgrading.",
  },
  sync: {
    loading: "…",
    localFirst: "Local-first",
    upToDate: "Up to date",
    lineOnline: "Online",
    lineOffline: "Offline (local)",
    working: "{{ops}}…",
    statusPending: "Cloud sync will retry",
    premiumRequired: "Premium required for sync",
    verbPull: "pull",
    verbPush: "push",
    verbSync: "sync",
  },
  friends: {
    kicker: "Across groups",
    title: "Friends",
    sub: "Manage people on this device and see pairwise balances from shared expenses.",
    myFriends: "My friends",
    rowMenuA11y: "More options for {{name}}",
    inviteTitle: "Invite friends",
    inviteBody: "Invite friends to join Tally and split expenses easily.",
    inviteCta: "Invite friends",
    inviteShareMessage: "Join me on Tally — split expenses and settle up easily.",
    contactEmpty: "No saved people yet. Add someone to reuse when you split bills in a group.",
    searchPlaceholder: "Search friends",
    filterAll: "All",
    filterWithBalance: "With balance",
    filterYouOwe: "You owe",
    filterOwesYou: "Owes you",
    filterSettled: "Settled",
    multiCurrencyHint: "{{n}} currencies",
    settledHint: "Settled",
    addFriend: "Add person",
    editFriend: "Edit",
    deleteFriend: "Delete",
    deleteFriendA11y: "Delete {{name}}",
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
      "Remove {{name}} from your friends list? Their name stays in any past group or expense.",
    empty: "No shared expenses yet — add people in a group and split bills.",
    owesYou: "owes you {{amount}}",
    youOwe: "you owe {{amount}}",
    settled: "settled",
    peopleCount: "{{count}} people",
    owesYouLabel: "OWES YOU",
    youOweLabel: "YOU OWE",
    owesYouInGroup: "owes you in {{group}}",
    youOweInGroup: "you owe in {{group}}",
    owesYouShort: "owes you",
    youOweShort: "you owe",
    allSettled: "All settled",
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
    tabAll: "All",
    tabExpenses: "Expenses",
    tabPayments: "Payments",
    tabSettlements: "Settlements",
    dayToday: "Today",
    dayYesterday: "Yesterday",
    rowYouAdded: "You added an expense",
    rowPersonPaid: "{{name}} paid {{amount}}",
    rowYouPaid: "You paid {{amount}}",
    rowGroupCreated: "Group {{name}} created",
    rowSettlementSent: "Settlement sent to {{name}}",
    rowSettlementReceived: "Settlement received from {{name}}",
    rowSubGroupTime: "{{group}} · {{time}}",
    relJustNow: "Just now",
    relMinutes: "{{n}}m ago",
    relHours: "{{n}}h ago",
    filterA11y: "Filter activity",
    searchA11y: "Search activity",
    emptyTitle: "No activity yet",
    rowGroupCreatedVerb: "created group",
    rowAddedVerb: "added",
    rowInGroup: "in {{group}}",
    rowPaidVerb: "paid",
    rowPaidYouVerb: "paid you",
  },
  aiReceipt: {
    premiumPill: "Premium",
    pageTitle: "Artificial Intelligence",
    title: "Scan or describe your receipt",
    addExpenseTo: "Add expense to",
    heroTitle: "Add with AI",
    heroSubtitle: "Faster than typing it in",
    addingToPill: "Adding to · {{name}}",
    chooseInputMethod: "Choose input method",
    addWithAi: "Add with AI",
    orDescribe: "Or describe it…",
    orJustTypeIt: "Or just type it",
    tallyFiguresOut: "Tally figures out who paid, who's in, and the math.",
    analyzeShort: "Analyze",
    tapToSpeak: "Tap to speak",
    tilePhoto: "Photo",
    tilePhotoSub: "Snap the receipt",
    tileGallery: "Gallery",
    tileGallerySub: "Pick from photos",
    tileText: "Text",
    tileTextSub: "Type details",
    tileVoice: "Voice",
    tileVoiceSub: "Speak it",
    lead: "Assign each line to someone, choose who paid, then save the expense.",
    unavailableBuild: "Receipt scanning isn’t available in this build.",
    primaryAddReceipt: "Add receipt photo",
    changeGroup: "Change group",
    groupSummary: "{{name}} · {{currency}}",
    removePhoto: "Remove photo",
    previewPhoto: "Preview photo",
    closePreview: "Close preview",
    openSettings: "Open settings",
    reanalyze: "Try again",
    takePhoto: "Camera",
    analyzing: "Reading receipt…",
    parseFailed: "Could not read this receipt. Try a sharper photo.",
    cameraDenied: "Camera access was denied.",
    libraryDenied: "Photo library access is off. You can enable it in system settings for Tally.",
    noBase64: "This image could not be read. Try another photo.",
    linesHeading: "Drag and drop items",
    removeLine: "Remove item",
    disableLine: "Disable item",
    enableLine: "Enable item",
    lineLabelPlaceholder: "Item",
    payerLabel: "Who paid?",
    pickMemberTitle: "Assign to",
    assignedTotal: "Split total: {{amount}}",
    sumMismatch:
      "Receipt total and assigned lines differ by about {{diff}}. The expense uses the assigned line total.",
    continueToSplit: "Save expense",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    payerBadge: "Paid",
    includedLabel: "Included",
    excludedLabel: "Out",
    dragHint: "Tip: long-press a line and drag it onto a person's tile.",
    unassignLineA11y: "Unassign from {{name}}",
    whoPaidAndSplit: "Who paid & split",
    modeEqual: "Equal",
    modeExact: "Exact",
    modePercent: "%",
    modeShares: "Shares",
    modeAdj: "Adj",
    splitMode_equal: "Split equally",
    splitMode_exact: "Split per item",
    splitMode_percent: "Split by percentage",
    splitMode_shares: "Split by shares",
    splitMode_adj: "Adjusted split",
    tileFooterHintPayer: "Tap a profile picture to choose who paid.",
    tileFooterHintInclude:
      "Tap the check row below a name to include or exclude someone from the split.",
    noLines: "No lines found. Try another photo.",
    noGroups: "Create a group on Home first.",
    goHome: "Home",
    receiptCurrency: "Detected currency {{code}} — amounts use your group currency.",
    modelConfidence: "Confidence: {{level}}",
    defaultDescription: "Receipt",
    fallbackTotalLabel: "Receipt total",
    premiumRequiredTitle: "Premium feature",
    premiumRequiredBody:
      "AI receipt scanning is included with Tally Premium. Open Settings to subscribe or restore purchases.",
    premiumUpgradeCta: "Open Settings",
    signInRequiredTitle: "Sign in to use AI",
    signInRequiredBody:
      "AI receipt scanning and voice expense logging require a signed-in Tally account.",
    signInCta: "Sign in",
    gateHeroTitle: "Never lose a receipt again.",
    gateHeroSubtitle: "Your finances, everywhere you are.",
    gateSignInWithEmailLabel: "Sign in with Email",
    gateFooter: "*Your data is encrypted and local-first by default.",
    emailUnverifiedTitle: "Confirm your email",
    emailUnverifiedBody:
      "We sent a confirmation link to your inbox. Verify your email to unlock AI features and cloud sync.",
    voiceStart: "Tap to record",
    voiceStopHint: "Tap to stop",
    voiceRecording: "Recording…",
    voiceProcessingTitle: "Processing with AI…",
    voiceProcessingBody: "Extracting bill details",
    voiceMicDenied: "Microphone access is off. Enable it in system settings to record.",
    voiceMicDeniedOpenSettings: "Open settings",
    voiceFailed: "Could not transcribe this recording. Try speaking more clearly.",
    voiceNativeUnavailable:
      "Voice recording isn't available in this build. Rebuild the app to enable it.",
    aiErrorGeneric:
      "Something went wrong with the AI. Please try again.",
    offlineError: "You appear to be offline. Reconnect and try again.",
    dndOpen: "Drag & drop to assign",
    dndHeader: "Scan Receipt",
    dndCancel: "Back",
    dndDone: "Done",
    dndTitle: "Assign Items",
    dndSubtitle: "Drag items to people's plates",
    dndUnassignedSection: "Unassigned Items",
    dndPeopleSection: "People",
    dndAllAssigned: "All items are assigned.",
    dndUnassignA11y: "Remove {{name}} from this person",
    describeHeading: "Add expense with AI",
    describeLead:
      "Type the expense, tap the mic to record, or attach a receipt photo. Edit the text and analyze again to resend to the AI.",
    describePlaceholder:
      "e.g. I paid $80 for dinner, split equally with Alice and Bob. Alice paid $20 for drinks for the three of us.",
    describeAnalyze: "Analyze",
    describeAnalyzing: "Thinking…",
    describeEmpty: "Add at least a few words before analyzing.",
    describeFailed: "The AI could not understand this. Try again with more detail.",
    proposedHeading: "Proposed expenses",
    proposedPaidBy: "Paid by {{name}}",
    proposedAddAll: "Add all to {{group}}",
    proposedAdding: "Adding…",
    proposedAddFailed: "Could not add these expenses.",
    proposedSplitSummary: "Split across {{count}}",
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
    snack: "Snacks",
    drink: "Drinks",
    home: "Home",
    transport: "Transport",
  },
  groupList: {
    totalBalance: "Total balance",
    netBalance: "Your net balance",
    acrossGroups: "across {{count}} groups",
    net: "Net",
    youAreOwed: "You are owed",
    peopleOweYou: "People owe you",
    rowYouLent: "You lent",
    rowYouOwe: "You owe",
    rowSettled: "Settled",
    youOwe: "You owe",
    createdAt: "Created · {{when}}",
    empty: "No groups yet. Create one to start tracking shared expenses.",
    deleteConfirm:
      'Delete "{{name}}" and all its expenses? This cannot be undone.',
    alertDeleteGroup: "Delete group",
    delete: "Delete",
    statusSettled: "You’re settled up in this group",
    statusYouAreOwed: "You are owed {{amount}}",
    statusYouOwe: "You owe {{amount}}",
    fabQuickAddExpense: "Quick add expense",
    fabMicA11y: "Record expense with voice AI",
    menuDismiss: "Dismiss menu",
    menuMoreActions: "More actions for {{name}}",
    menuTitleFallback: "Group",
    editGroup: "Edit group",
    deleteGroup: "Delete group",
    deleteGroupA11y: "Delete group {{name}}",
    pickSummaryCurrency: "Show balance in",
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
    currencySub: "Used for all expenses in this group",
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
    peopleEmptyCta: "Type a name and tap return to add someone",
    peopleInputPlaceholder: "Add a name or search friends…",
    noFriendsYet: "No saved friends yet — type a name above to add one.",
    linkedHint: "Linked to existing friend",
    searching: "Searching…",
    link: "Link",
    addFriendNoMatchCta: "No match — add new person",
    suggestedSection: "Suggested",
    inviteByLink: "Invite by link",
    inviteByLinkSub: "They don't need an account.",
    addPerson: "+ Add a person",
    saving: "Saving…",
    saveGroup: "Save group",
    modalCurrency: "Currency",
    done: "Done",
    searchPlaceholder: "Search by code or country",
    emptySearch: "No matches. Try another search.",
    errSave: "Could not create this group",
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
    time: "Time",
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
    loadingExpense: "Loading expense…",
    needDescription: "Add a description",
    needAmount: "Enter the amount",
    needSomeoneToSplit: "Add someone to split with",
    sharePromptTitle: "Send this to your splitters",
    shareNow: "Share",
    addAnother: "Add another",
    doneSharing: "Done",
    shareMessageBody: "{{description}} — {{amount}}",
    savedToast: "Saved",
    chipsTitle: "Who's this with?",
    chipsAddPerson: "Add",
    chipsYouLabel: "You",
    advancedSplitToggle: "Advanced split options",
    advancedSplitHint: "Exact amounts, percentages, shares, adjustments",
    paidByYou: "Paid by you",
    paidByName: "Paid by {{name}}",
    changePayer: "Change",
    payerPickerTitle: "Who paid?",
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
    addPersonA11y: "Add a person to this group",
    addPersonTitle: "Add a person",
    addPersonNamePlaceholder: "Type a name",
    title: "Add expense",
    amountLabel: "Amount",
    fieldDescriptionLabel: "What was this for?",
    splitEqualEach: "{{each}} each · {{count}} people",
    splitMethod: "Split method",
    whoIsIn: "Who is in?",
    exactAmounts: "Exact amounts",
    percentages: "Percentages",
    sharesSection: "Shares",
    adjustments: "Adjustments",
    notIncluded: "Not included",
    sharesUnit: "share",
    adjustZero: "no adjustment",
    decrementShare: "Decrease share",
    incrementShare: "Increase share",
    totalLabel: "Total",
    totalSharesLabel: "Total shares",
    sharesSummaryLine: "{{count}} / 1 share = {{amount}}",
    equalSummaryIncluded: "{{count}} of {{total}} included",
    equalSummaryEach: "{{amount}} each",
    summaryBalanced: "Balanced",
    summaryPercentOver: "{{percent}}% over",
    summaryPercentUnder: "{{percent}}% under",
    summaryAdjustOver: "{{amount}} over",
    summaryAdjustUnder: "{{amount}} under",
  },
  groupDetail: {
    titleFallback: "Group",
    a11ySettings: "Group settings",
    a11yMembers: "Manage members",
    tabExpenses: "Expenses",
    tabBalances: "Balances",
    tabTotals: "Totals",
    groupTotal: "Group total ",
    expensesCount: "{{count}} expenses",
    yourBalance: "Your Balance: ",
    summaryTheyOweYou: "People owe you",
    summaryYouOwe: "You owe",
    summaryAllSettled: "All settled",
    balances: "Balances",
    suggestedSettlements: "Suggested settlements",
    suggestedSettlementsSub: "Fewest payments to settle everyone up.",
    transactionsTitle: "Who pays who",
    transactionsSub: "Everyone pays everyone directly.",
    settlementLine: "{{from}} should pay {{to}} {{amount}}",
    remind: "Remind",
    shareSettlementsA11y: "Share suggested payments",
    shareSettlementsIntro: "{{group}} — suggested payments to settle balances:",
    shareSettlementsFooter: "Please settle up when you can.",
    settlementExportColFrom: "From",
    settlementExportColTo: "To",
    settlementExportColAmount: "Amount",
    allSettledNoPayments: "No payments needed — all settled.",
    everyone: "Everyone",
    showNetBalances: "Show net balances",
    hideNetBalances: "Hide net balances",
    balancesSettlementSummary: "{{count}} transfers · {{amount}} to move",
    simplifyBenefitOneLiner: "Fewer payments. Same net amounts.",
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
    deleteExpenseA11y: "Delete {{description}}",
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
    inviteByEmail: "Invite by email",
    inviteHint:
      "If you enter an email, we’ll create an invite for that address. Turn on cloud sync in Settings so it can reach them.",
    inviteRoleCooperate: "Co‑edit",
    inviteRoleWatch: "View only",
    inviteEmailPlaceholder: "friend@example.com",
    inviteFailedTitle: "Could not create invite",
  },
  groupShare: {
    headerTitle: "Share",
    title: "Invite Friends",
    subtitle: "Share this QR code so everyone can join",
    copyLink: "Copy link",
    copyShareLink: "Copy Share Link",
    copied: "Link copied",
    continueWithoutSharing: "Continue Without Sharing",
    peopleJoined: "People Joined",
    peopleJoinedCount: "{{count}} people joined",
    noOneJoinedYet: "No one has joined yet.",
    footerHint: "Anyone with this code can join “{{name}}”.",
    openCta: "Share via QR",
  },
  inviteAccepted: {
    title: "You're in!",
    youJoined: "You've joined",
    viewGroup: "Open group",
    bodyLine: "You've joined a group. Start splitting from your next bill.",
    memberCount: "{{count}} members",
    viewAll: "View all groups",
    closeA11y: "Close",
  },
  tour: {
    skipBtn: "Skip",
    backBtn: "Back",
    nextBtn: "Next",
    doneBtn: "Done",
    fab: {
      title: "Add expenses fast",
      body: "Tap + to start an expense, or hold the mic to dictate one.",
    },
    ai: {
      title: "Snap a receipt",
      body: "AI reads the receipt and splits the line items across your group.",
    },
    qr: {
      title: "Join with a QR",
      body: "Scan a friend's invite code to join their group instantly.",
    },
  },
  settings: {
    title: "Settings",
    preferencesSection: "Preferences",
  },
  qrScan: {
    title: "Scan QR Code",
    cancel: "Cancel",
    scanning: "Scanning…",
    holdSteady: "Hold steady",
    tryAgain: "Try again",
    permissionTitle: "Camera permission needed",
    permissionBody:
      "Tally needs camera access to scan QR codes for group invites.",
    permissionGrant: "Grant access",
    openSettings: "Open Settings",
    unrecognizedTitle: "QR code not recognized",
    unrecognizedBody: "This QR code doesn't look like a Tally invite link.",
    expenseNotFoundTitle: "Expense not available",
    expenseNotFoundBody:
      "We couldn't find that expense on this device. Ask the host to share the group invite first.",
    pointAtCode: "Point at a Tally QR to join",
    pasteLinkTitle: "Or paste a link",
    pasteLinkBody: "tally.cc/g/…",
    joiningCaption: "Joining…",
    pasteLinkCta: "Paste a link instead",
  },
  joinQr: {
    title: "Share via QR",
    copyLink: "Copy link",
    expenseSubtitle:
      "Anyone scanning this can join the expense — opens the app if installed, otherwise the web app.",
    groupSubtitle:
      "Anyone scanning this joins the group — opens the app if installed, otherwise the web app.",
    openButton: "Show join QR",
    closeButton: "Close",
    sheetTitle: "Invite to {{name}}",
    sheetSubtitle: "Scan, tap, or share — they don't need an account.",
    shareTile: "Share",
    whatsappTile: "WhatsApp",
    emailTile: "Email",
  },
  notifications: {
    title: "Notifications",
    markAllRead: "Mark all read",
    markRead: "Mark read",
    archive: "Archive",
    emptyTitle: "No notifications yet",
    emptyBody:
      "When something happens in your groups, you'll see it here.",
    section_action_required: "Action required",
    section_money_updates: "Money updates",
    section_activity: "Activity",
    section_system: "Earlier",
    seeAll: "See all notifications",
    bucketToday: "Today",
    bucketYesterday: "Yesterday",
    bucketEarlier: "Earlier",
    unreadCount: "You have {{count}} unread",
    moreA11y: "More options",
    accept: "Accept",
    decline: "Decline",
  },
  premium: {
    gateTitle: "Upgrade to unlock",
    gateBody: "Plus unlocks the convenience tools — keep using Tally free as long as you like.",
    gateCta: "See plans",
    gateBusy: "Please wait…",
    gateSubscribeWebCta: "Subscribe online",
    gateAiTitle: "Snap. Split. Done.",
    gateAiBody:
      "Photograph any receipt and Tally splits the line items between everyone — no manual entry.",
    gateSyncTitle: "Sync across every device",
    gateSyncBody:
      "Pick up where you left off on any phone or computer. Plus keeps every trip in sync.",
  },
  plans: {
    title: "Tally Passes",
    subtitle: "Premium tools, on demand. Pay once, use for the duration.",
    freeName: "Free",
    freePrice: "$0",
    freeTagline: "Track shared expenses on this device.",
    freeFeature1: "Unlimited groups and expenses",
    freeFeature2: "Equal splits and live balances",
    freeFeature3: "Stays on this phone — nothing uploaded",
    passFeature1: "Snap a receipt — splits assign themselves",
    passFeature2: "Advanced splits: shares, percentages, exact amounts",
    passFeature3: "Smart settle-up suggestions",
    passFeature4: "Cloud sync across all your devices",
    nightName: "Night Out Pass",
    nightDuration: "24 hours",
    nightPrice: "$1.99",
    nightExtendPrice: "$0.99",
    nightTagline:
      "Dinner, drinks, the cab home — split everything in seconds.",
    tripName: "Trip Pass",
    tripBadge: "Most popular",
    tripDuration: "7 days",
    tripPrice: "$5.99",
    tripExtendPrice: "$2.99",
    tripTagline:
      "Heading on a trip? Premium tools for the whole week, no subscription.",
    explorerName: "Explorer Pass",
    explorerDuration: "30 days",
    explorerPrice: "$14.99",
    explorerExtendPrice: "$7.99",
    explorerTagline:
      "Always splitting? A full month of premium without the auto-bill.",
    ctaBuy: "Get pass",
    ctaExtend: "Extend Pass",
    ctaActive: "Pass active",
    activeStatusActive: "Active",
    activeStatusExtended: "Extended",
    activeStatusEnded: "Ended",
    remainingDaysHours: "{{d}}d {{h}}h left",
    remainingHoursMinutes: "{{h}}h {{m}}m left",
    remainingMinutes: "{{m}}m left",
    remainingExpired: "Just ended",
    restoreCta: "Restore purchases",
    legalFinePrint:
      "One-time purchases. Tally never auto-bills you — extend or buy a new pass any time.",
    webFallbackHint:
      "In-app purchases aren't available on this build.",
    webFallbackCta: "Buy on the web",
    iapErrorTitle: "Purchase didn't go through",
    iapErrorBody:
      "We couldn't complete this purchase. Please try again, or restore a previous purchase.",
  },
  onboarding: {
    next: "Next",
    page1Title: "Welcome to Tally",
    page1Body:
      "Track shared expenses with friends, roommates, or travel buddies — and settle up without the awkward math.",
    page2Title: "Add expenses in seconds",
    page2Body:
      "Log what you paid, who it was for, and Tally figures out each person's share automatically.",
    page3Title: "Simplify debts",
    page3Body:
      "Tally merges IOUs across your group so everyone settles with the fewest possible payments.",
    page4Title: "Let's get started",
    page4Body:
      "Use Tally on this device only, or sign in so your data follows you across phones and the web.",
    intentTitle: "Welcome to Tally",
    welcomeHeadlineLead: "Split bills, not",
    welcomeHeadlineAccent: "friendships",
    intentBody:
      "Track shared expenses with anyone — trips, roommates, dates. Tally does the math, AI reads the receipt.",
    featureAiTitle: "AI receipt scanning",
    featureAiBody: "Snap a photo, items split themselves",
    featureSimplifyTitle: "Simplify debts",
    featureSimplifyBody: "Fewer payments, same net amounts",
    featureSyncTitle: "Sync everywhere",
    featureSyncBody: "Local-first, cloud backup, no logins required",
    welcomeFooter: "No account needed. Add cloud sync later.",
    welcomeCta: "Get started",
    namePlaceholder: "Your name",
    primaryCta: "Add your first expense",
    defaultGroupName: "New group",
    signInLink: "Already have an account? Sign in",
    useLocally: "Use locally",
    authCta: "Sign in or create account",
    confirmEmailTitle: "Confirm your email",
    confirmEmailBody:
      "We sent a confirmation link to {{email}}. Click it to unlock cloud sync and AI features.",
    confirmEmailHint:
      "You can still use Tally on this device without confirming — tap \"Use locally\" to continue offline.",
    confirmEmailResendCta: "Resend email",
    confirmEmailResending: "Sending…",
    confirmEmailResendSent: "✓ Email sent — check your inbox",
    confirmEmailEditCta: "Use a different email",
    confirmEmailContinueCta: "I've confirmed — continue",
    confirmEmailContinueBusy: "Checking…",
    confirmEmailContinueFailed: "Still not confirmed — try again",
  },
};

export const fa: MessageTree = {
  startup: {
    appName: "Tally",
    slogan: "هزینه‌های مشترک را ثبت کنید. سریع تسویه کنید.",
  },
  tabs: {
    Groups: { label: "خانه", hint: "گروه‌های مشترک" },
    Friends: { label: "دوستان", hint: "مانده یک‌به‌یک" },
    Activity: { label: "فعالیت", hint: "تاریخچه (به‌زودی)" },
    AiReceipt: { label: "هوش مصنوعی", hint: "اسکن رسید (پریمیوم)" },
    Settings: { label: "تنظیمات", hint: "ترجیحات برنامه" },
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
    email: "ایمیل",
    emailOptional: "ایمیل (اختیاری)",
    emailPlaceholder: "you@example.com",
    invalidEmailTitle: "ایمیل نامعتبر",
    invalidEmail: "یک آدرس ایمیل معتبر وارد کنید یا فیلد را خالی بگذارید.",
    statNet: "خالص",
    statGroups: "گروه‌ها",
    statFriends: "دوستان",
    saving: "در حال ذخیره…",
    saveProfile: "ذخیره پروفایل",
    defaultCurrency: "ارز پیش‌فرض",
    appearance: "تم",
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
    exportFailedTitle: "خروجی نشد",
    exportFailedBody: "هنگام ساخت فایل خطایی رخ داد. دوباره امتحان کنید.",
    authTitle: "Tally",
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
    authAccountChangeTitle: "ورود با حساب دیگر؟",
    authAccountChangeBody:
      "این دستگاه در حال حاضر به {{previous}} متصل است. با ادامه، به‌جای آن با {{next}} وارد می‌شوید.",
    authAccountChangeContinue: "ادامه",
    gateOverlayPro: "پرو",
    gateOverlaySignInTitle: "برای همگام‌سازی ابری وارد شوید",
    gateOverlaySignInBody:
      "همگام‌سازی و پشتیبان‌گیری ابری نیاز به حساب Tally فعال دارد.",
    gateOverlaySignInCta: "ورود با Tally",
    gateOverlayNoAccount: "حساب ندارید؟",
    gateOverlayLearnMore: "بیشتر",
    authErrorTitle: "ورود انجام نشد",
    authPasswordTooShort: "رمز حداقل ۶ کاراکتر باشد.",
    authWrongPasswordTitle: "رمز اشتباه است",
    authWrongPasswordBody:
      "این ایمیل قبلاً در Tally ثبت شده اما رمز درست نیست. دوباره تلاش کنید یا روی «فراموشی رمز» بزنید.",
    authHeroTitle: "دیگر هرگز رسیدی را گم نکنید.",
    authHeroSubtitle: "امور مالی شما، هرجا که باشید.",
    cloudFooter: "*داده‌های شما به‌صورت پیش‌فرض رمزگذاری شده و محلی‌محور است.",
    cloudGoCta: "فعال‌سازی ابر",
    aiGoCta: "فعال‌سازی پرو",
    cloudSignInWithEmail: "ورود با ایمیل",
    authContinue: "ادامه",
    authContinueBusy: "در حال انجام…",
    authWelcomeBackTitle: "خوش آمدید",
    authWelcomeBackSubtitle: "برای همگام‌سازی بین دستگاه‌ها وارد شوید.",
    authCreateAccountTitle: "حساب کاربری ایجاد کنید",
    authCreateAccountSubtitle:
      "هزینه‌ها را همه‌جا همگام کنید — رایگان، بدون نیاز به کارت.",
    authModeSignIn: "ورود",
    authModeCreate: "ساخت حساب",
    authUseLocallyLink: "استفاده محلی بدون حساب",
    authContinueWithGoogle: "ادامه با گوگل",
    authGoogleBusy: "باز کردن گوگل…",
    authGoogleProviderDisabledTitle: "ورود با گوگل در دسترس نیست",
    authGoogleProviderDisabledBody: "ورود با گوگل در این نسخه فعال نیست. لطفاً با ایمیل و رمز عبور وارد شوید.",
    authContinueWithApple: "ادامه با اپل",
    authAppleBusy: "باز کردن اپل…",
    authAppleProviderDisabledTitle: "ورود با اپل در دسترس نیست",
    authAppleProviderDisabledBody: "ورود با اپل در این نسخه فعال نیست. لطفاً با ایمیل و رمز عبور وارد شوید.",
    authOrDivider: "یا",
    authWelcomeNewAccount:
      "به Tally خوش آمدید! لینک تأیید به ایمیل شما فرستاده شد — برای تکمیل ورود روی آن کلیک کنید.",
    authForgotPassword: "رمز را فراموش کرده‌اید؟",
    authForgotPasswordNoEmail: "ابتدا ایمیل را در بخش «حساب» وارد کنید.",
    authForgotPasswordBusy: "در حال ارسال لینک بازیابی…",
    authForgotPasswordSentTitle: "لینک بازیابی ارسال شد",
    authForgotPasswordSentBody:
      "ایمیل خود را بررسی کنید و با لینک ارسال‌شده رمز را بازنشانی کنید، سپس برگردید و وارد شوید.",
    authForgotPasswordFailedTitle: "ارسال ایمیل بازیابی ممکن نشد",
    authOfflineTitle: "اتصال اینترنت ندارید",
    authOfflineBody:
      "اتصال اینترنت برقرار نیست. به Wi-Fi یا داده همراه وصل شوید و دوباره تلاش کنید.",
    authEmailVerified: "تأیید شده",
    authEmailUnverified: "تأیید نشده",
    authEmailNotConfirmedTitle: "ایمیل را تأیید کنید",
    authEmailNotConfirmedBody:
      "لینک تأیید به صندوق ایمیل شما ارسال شده است. روی آن کلیک کنید و دوباره وارد شوید.",
    authResendConfirmation: "ارسال دوباره ایمیل",
    authResendConfirmationSentTitle: "ایمیل تأیید ارسال شد",
    authResendConfirmationSentBody:
      "لینک جدید را در صندوق ورودی (و پوشه هرزنامه) بررسی کنید.",
    cancel: "انصراف",
    syncStatusOn: "همگام‌سازی فعال است",
    syncStatusOff: "همگام‌سازی خاموش است",
    syncStatusLocalOnly: "فقط محلی",
    showPassword: "نمایش رمز",
    hidePassword: "پنهان کردن رمز",
    cloudAuthentication: "احراز هویت ابر",
    cloudAuthenticationHint: "برای فعال کردن همگام‌سازی، در حساب ابری خود وارد شوید یا حساب جدید ایجاد کنید.",
    sectionAccountSync: "حساب و همگام‌سازی",
    sectionAccount: "حساب",
    sectionSync: "همگام‌سازی و پشتیبان ابر",
    sectionPreferences: "ترجیحات",
    rowDataExport: "داده و خروجی",
    rowNotifications: "اعلان‌ها",
    rowHelpSupport: "راهنما و پشتیبانی",
    rowAboutTally: "درباره Tally",
    syncLastSynced: "آخرین همگام‌سازی: {{when}}",
    aboutTitle: "درباره Tally",
    aboutVersion: "نسخه {{version}}",
    aboutTagline: "تقسیم هزینه‌ها با دوستان، نگه‌داری منصفانهٔ مانده‌ها.",
    dataExportTitle: "داده و خروجی",
    dataExportBody: "داده‌های محلی را به‌صورت CSV یا JSON برای پشتیبان‌گیری خروجی بگیرید.",
    dataExportComingSoon: "به‌زودی.",
    avatarA11y: "عکس پروفایل",
    photoMenuTitle: "عکس پروفایل",
    photoChoose: "انتخاب از گالری",
    photoTakePhoto: "گرفتن با دوربین",
    photoRemove: "حذف عکس",
    photoPermissionTitle: "دسترسی به عکس‌ها",
    photoPermissionBody:
      "در تنظیمات دستگاه، دسترسی به گالری را برای انتخاب عکس پروفایل فعال کنید.",
    photoCameraPermissionTitle: "دسترسی به دوربین",
    photoCameraPermissionBody:
      "در تنظیمات دستگاه، دسترسی به دوربین را برای گرفتن عکس پروفایل فعال کنید.",
    photoChangeHint: "روی عکس بزنید تا عوض یا حذف شود.",
    photoTapToAdd: "روی دایره بزنید تا عکس پروفایل اضافه کنید.",
    sectionFeedback: "بازخورد",
    feedbackHint:
      "بازخوردتان را ارسال کنید تا Tally بهتر شود. اگر برنامه کرش کند یا خطایی رخ دهد، گزارش خطای خودکار به‌صورت جداگانه ذخیره می‌شود.",
    feedbackTitleLabel: "عنوان (اختیاری)",
    feedbackTitlePlaceholder: "خلاصه کوتاه",
    feedbackMessageLabel: "پیام",
    feedbackMessagePlaceholder: "چه اتفاقی افتاد؟ چه تغییری لازم است؟",
    feedbackSend: "ارسال بازخورد",
    feedbackSending: "در حال ارسال…",
    feedbackSentTitle: "ممنون!",
    feedbackSentBody: "بازخورد شما روی این دستگاه ذخیره شد.",
    feedbackMissingTitle: "پیام را وارد کنید",
    feedbackMissingBody: "قبل از ارسال، یک پیام کوتاه بنویسید.",
    feedbackFailedTitle: "ارسال نشد",
    feedbackFailedBody: "در ذخیره بازخورد خطایی رخ داد. دوباره تلاش کنید.",
    dangerZone: "بخش خطر",
    deleteAccount: "حذف حساب",
    deleteAccountTitle: "حذف حساب",
    deleteAccountHint:
      "این کار شما را خارج می‌کند و داده‌های محلی را از این دستگاه برای همیشه حذف می‌کند.",
    deleteAccountConfirmBody:
      'برای تأیید، عبارت "DELETE" را وارد کنید. این کار برگشت‌ناپذیر است.',
    deleteAccountTypeToConfirm: 'برای تأیید "DELETE" را بنویسید',
    deleteAccountConfirmCta: "حذف",
    deleteAccountDoneTitle: "حذف شد",
    deleteAccountDoneBody:
      "داده‌های محلی از این دستگاه حذف شد. ممکن است لازم باشد برنامه را دوباره اجرا کنید.",
    clearLocalData: "پاک کردن داده‌های محلی",
    clearLocalDataHint:
      "همهٔ داده‌های ذخیره‌شده روی این دستگاه پاک می‌شود ولی حساب ابری شما دست‌نخورده می‌ماند. با ورود مجدد، گروه‌های همگام‌شده برمی‌گردند.",
    clearLocalDataConfirmTitle: "داده‌های محلی پاک شود؟",
    clearLocalDataConfirmBody:
      "این کار شما را خارج می‌کند، همهٔ گروه‌ها، دوستان و تنظیمات این دستگاه را حذف می‌کند و برنامه را دوباره راه‌اندازی می‌کند. حساب ابری شما تغییر نمی‌کند.",
    clearLocalDataConfirmCta: "پاک‌سازی و راه‌اندازی مجدد",
    restorePromptTitle: "حساب خود را بازیابی کنید؟",
    restorePromptBody:
      "این حساب در تاریخ {{when}} حذف شد. گروه‌ها و تاریخچهٔ مشترک شما هنوز موجود است — با بازیابی، حساب دوباره فعال می‌شود.",
    restorePromptRestore: "بازیابی",
    restorePromptStaySignedOut: "خارج بمان",
    sectionPremium: "پریمیوم",
    premiumTitle: "Tally پریمیوم",
    premiumStatusActive: "فعال — از حمایت شما سپاسگزاریم.",
    premiumStatusInactive: "اشتراک فعال نیست",
    premiumUpgrade: "ارتقا",
    premiumRestore: "بازیابی خریدها",
    premiumBusy: "در حال ارتباط با App Store…",
    premiumErrorTitle: "خرید",
    premiumCloudBlockTitle: "پریمیوم لازم است",
    premiumCloudBlockBody:
      "همگام‌سازی ابری بین دستگاه‌ها با Tally پریمیوم است. اینجا اشتراک بگیرید، دوباره همگام ابری را روشن کنید.",
    premiumSignInFirst: "برای ارتقا ابتدا به حساب ابری وارد شوید.",
  },
  sync: {
    loading: "…",
    localFirst: "اجرا محلی",
    upToDate: "به‌روز",
    lineOnline: "آنلاین",
    lineOffline: "آفلاین (محلی)",
    working: "{{ops}}…",
    statusPending: "همگام ابر دوباره تلاش می‌کند",
    premiumRequired: "برای همگام ابری پریمیوم لازم است",
    verbPull: "دریافت",
    verbPush: "ارسال",
    verbSync: "همگام",
  },
  friends: {
    kicker: "در همه گروه‌ها",
    title: "دوستان",
    sub: "افراد را روی این دستگاه مدیریت کنید و مانده‌های زوجی از هزینه‌های مشترک را ببینید.",
    myFriends: "دوستان من",
    rowMenuA11y: "گزینه‌های بیشتر برای {{name}}",
    inviteTitle: "دعوت دوستان",
    inviteBody: "دوستانتان را به Tally دعوت کنید و هزینه‌ها را به‌سادگی تقسیم کنید.",
    inviteCta: "دعوت دوستان",
    inviteShareMessage: "به من در Tally بپیوند — تقسیم و تسویهٔ هزینه‌ها بسیار ساده.",
    contactEmpty:
      "هنوز کسی ذخیره نشده — برای استفاده در تقسیم هزینه‌ها در گروه، شخص اضافه کنید.",
    searchPlaceholder: "جستجوی دوستان",
    filterAll: "همه",
    filterWithBalance: "دارای مانده",
    filterYouOwe: "شما بدهکارید",
    filterOwesYou: "به شما بدهکارند",
    filterSettled: "تسویه",
    multiCurrencyHint: "{{n}} ارز",
    settledHint: "تسویه",
    addFriend: "افزودن شخص",
    editFriend: "ویرایش",
    deleteFriend: "حذف",
    deleteFriendA11y: "حذف {{name}}",
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
      "«{{name}}» از فهرست دوستان حذف شود؟ نام او در گروه‌ها و هزینه‌های قبلی باقی می‌ماند.",
    empty: "هنوز هزینه مشترکی نیست — در یک گروه افراد اضافه کنید و تقسیم کنید.",
    owesYou: "{{amount}} به شما بدهکار است",
    youOwe: "شما {{amount}} بدهکارید",
    settled: "تسویه شده",
    peopleCount: "{{count}} نفر",
    owesYouLabel: "به شما بدهکار",
    youOweLabel: "شما بدهکارید",
    owesYouInGroup: "در {{group}} به شما بدهکار است",
    youOweInGroup: "در {{group}} بدهکارید",
    owesYouShort: "به شما بدهکار است",
    youOweShort: "بدهکارید",
    allSettled: "همه تسویه",
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
    tabAll: "همه",
    tabExpenses: "هزینه‌ها",
    tabPayments: "پرداخت‌ها",
    tabSettlements: "تسویه‌ها",
    dayToday: "امروز",
    dayYesterday: "دیروز",
    rowYouAdded: "شما هزینه‌ای اضافه کردید",
    rowPersonPaid: "{{name}} {{amount}} پرداخت کرد",
    rowYouPaid: "شما {{amount}} پرداخت کردید",
    rowGroupCreated: "گروه {{name}} ساخته شد",
    rowSettlementSent: "تسویه به {{name}} ارسال شد",
    rowSettlementReceived: "تسویه از {{name}} دریافت شد",
    rowSubGroupTime: "{{group}} · {{time}}",
    relJustNow: "همین حالا",
    relMinutes: "{{n}} دقیقه پیش",
    relHours: "{{n}} ساعت پیش",
    filterA11y: "فیلتر فعالیت",
    searchA11y: "جستجوی فعالیت",
    emptyTitle: "هنوز فعالیتی نیست",
    rowGroupCreatedVerb: "گروه ساخت",
    rowAddedVerb: "اضافه کرد",
    rowInGroup: "در {{group}}",
    rowPaidVerb: "پرداخت کرد",
    rowPaidYouVerb: "به شما پرداخت کرد",
  },
  aiReceipt: {
    premiumPill: "پریمیوم",
    addExpenseTo: "افزودن هزینه به",
    heroTitle: "افزودن با هوش مصنوعی",
    heroSubtitle: "سریع‌تر از تایپ کردن",
    addingToPill: "افزودن به · {{name}}",
    chooseInputMethod: "روش ورودی را انتخاب کنید",
    addWithAi: "افزودن با هوش مصنوعی",
    orDescribe: "یا شرح دهید…",
    orJustTypeIt: "یا فقط تایپ کنید",
    tallyFiguresOut: "Tally می‌فهمد چه کسی پرداخت کرده، چه کسانی در آن هستند و حساب را انجام می‌دهد.",
    analyzeShort: "تحلیل",
    tapToSpeak: "برای گفتن لمس کنید",
    tilePhoto: "عکس",
    tilePhotoSub: "از رسید عکس بگیر",
    tileGallery: "گالری",
    tileGallerySub: "انتخاب از عکس‌ها",
    tileText: "متن",
    tileTextSub: "تایپ جزئیات",
    tileVoice: "صدا",
    tileVoiceSub: "بگویید",
    pageTitle: "هوش مصنوعی",
    title: "اسکن رسید",
    lead: "هر ردیف را به کسی که آن سهم را می‌پردازد بدهید، پرداخت‌کننده را انتخاب کنید، هزینه را ذخیره کنید.",
    unavailableBuild: "اسکن رسید در این نسخه فعال نیست.",
    primaryAddReceipt: "افزودن عکس رسید",
    changeGroup: "عوض کردن گروه",
    groupSummary: "{{name}} · {{currency}}",
    removePhoto: "حذف عکس",
    previewPhoto: "پیش‌نمایش عکس",
    closePreview: "بستن پیش‌نمایش",
    openSettings: "باز کردن تنظیمات",
    reanalyze: "دوباره امتحان کنید",
    takePhoto: "دوربین",
    analyzing: "در حال خواندن رسید…",
    parseFailed: "این رسید خوانده نشد. عکس واضح‌تر امتحان کنید.",
    cameraDenied: "دسترسی به دوربین رد شد.",
    libraryDenied: "دسترسی به گالری خاموش است. در تنظیمات سیستم برای Tally می‌توانید روشن کنید.",
    noBase64: "این تصویر خوانده نشد. عکس دیگری انتخاب کنید.",
    linesHeading: "آیتم‌ها را بکشید و رها کنید",
    removeLine: "حذف آیتم",
    disableLine: "غیرفعال‌سازی آیتم",
    enableLine: "فعال‌سازی آیتم",
    lineLabelPlaceholder: "آیتم",
    payerLabel: "چه کسی پرداخت کرد؟",
    pickMemberTitle: "نسبت به",
    assignedTotal: "جمع تقسیم: {{amount}}",
    sumMismatch:
      "جمع رسید و ردیف‌ها حدوداً {{diff}} فرق دارند. هزینه بر اساس جمع ردیف‌ها ذخیره می‌شود.",
    continueToSplit: "ذخیره هزینه",
    save: "ذخیره",
    saving: "در حال ذخیره…",
    cancel: "انصراف",
    payerBadge: "پرداخت‌کننده",
    includedLabel: "شامل",
    excludedLabel: "حذف",
    dragHint: "نکته: روی یک ردیف طولانی فشار دهید و آن را روی تصویر شخص بیندازید.",
    unassignLineA11y: "برداشتن از «{{name}}»",
    whoPaidAndSplit: "پرداخت‌کننده و تقسیم",
    modeEqual: "مساوی",
    modeExact: "دقیق",
    modePercent: "٪",
    modeShares: "سهم",
    modeAdj: "تنظیم",
    splitMode_equal: "تقسیم مساوی",
    splitMode_exact: "به‌ازای هر آیتم",
    splitMode_percent: "تقسیم به درصد",
    splitMode_shares: "تقسیم به سهم",
    splitMode_adj: "تقسیم تنظیمی",
    tileFooterHintPayer: "روی عکس پروفایل بزنید تا مشخص شود چه کسی پرداخت کرده است.",
    tileFooterHintInclude:
      "روی ردیف تیک زیر نام بزنید تا کسی را از تقسیم حذف یا به آن اضافه کنید.",
    noLines: "ردیفی پیدا نشد. عکس دیگری امتحان کنید.",
    noGroups: "ابتدا در خانه گروه بسازید.",
    goHome: "خانه",
    receiptCurrency: "ارز تشخیص‌داده‌شده {{code}} — مبالغ با ارز گروه است.",
    modelConfidence: "اطمینان: {{level}}",
    defaultDescription: "رسید",
    fallbackTotalLabel: "جمع رسید",
    premiumRequiredTitle: "قابلیت پریمیوم",
    premiumRequiredBody:
      "اسکن رسید با هوش مصنوعی با Tally پریمیوم است. برای اشتراک یا بازیابی خریدها تنظیمات را باز کنید.",
    premiumUpgradeCta: "باز کردن تنظیمات",
    signInRequiredTitle: "برای استفاده از AI وارد شوید",
    signInRequiredBody:
      "اسکن رسید و ثبت هزینه صوتی نیاز به حساب Tally فعال دارد.",
    signInCta: "ورود",
    gateHeroTitle: "هیچ رسیدی را از دست ندهید.",
    gateHeroSubtitle: "امور مالی شما، هر جا که هستید.",
    gateSignInWithEmailLabel: "ورود با ایمیل",
    gateFooter: "*داده‌های شما به‌صورت رمزنگاری‌شده و ابتدا روی این دستگاه ذخیره می‌شوند.",
    emailUnverifiedTitle: "ایمیل خود را تأیید کنید",
    emailUnverifiedBody:
      "لینک تأیید به ایمیل شما ارسال شده است. برای فعال شدن AI و همگام‌سازی ابری، ایمیل را تأیید کنید.",
    voiceStart: "برای ضبط بزنید",
    voiceStopHint: "برای پایان بزنید",
    voiceRecording: "در حال ضبط…",
    voiceProcessingTitle: "در حال پردازش با هوش مصنوعی…",
    voiceProcessingBody: "استخراج جزئیات صورتحساب",
    voiceMicDenied: "دسترسی میکروفون خاموش است. در تنظیمات سیستم روشنش کنید.",
    voiceMicDeniedOpenSettings: "باز کردن تنظیمات",
    voiceFailed: "تبدیل صدا به متن ممکن نشد. واضح‌تر صحبت کنید و دوباره امتحان کنید.",
    voiceNativeUnavailable:
      "ضبط صدا در این بیلد در دسترس نیست. برای فعال‌سازی، اپ را دوباره بیلد کنید.",
    aiErrorGeneric: "مشکلی در هوش مصنوعی پیش آمد. دوباره تلاش کنید.",
    offlineError: "به‌نظر می‌رسد آفلاین هستید. دوباره متصل شوید و تلاش کنید.",
    dndOpen: "تخصیص با کشیدن و رها کردن",
    dndHeader: "اسکن رسید",
    dndCancel: "بازگشت",
    dndDone: "تمام",
    dndTitle: "تخصیص آیتم‌ها",
    dndSubtitle: "آیتم‌ها را روی ظرف افراد بکشید",
    dndUnassignedSection: "آیتم‌های تخصیص‌داده‌نشده",
    dndPeopleSection: "افراد",
    dndAllAssigned: "همه آیتم‌ها تخصیص داده شده‌اند.",
    dndUnassignA11y: "حذف «{{name}}» از این شخص",
    describeHeading: "افزودن هزینه با هوش مصنوعی",
    describeLead:
      "هزینه را بنویسید، روی میکروفون بزنید تا صدایتان ضبط شود، یا عکس رسید را پیوست کنید. متن را ویرایش کنید و دوباره تحلیل بزنید تا به هوش مصنوعی ارسال شود.",
    describePlaceholder:
      "مثلاً: من ۸۰ تومان برای شام دادم و به‌طور مساوی با آبتین و سروناز تقسیم شد. سروناز ۲۰ تومان برای نوشیدنی هر سه‌مان داد.",
    describeAnalyze: "تحلیل",
    describeAnalyzing: "در حال تحلیل…",
    describeEmpty: "برای تحلیل، دست‌کم چند کلمه بنویسید.",
    describeFailed: "هوش مصنوعی متوجه نشد. با جزئیات بیشتری دوباره تلاش کنید.",
    proposedHeading: "هزینه‌های پیشنهادی",
    proposedPaidBy: "پرداخت‌کننده: {{name}}",
    proposedAddAll: "افزودن همه به «{{group}}»",
    proposedAdding: "در حال افزودن…",
    proposedAddFailed: "افزودن این هزینه‌ها ممکن نشد.",
    proposedSplitSummary: "تقسیم بین {{count}}",
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
    snack: "تنقلات",
    drink: "نوشیدنی",
    home: "خانه",
    transport: "حمل‌ونقل",
  },
  groupList: {
    totalBalance: "مانده کل",
    netBalance: "مانده خالص شما",
    acrossGroups: "در {{count}} گروه",
    net: "خالص",
    youAreOwed: "به شما بدهکارند",
    peopleOweYou: "بدهکار به شما",
    rowYouLent: "قرض دادید",
    rowYouOwe: "بدهکارید",
    rowSettled: "تسویه",
    youOwe: "شما بدهکارید",
    createdAt: "ساخته‌شده · {{when}}",
    empty: "هنوز گروهی نیست — برای پیگیری هزینه‌های مشترک یک گروه بسازید.",
    deleteConfirm:
      "«{{name}}» و همه هزینه‌هایش حذف شود؟ این کار برگشت‌ناپذیر است.",
    alertDeleteGroup: "حذف گروه",
    delete: "حذف",
    statusSettled: "در این گروه تسویه‌اید",
    statusYouAreOwed: "{{amount}} به شما بدهکارند",
    statusYouOwe: "شما {{amount}} بدهکارید",
    fabQuickAddExpense: "افزودن سریع هزینه",
    fabMicA11y: "ضبط هزینه با صدا و هوش مصنوعی",
    menuDismiss: "بستن منو",
    menuMoreActions: "اقدام‌های بیشتر برای {{name}}",
    menuTitleFallback: "گروه",
    editGroup: "ویرایش گروه",
    deleteGroup: "حذف گروه",
    deleteGroupA11y: "حذف گروه {{name}}",
    pickSummaryCurrency: "نمایش مانده به",
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
    currencySub: "برای همه هزینه‌های این گروه",
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
    peopleEmptyCta: "نامی بنویسید و Enter بزنید تا اضافه شود",
    peopleInputPlaceholder: "نام را بنویسید یا دوستان را جستجو کنید…",
    noFriendsYet: "هنوز دوستی ذخیره نشده — نامی بالا بنویسید تا اضافه شود.",
    linkedHint: "به دوست موجود پیوند خورده",
    searching: "در حال جستجو…",
    link: "پیوند",
    addFriendNoMatchCta: "بدون تطابق — افزودن شخص جدید",
    suggestedSection: "پیشنهادها",
    inviteByLink: "دعوت با پیوند",
    inviteByLinkSub: "نیازی به حساب کاربری ندارند.",
    addPerson: "+ افزودن شخص",
    saving: "در حال ذخیره…",
    saveGroup: "ذخیره گروه",
    modalCurrency: "ارز",
    done: "تمام",
    searchPlaceholder: "جستجو با کد یا کشور",
    emptySearch: "موردی نیست — عبارت دیگری امتحان کنید.",
    errSave: "گروه ساخته نشد",
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
    time: "ساعت",
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
    loadingExpense: "در حال بارگذاری هزینه…",
    needDescription: "یک توضیح اضافه کنید",
    needAmount: "مبلغ را وارد کنید",
    needSomeoneToSplit: "یک نفر برای تقسیم اضافه کنید",
    sharePromptTitle: "این را برای هم‌خرج‌ها بفرستید",
    shareNow: "اشتراک‌گذاری",
    addAnother: "افزودن دیگر",
    doneSharing: "تمام",
    shareMessageBody: "{{description}} — {{amount}}",
    savedToast: "ذخیره شد",
    chipsTitle: "این هزینه با کیه؟",
    chipsAddPerson: "افزودن",
    chipsYouLabel: "شما",
    advancedSplitToggle: "گزینه‌های پیشرفته تقسیم",
    advancedSplitHint: "مبلغ دقیق، درصد، سهم، تعدیل",
    paidByYou: "شما پرداخت کردید",
    paidByName: "{{name}} پرداخت کرده",
    changePayer: "تغییر",
    payerPickerTitle: "کی پرداخت کرده؟",
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
    addPersonA11y: "افزودن شخص به این گروه",
    addPersonTitle: "افزودن شخص",
    addPersonNamePlaceholder: "نام را وارد کنید",
    title: "افزودن هزینه",
    amountLabel: "مبلغ",
    fieldDescriptionLabel: "این برای چه بود؟",
    splitEqualEach: "هرکدام {{each}} · {{count}} نفر",
    splitMethod: "روش تقسیم",
    whoIsIn: "چه‌کسانی هستند؟",
    exactAmounts: "مبالغ دقیق",
    percentages: "درصدها",
    sharesSection: "سهم‌ها",
    adjustments: "تعدیل‌ها",
    notIncluded: "شامل نیست",
    sharesUnit: "سهم",
    adjustZero: "بدون تعدیل",
    decrementShare: "کاهش سهم",
    incrementShare: "افزایش سهم",
    totalLabel: "جمع",
    totalSharesLabel: "جمع سهم‌ها",
    sharesSummaryLine: "{{count}} / هر سهم = {{amount}}",
    equalSummaryIncluded: "{{count}} از {{total}} شامل",
    equalSummaryEach: "{{amount}} برای هر نفر",
    summaryBalanced: "متوازن",
    summaryPercentOver: "{{percent}}٪ بیشتر",
    summaryPercentUnder: "{{percent}}٪ کمتر",
    summaryAdjustOver: "{{amount}} بیشتر",
    summaryAdjustUnder: "{{amount}} کمتر",
  },
  groupDetail: {
    titleFallback: "گروه",
    a11ySettings: "تنظیمات گروه",
    a11yMembers: "مدیریت اعضا",
    tabExpenses: "هزینه‌ها",
    tabBalances: "مانده‌ها",
    tabTotals: "جمع‌ها",
    groupTotal: "جمع گروه: ",
    expensesCount: "{{count}} هزینه",
    yourBalance: "مانده شما: ",
    summaryTheyOweYou: "بقیه به شما بدهکارند",
    summaryYouOwe: "شما بدهکارید",
    summaryAllSettled: "همه تسویه",
    balances: "مانده‌ها",
    suggestedSettlements: "تسویه‌های پیشنهادی",
    suggestedSettlementsSub: "کمترین پرداخت برای تسویه همه.",
    transactionsTitle: "چه کسی به کی پول می‌دهد",
    transactionsSub: "همه مستقیما به یکدیگر پرداخت می‌کنند.",
    settlementLine: "{{from}} باید به {{to}} {{amount}} بپردازد",
    remind: "یادآوری",
    shareSettlementsA11y: "اشتراک‌گذاری پرداخت‌های پیشنهادی",
    shareSettlementsIntro: "{{group}} — پرداخت‌های پیشنهادی برای تسویه:",
    shareSettlementsFooter: "لطفاً در اولین فرصت تسویه کنید.",
    settlementExportColFrom: "پرداخت می‌کند",
    settlementExportColTo: "به",
    settlementExportColAmount: "مبلغ",
    allSettledNoPayments: "پرداختی لازم نیست — همه تسویه‌اند.",
    everyone: "همه",
    showNetBalances: "نمایش مانده هر نفر",
    hideNetBalances: "پنهان کردن",
    balancesSettlementSummary: "{{count}} انتقال · جمع جابه‌جایی {{amount}}",
    simplifyBenefitOneLiner: "پرداخت‌های کمتر، همان مانده‌ها.",
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
    deleteExpenseA11y: "حذف {{description}}",
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
    inviteByEmail: "دعوت با ایمیل",
    inviteHint:
      "اگر ایمیل بگذارید، برای آن آدرس دعوت ساخته می‌شود. برای رسیدن به طرف مقابل، همگام ابر را در تنظیمات روشن کنید.",
    inviteRoleCooperate: "همکاری",
    inviteRoleWatch: "فقط مشاهده",
    inviteEmailPlaceholder: "friend@example.com",
    inviteFailedTitle: "دعوت ساخته نشد",
  },
  groupShare: {
    headerTitle: "اشتراک‌گذاری",
    title: "دعوت دوستان",
    subtitle: "این کد QR را به اشتراک بگذارید تا همه بتوانند بپیوندند",
    copyLink: "کپی لینک",
    copyShareLink: "کپی لینک اشتراک",
    copied: "لینک کپی شد",
    continueWithoutSharing: "ادامه بدون اشتراک‌گذاری",
    peopleJoined: "افراد پیوسته",
    peopleJoinedCount: "{{count}} نفر پیوسته‌اند",
    noOneJoinedYet: "هنوز کسی نپیوسته است.",
    footerHint: "هر کسی که این کد را داشته باشد می‌تواند به «{{name}}» بپیوندد.",
    openCta: "اشتراک با QR",
  },
  inviteAccepted: {
    title: "خوش آمدید!",
    youJoined: "شما به این گروه پیوستید",
    viewGroup: "ورود به گروه",
    bodyLine: "به یک گروه پیوستید. از قبض بعدی، تقسیم را شروع کنید.",
    memberCount: "{{count}} نفر",
    viewAll: "نمایش همه گروه‌ها",
    closeA11y: "بستن",
  },
  tour: {
    skipBtn: "رد کردن",
    backBtn: "بازگشت",
    nextBtn: "بعدی",
    doneBtn: "پایان",
    fab: {
      title: "افزودن هزینه به‌سرعت",
      body: "+ را بزن تا هزینه اضافه کنی، یا میکروفون را نگه دار تا با صدا ضبط کنی.",
    },
    ai: {
      title: "اسکن رسید",
      body: "هوش مصنوعی رسید را می‌خواند و آیتم‌ها را بین گروه تقسیم می‌کند.",
    },
    qr: {
      title: "پیوستن با QR",
      body: "کد دعوت دوستت را اسکن کن تا به گروهش بپیوندی.",
    },
  },
  settings: {
    title: "تنظیمات",
    preferencesSection: "ترجیحات",
  },
  qrScan: {
    title: "اسکن کد QR",
    cancel: "لغو",
    scanning: "در حال اسکن…",
    holdSteady: "ثابت نگه دارید",
    tryAgain: "تلاش دوباره",
    permissionTitle: "نیاز به دسترسی دوربین",
    permissionBody:
      "Tally برای اسکن کد QR دعوت گروه به دوربین نیاز دارد.",
    permissionGrant: "اعطای دسترسی",
    openSettings: "باز کردن تنظیمات",
    unrecognizedTitle: "کد QR شناسایی نشد",
    unrecognizedBody: "این کد QR شبیه لینک دعوت Tally نیست.",
    expenseNotFoundTitle: "هزینه در دسترس نیست",
    expenseNotFoundBody:
      "این هزینه در این دستگاه یافت نشد. از میزبان بخواهید ابتدا دعوت گروه را به اشتراک بگذارد.",
    pointAtCode: "دوربین را روی کد QR Tally نگه دارید",
    pasteLinkTitle: "یا یک لینک پیست کنید",
    pasteLinkBody: "tally.cc/g/…",
    joiningCaption: "در حال پیوستن…",
    pasteLinkCta: "به‌جای آن لینک پیست کنید",
  },
  joinQr: {
    title: "اشتراک با QR",
    copyLink: "کپی لینک",
    expenseSubtitle:
      "هر کسی این کد را اسکن کند به این هزینه می‌پیوندد — اگر برنامه نصب باشد باز می‌شود وگرنه نسخه وب.",
    groupSubtitle:
      "هر کسی این کد را اسکن کند به گروه می‌پیوندد — اگر برنامه نصب باشد باز می‌شود وگرنه نسخه وب.",
    openButton: "نمایش کد QR پیوستن",
    closeButton: "بستن",
    sheetTitle: "دعوت به {{name}}",
    sheetSubtitle: "اسکن کنید، بزنید یا اشتراک بگذارید — نیاز به حساب ندارند.",
    shareTile: "اشتراک",
    whatsappTile: "واتس‌اپ",
    emailTile: "ایمیل",
  },
  notifications: {
    title: "اعلان‌ها",
    markAllRead: "همه خوانده شد",
    markRead: "خوانده شد",
    archive: "بایگانی",
    emptyTitle: "هنوز اعلانی نیست",
    emptyBody: "هر اتفاقی در گروه‌هایتان بیفتد اینجا نمایش داده می‌شود.",
    section_action_required: "نیازمند اقدام",
    section_money_updates: "به‌روزرسانی مالی",
    section_activity: "فعالیت",
    section_system: "قبلی",
    seeAll: "مشاهده همه اعلان‌ها",
    bucketToday: "امروز",
    bucketYesterday: "دیروز",
    bucketEarlier: "پیش‌تر",
    unreadCount: "{{count}} اعلان خوانده‌نشده دارید",
    moreA11y: "گزینه‌های بیشتر",
    accept: "پذیرفتن",
    decline: "رد کردن",
  },
  premium: {
    gateTitle: "ارتقا برای فعال‌سازی",
    gateBody:
      "Plus ابزارهای راحتی را باز می‌کند — استفادهٔ رایگان از Tally بدون محدودیت زمانی ادامه دارد.",
    gateCta: "مشاهده پلن‌ها",
    gateBusy: "لطفاً صبر کنید…",
    gateSubscribeWebCta: "اشتراک آنلاین",
    gateAiTitle: "عکس بگیرید. تقسیم خودکار.",
    gateAiBody:
      "از هر رسیدی عکس بگیرید و Tally آیتم‌ها را بین افراد تقسیم می‌کند — بدون ورود دستی.",
    gateSyncTitle: "همگام در همه دستگاه‌ها",
    gateSyncBody:
      "از هر گوشی یا کامپیوتری ادامه دهید. Plus سفرها را همیشه همگام نگه می‌دارد.",
  },
  plans: {
    title: "پاس‌های Tally",
    subtitle: "ابزارهای پریمیوم به‌صورت مقطعی. یک‌بار پرداخت کنید، تا پایان مدت استفاده کنید.",
    freeName: "رایگان",
    freePrice: "۰ دلار",
    freeTagline: "ثبت هزینه‌های مشترک روی همین دستگاه.",
    freeFeature1: "گروه‌ها و هزینه‌های نامحدود",
    freeFeature2: "تقسیم مساوی و موجودی زنده",
    freeFeature3: "روی همین گوشی می‌ماند — چیزی آپلود نمی‌شود",
    passFeature1: "از رسید عکس بگیرید — تقسیم‌ها خودکار انجام می‌شوند",
    passFeature2: "تقسیم پیشرفته: سهم، درصد، مبلغ دقیق",
    passFeature3: "پیشنهادهای هوشمند برای تسویه",
    passFeature4: "همگام‌سازی ابری بین همهٔ دستگاه‌ها",
    nightName: "پاس شب",
    nightDuration: "۲۴ ساعت",
    nightPrice: "۱٫۹۹ دلار",
    nightExtendPrice: "۰٫۹۹ دلار",
    nightTagline:
      "شام، نوشیدنی، تاکسی برگشت — همه را در چند ثانیه تقسیم کنید.",
    tripName: "پاس سفر",
    tripBadge: "محبوب‌ترین",
    tripDuration: "۷ روز",
    tripPrice: "۵٫۹۹ دلار",
    tripExtendPrice: "۲٫۹۹ دلار",
    tripTagline:
      "در سفر هستید؟ ابزارهای پریمیوم برای یک هفته — بدون اشتراک.",
    explorerName: "پاس اکسپلورر",
    explorerDuration: "۳۰ روز",
    explorerPrice: "۱۴٫۹۹ دلار",
    explorerExtendPrice: "۷٫۹۹ دلار",
    explorerTagline:
      "همیشه در حال تقسیم هزینه‌اید؟ یک ماه پریمیوم بدون پرداخت خودکار.",
    ctaBuy: "خرید پاس",
    ctaExtend: "تمدید پاس",
    ctaActive: "پاس فعال است",
    activeStatusActive: "فعال",
    activeStatusExtended: "تمدیدشده",
    activeStatusEnded: "پایان یافته",
    remainingDaysHours: "{{d}} روز و {{h}} ساعت باقی مانده",
    remainingHoursMinutes: "{{h}} ساعت و {{m}} دقیقه باقی مانده",
    remainingMinutes: "{{m}} دقیقه باقی مانده",
    remainingExpired: "همین الان به پایان رسید",
    restoreCta: "بازیابی خریدها",
    legalFinePrint:
      "خریدهای یک‌باره. Tally هرگز به‌صورت خودکار از شما مبلغی برداشت نمی‌کند — هر زمان بخواهید پاس را تمدید یا یک پاس جدید بخرید.",
    webFallbackHint: "خرید درون‌برنامه‌ای روی این نسخه فعال نیست.",
    webFallbackCta: "خرید در وب",
    iapErrorTitle: "خرید انجام نشد",
    iapErrorBody:
      "نتوانستیم خرید را تکمیل کنیم. لطفاً دوباره تلاش کنید یا خرید قبلی را بازیابی نمایید.",
  },
  onboarding: {
    next: "بعدی",
    page1Title: "به Tally خوش آمدید",
    page1Body:
      "هزینه‌های مشترک با دوستان، هم‌خانه‌ای‌ها یا هم‌سفران را ثبت کنید و بدون دردسر تسویه کنید.",
    page2Title: "هزینه‌ها را سریع ثبت کنید",
    page2Body:
      "مبلغ، پرداخت‌کننده و اعضا را وارد کنید؛ Tally سهم هرکس را خودکار محاسبه می‌کند.",
    page3Title: "بدهی‌ها ساده می‌شوند",
    page3Body:
      "Tally بدهی‌های زنجیره‌ای را ادغام می‌کند تا همه با کمترین پرداخت تسویه کنند.",
    page4Title: "شروع کنیم",
    page4Body:
      "از Tally فقط روی این دستگاه استفاده کنید، یا وارد شوید تا داده‌هایتان بین دستگاه‌ها همگام باشد.",
    intentTitle: "به Tally خوش آمدید",
    welcomeHeadlineLead: "صورتحساب را تقسیم کن، نه",
    welcomeHeadlineAccent: "دوستی را",
    intentBody:
      "هزینه‌های مشترک را با هر کسی پیگیری کنید — سفر، هم‌خانه‌ای، قرار. Tally حساب می‌کند، هوش مصنوعی رسید را می‌خواند.",
    featureAiTitle: "اسکن رسید با AI",
    featureAiBody: "عکس بگیر، آیتم‌ها خودکار تقسیم می‌شوند",
    featureSimplifyTitle: "بدهی‌ها را ساده کن",
    featureSimplifyBody: "پرداخت‌های کمتر، با همان مبلغ خالص",
    featureSyncTitle: "همگام‌سازی همه‌جا",
    featureSyncBody: "محلی، بکاپ ابری، بدون نیاز به ورود",
    welcomeFooter: "نیازی به حساب نیست. همگام‌سازی ابری را بعداً اضافه کنید.",
    welcomeCta: "شروع کنید",
    namePlaceholder: "نام شما",
    primaryCta: "اولین هزینه را اضافه کنید",
    defaultGroupName: "گروه جدید",
    signInLink: "حساب دارید؟ وارد شوید",
    useLocally: "استفاده محلی",
    authCta: "ورود یا ایجاد حساب",
    confirmEmailTitle: "ایمیل خود را تأیید کنید",
    confirmEmailBody:
      "لینک تأیید به {{email}} ارسال شد. برای فعال شدن همگام‌سازی ابری و AI روی آن کلیک کنید.",
    confirmEmailHint:
      "بدون تأیید هم می‌توانید فقط روی این دستگاه از Tally استفاده کنید — روی «استفاده محلی» بزنید.",
    confirmEmailResendCta: "ارسال دوباره ایمیل",
    confirmEmailResending: "در حال ارسال…",
    confirmEmailResendSent: "✓ ایمیل ارسال شد — صندوق ورودی را بررسی کنید",
    confirmEmailEditCta: "استفاده از ایمیل دیگر",
    confirmEmailContinueCta: "تأیید کرده‌ام — ادامه",
    confirmEmailContinueBusy: "در حال بررسی…",
    confirmEmailContinueFailed: "هنوز تأیید نشده — دوباره امتحان کنید",
  },
};

export const es: MessageTree = {
  startup: {
    appName: "Tally",
    slogan: "Gastos compartidos, al día. Saldad rápido.",
  },
  tabs: {
    Groups: { label: "Inicio", hint: "Grupos compartidos" },
    Friends: { label: "Amigos", hint: "Saldos 1:1" },
    Activity: { label: "Actividad", hint: "Historial (pronto)" },
    AiReceipt: { label: "IA", hint: "Escanear ticket (premium)" },
    Settings: { label: "Ajustes", hint: "Preferencias de la app" },
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
    email: "Correo",
    emailOptional: "Correo (opcional)",
    emailPlaceholder: "tu@ejemplo.com",
    invalidEmailTitle: "Correo no válido",
    invalidEmail: "Introduce un correo válido o deja el campo vacío.",
    statNet: "Neto",
    statGroups: "Grupos",
    statFriends: "Amigos",
    saving: "Guardando…",
    saveProfile: "Guardar perfil",
    defaultCurrency: "Moneda predeterminada",
    appearance: "Tema",
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
    exportFailedTitle: "No se pudo exportar",
    exportFailedBody: "Algo salió mal al crear el archivo. Inténtalo de nuevo.",
    authTitle: "Tally",
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
    authAccountChangeTitle: "¿Iniciar sesión con otra cuenta?",
    authAccountChangeBody:
      "Este dispositivo está vinculado a {{previous}}. Si continúas, se iniciará sesión como {{next}}.",
    authAccountChangeContinue: "Continuar",
    gateOverlayPro: "Pro",
    gateOverlaySignInTitle: "Inicia sesión para la nube",
    gateOverlaySignInBody:
      "La sincronización y copias de seguridad en la nube requieren una cuenta Tally iniciada.",
    gateOverlaySignInCta: "Iniciar con Tally",
    gateOverlayNoAccount: "¿No tienes cuenta?",
    gateOverlayLearnMore: "Más",
    authErrorTitle: "No se pudo iniciar sesión",
    authPasswordTooShort: "Usa al menos 6 caracteres en la contraseña.",
    authWrongPasswordTitle: "Contraseña incorrecta",
    authWrongPasswordBody:
      "Este correo ya tiene cuenta en Tally, pero la contraseña no es correcta. Inténtalo de nuevo o pulsa «¿Olvidaste la contraseña?».",
    authHeroTitle: "No vuelvas a perder un recibo.",
    authHeroSubtitle: "Tus finanzas, donde estés.",
    cloudFooter: "*Tus datos están cifrados y son locales por defecto.",
    cloudGoCta: "Activar nube",
    aiGoCta: "Activar Pro",
    cloudSignInWithEmail: "Inicia sesión con email",
    authContinue: "Continuar",
    authContinueBusy: "Procesando…",
    authWelcomeBackTitle: "Bienvenido de nuevo",
    authWelcomeBackSubtitle: "Inicia sesión para sincronizar entre dispositivos.",
    authCreateAccountTitle: "Crea tu cuenta",
    authCreateAccountSubtitle:
      "Sincroniza tus gastos en todos lados — gratis, sin tarjeta.",
    authModeSignIn: "Iniciar sesión",
    authModeCreate: "Crear cuenta",
    authUseLocallyLink: "Usar local sin cuenta",
    authContinueWithGoogle: "Continuar con Google",
    authGoogleBusy: "Abriendo Google…",
    authGoogleProviderDisabledTitle: "Inicio con Google no disponible",
    authGoogleProviderDisabledBody: "El inicio de sesión con Google no está habilitado en esta versión. Inicia sesión con email y contraseña.",
    authContinueWithApple: "Continuar con Apple",
    authAppleBusy: "Abriendo Apple…",
    authAppleProviderDisabledTitle: "Inicio con Apple no disponible",
    authAppleProviderDisabledBody: "El inicio de sesión con Apple no está habilitado en esta versión. Inicia sesión con email y contraseña.",
    authOrDivider: "o",
    authWelcomeNewAccount:
      "¡Bienvenido a Tally! Te enviamos un enlace de confirmación — ábrelo para terminar de iniciar sesión.",
    authForgotPassword: "¿Olvidaste la contraseña?",
    authForgotPasswordNoEmail: "Introduce primero tu correo en la sección Cuenta.",
    authForgotPasswordBusy: "Enviando enlace de recuperación…",
    authForgotPasswordSentTitle: "Enlace enviado",
    authForgotPasswordSentBody:
      "Revisa tu bandeja de entrada para restablecer la contraseña, luego vuelve e inicia sesión.",
    authForgotPasswordFailedTitle: "No se pudo enviar el correo",
    authOfflineTitle: "Sin conexión",
    authOfflineBody:
      "No hay conexión a Internet. Conéctate a Wi-Fi o a datos móviles y vuelve a intentarlo.",
    authEmailVerified: "Verificado",
    authEmailUnverified: "Sin verificar",
    authEmailNotConfirmedTitle: "Confirma tu correo",
    authEmailNotConfirmedBody:
      "Te enviamos un enlace de confirmación. Haz clic en él y vuelve a iniciar sesión.",
    authResendConfirmation: "Reenviar correo",
    authResendConfirmationSentTitle: "Correo reenviado",
    authResendConfirmationSentBody:
      "Revisa tu bandeja de entrada (y la carpeta de spam) para el nuevo enlace.",
    cancel: "Cancelar",
    syncStatusOn: "Sync activado",
    syncStatusOff: "Sync desactivado",
    syncStatusLocalOnly: "Solo local",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
    cloudAuthentication: "Autenticación en la nube",
    cloudAuthenticationHint: "Inicia sesión o crea una cuenta en la nube para habilitar la sincronización.",
    sectionAccountSync: "Cuenta y sincronización",
    sectionAccount: "Cuenta",
    sectionSync: "Sync en la nube y copia",
    sectionPreferences: "Preferencias",
    rowDataExport: "Datos y exportación",
    rowNotifications: "Notificaciones",
    rowHelpSupport: "Ayuda y soporte",
    rowAboutTally: "Acerca de Tally",
    syncLastSynced: "Última sincronización: {{when}}",
    aboutTitle: "Acerca de Tally",
    aboutVersion: "Versión {{version}}",
    aboutTagline: "Divide gastos con amigos, mantén los saldos justos.",
    dataExportTitle: "Datos y exportación",
    dataExportBody: "Exporta tus datos locales en CSV o JSON para archivado y copias.",
    dataExportComingSoon: "Próximamente.",
    avatarA11y: "Foto de perfil",
    photoMenuTitle: "Foto de perfil",
    photoChoose: "Elegir de la galería",
    photoTakePhoto: "Hacer foto",
    photoRemove: "Quitar foto",
    photoPermissionTitle: "Se necesita acceso a fotos",
    photoPermissionBody:
      "Permite el acceso a la galería en los ajustes del dispositivo para poner una foto de perfil.",
    photoCameraPermissionTitle: "Se necesita acceso a la cámara",
    photoCameraPermissionBody:
      "Permite el acceso a la cámara en los ajustes del dispositivo para hacer una foto de perfil.",
    photoChangeHint: "Toca la foto para cambiarla o quitarla.",
    photoTapToAdd: "Toca el círculo para añadir una foto de perfil.",
    sectionFeedback: "Comentarios",
    feedbackHint:
      "Envía comentarios para ayudar a mejorar Tally. Si la app se cierra o encuentra un error, también guardará un reporte automático por separado.",
    feedbackTitleLabel: "Título (opcional)",
    feedbackTitlePlaceholder: "Resumen corto",
    feedbackMessageLabel: "Mensaje",
    feedbackMessagePlaceholder: "¿Qué pasó? ¿Qué deberíamos cambiar?",
    feedbackSend: "Enviar comentarios",
    feedbackSending: "Enviando…",
    feedbackSentTitle: "¡Gracias!",
    feedbackSentBody: "Tus comentarios se guardaron en este dispositivo.",
    feedbackMissingTitle: "Añade un mensaje",
    feedbackMissingBody: "Escribe un mensaje breve antes de enviar.",
    feedbackFailedTitle: "No se pudo enviar",
    feedbackFailedBody:
      "Algo salió mal al guardar tus comentarios. Inténtalo de nuevo.",
    dangerZone: "Zona de riesgo",
    deleteAccount: "Eliminar cuenta",
    deleteAccountTitle: "Eliminar cuenta",
    deleteAccountHint:
      "Esto cerrará tu sesión y eliminará permanentemente los datos locales de este dispositivo.",
    deleteAccountConfirmBody:
      'Para confirmar, escribe "DELETE". No se puede deshacer en este dispositivo.',
    deleteAccountTypeToConfirm: 'Escribe "DELETE" para confirmar',
    deleteAccountConfirmCta: "Eliminar ahora",
    deleteAccountDoneTitle: "Eliminado",
    deleteAccountDoneBody:
      "Los datos locales se han eliminado de este dispositivo. Puede que tengas que reiniciar la app.",
    clearLocalData: "Borrar datos locales",
    clearLocalDataHint:
      "Borra todo lo guardado en este dispositivo manteniendo intacta tu cuenta en la nube. Al iniciar sesión de nuevo, tus grupos sincronizados volverán.",
    clearLocalDataConfirmTitle: "¿Borrar los datos locales?",
    clearLocalDataConfirmBody:
      "Esto cerrará tu sesión, eliminará grupos, amigos y ajustes de este dispositivo y reiniciará la app. Tu cuenta en la nube no se verá afectada.",
    clearLocalDataConfirmCta: "Borrar y reiniciar",
    restorePromptTitle: "¿Restaurar tu cuenta?",
    restorePromptBody:
      "Eliminaste esta cuenta el {{when}}. Tus grupos compartidos e historial siguen aquí — al restaurar reactivarás la cuenta.",
    restorePromptRestore: "Restaurar",
    restorePromptStaySignedOut: "Mantener sesión cerrada",
    sectionPremium: "Premium",
    premiumTitle: "Tally Premium",
    premiumStatusActive: "Activo — gracias por apoyar Tally.",
    premiumStatusInactive: "Sin suscripción",
    premiumUpgrade: "Mejorar",
    premiumRestore: "Restaurar compras",
    premiumBusy: "Contactando con App Store…",
    premiumErrorTitle: "Compra",
    premiumCloudBlockTitle: "Se requiere Premium",
    premiumCloudBlockBody:
      "La sincronización en la nube entre dispositivos va con Tally Premium. Suscríbete aquí y vuelve a activar la sincronización.",
    premiumSignInFirst: "Inicia sesión en una cuenta en la nube antes de mejorar.",
  },
  sync: {
    loading: "…",
    localFirst: "En local",
    upToDate: "Al día",
    lineOnline: "En línea",
    lineOffline: "Fuera de línea (local)",
    working: "{{ops}}…",
    statusPending: "Se volverá a intentar el sync con la nube",
    premiumRequired: "Premium necesario para el sync",
    verbPull: "descarga",
    verbPush: "subida",
    verbSync: "sincronización",
  },
  friends: {
    kicker: "Entre grupos",
    title: "Amigos",
    sub: "Gestiona personas en este dispositivo y ve saldos de gastos compartidos.",
    myFriends: "Mis amigos",
    rowMenuA11y: "Más opciones para {{name}}",
    inviteTitle: "Invitar amigos",
    inviteBody: "Invita a tus amigos a Tally y divide los gastos fácilmente.",
    inviteCta: "Invitar amigos",
    inviteShareMessage: "Únete a mí en Tally — divide y salda gastos fácilmente.",
    contactEmpty:
      "Aún no hay personas guardadas. Añade alguien para reutilizarlo al dividir gastos.",
    searchPlaceholder: "Buscar amigos",
    filterAll: "Todos",
    filterWithBalance: "Con saldo",
    filterYouOwe: "Debes",
    filterOwesYou: "Te deben",
    filterSettled: "Saldo cero",
    multiCurrencyHint: "{{n}} monedas",
    settledHint: "Saldo cero",
    addFriend: "Añadir persona",
    editFriend: "Editar",
    deleteFriend: "Eliminar",
    deleteFriendA11y: "Eliminar a {{name}}",
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
      "¿Quitar a {{name}} de tu lista de amigos? Su nombre seguirá en grupos y gastos anteriores.",
    empty: "Aún no hay gastos compartidos — añade personas en un grupo y divide.",
    owesYou: "te debe {{amount}}",
    youOwe: "debes {{amount}}",
    settled: "saldo cero",
    peopleCount: "{{count}} personas",
    owesYouLabel: "TE DEBE",
    youOweLabel: "DEBES",
    owesYouInGroup: "te debe en {{group}}",
    youOweInGroup: "debes en {{group}}",
    owesYouShort: "te debe",
    youOweShort: "debes",
    allSettled: "Todo saldado",
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
    tabAll: "Todo",
    tabExpenses: "Gastos",
    tabPayments: "Pagos",
    tabSettlements: "Liquidaciones",
    dayToday: "Hoy",
    dayYesterday: "Ayer",
    rowYouAdded: "Añadiste un gasto",
    rowPersonPaid: "{{name}} pagó {{amount}}",
    rowYouPaid: "Pagaste {{amount}}",
    rowGroupCreated: "Grupo {{name}} creado",
    rowSettlementSent: "Liquidación enviada a {{name}}",
    rowSettlementReceived: "Liquidación recibida de {{name}}",
    rowSubGroupTime: "{{group}} · {{time}}",
    relJustNow: "Ahora",
    relMinutes: "Hace {{n}} min",
    relHours: "Hace {{n}} h",
    filterA11y: "Filtrar actividad",
    searchA11y: "Buscar actividad",
    emptyTitle: "Sin actividad aún",
    rowGroupCreatedVerb: "creó el grupo",
    rowAddedVerb: "añadió",
    rowInGroup: "en {{group}}",
    rowPaidVerb: "pagó",
    rowPaidYouVerb: "te pagó",
  },
  aiReceipt: {
    premiumPill: "Premium",
    pageTitle: "Inteligencia Artificial",
    title: "Escanear ticket",
    addExpenseTo: "Añadir gasto a",
    heroTitle: "Añadir con IA",
    heroSubtitle: "Más rápido que escribirlo",
    addingToPill: "Añadiendo a · {{name}}",
    chooseInputMethod: "Elige el método de entrada",
    addWithAi: "Añadir con IA",
    orDescribe: "O descríbelo…",
    orJustTypeIt: "O simplemente escríbelo",
    tallyFiguresOut: "Tally calcula quién pagó, quién participa y la matemática.",
    analyzeShort: "Analizar",
    tapToSpeak: "Pulsa para hablar",
    tilePhoto: "Foto",
    tilePhotoSub: "Toma el ticket",
    tileGallery: "Galería",
    tileGallerySub: "Elige una foto",
    tileText: "Texto",
    tileTextSub: "Escribir detalles",
    tileVoice: "Voz",
    tileVoiceSub: "Habla",
    lead: "Asigna cada línea a quien la paga, elige quién pagó y guarda el gasto.",
    unavailableBuild: "El escaneo de tickets no está disponible en esta versión.",
    primaryAddReceipt: "Añadir foto del ticket",
    changeGroup: "Cambiar grupo",
    groupSummary: "{{name}} · {{currency}}",
    removePhoto: "Quitar foto",
    previewPhoto: "Vista previa de la foto",
    closePreview: "Cerrar vista previa",
    openSettings: "Abrir ajustes",
    reanalyze: "Reintentar",
    takePhoto: "Cámara",
    analyzing: "Leyendo ticket…",
    parseFailed: "No se pudo leer el ticket. Prueba una foto más nítida.",
    cameraDenied: "Se denegó el acceso a la cámara.",
    libraryDenied: "El acceso a fotos está desactivado. Actívalo en los ajustes del sistema para Tally.",
    noBase64: "No se pudo leer esta imagen. Prueba otra.",
    linesHeading: "Arrastra y suelta los ítems",
    removeLine: "Quitar ítem",
    disableLine: "Desactivar ítem",
    enableLine: "Activar ítem",
    lineLabelPlaceholder: "Ítem",
    payerLabel: "¿Quién pagó?",
    pickMemberTitle: "Asignar a",
    assignedTotal: "Total asignado: {{amount}}",
    sumMismatch:
      "El total del ticket y las líneas difieren unos {{diff}}. El gasto usará la suma de las líneas.",
    continueToSplit: "Guardar gasto",
    save: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    payerBadge: "Pagó",
    includedLabel: "Incluido",
    excludedLabel: "Fuera",
    dragHint: "Consejo: mantén presionada una línea y arrástrala sobre el tile de una persona.",
    unassignLineA11y: "Desasignar de {{name}}",
    whoPaidAndSplit: "Quién pagó y cómo se divide",
    modeEqual: "Igual",
    modeExact: "Exacto",
    modePercent: "%",
    modeShares: "Partes",
    modeAdj: "Ajuste",
    splitMode_equal: "Dividir por igual",
    splitMode_exact: "Dividir por artículo",
    splitMode_percent: "Dividir por porcentaje",
    splitMode_shares: "Dividir por partes",
    splitMode_adj: "División ajustada",
    tileFooterHintPayer: "Toca una foto de perfil para elegir quién pagó.",
    tileFooterHintInclude:
      "Toca la fila con la marca debajo de un nombre para incluir o excluir a alguien del reparto.",
    noLines: "No hay líneas. Prueba otra foto.",
    noGroups: "Crea primero un grupo en Inicio.",
    goHome: "Inicio",
    receiptCurrency: "Moneda detectada {{code}} — los importes usan la moneda del grupo.",
    modelConfidence: "Confianza: {{level}}",
    defaultDescription: "Ticket",
    fallbackTotalLabel: "Total del ticket",
    premiumRequiredTitle: "Función Premium",
    premiumRequiredBody:
      "El escaneo de tickets con IA va con Tally Premium. Abre Ajustes para suscribirte o restaurar compras.",
    premiumUpgradeCta: "Abrir ajustes",
    signInRequiredTitle: "Inicia sesión para usar la IA",
    signInRequiredBody:
      "El escaneo de tickets y el registro por voz requieren una cuenta Tally iniciada.",
    signInCta: "Iniciar sesión",
    gateHeroTitle: "Nunca pierdas otro ticket.",
    gateHeroSubtitle: "Tus finanzas, dondequiera que estés.",
    gateSignInWithEmailLabel: "Inicia sesión con correo",
    gateFooter: "*Tus datos están cifrados y se guardan primero localmente.",
    emailUnverifiedTitle: "Confirma tu correo",
    emailUnverifiedBody:
      "Te enviamos un enlace de confirmación. Verifica tu correo para desbloquear la IA y la sincronización.",
    voiceStart: "Toca para grabar",
    voiceStopHint: "Toca para detener",
    voiceRecording: "Grabando…",
    voiceProcessingTitle: "Procesando con IA…",
    voiceProcessingBody: "Extrayendo los detalles de la cuenta",
    voiceMicDenied: "El acceso al micrófono está desactivado. Actívalo en los ajustes del sistema.",
    voiceMicDeniedOpenSettings: "Abrir ajustes",
    voiceFailed: "No se pudo transcribir la grabación. Intenta hablar con más claridad.",
    voiceNativeUnavailable:
      "La grabación de voz no está disponible en esta compilación. Recompila la app para habilitarla.",
    aiErrorGeneric: "Algo salió mal con la IA. Inténtalo de nuevo.",
    offlineError: "Parece que estás sin conexión. Reconéctate e inténtalo de nuevo.",
    dndOpen: "Arrastrar y soltar para asignar",
    dndHeader: "Escanear ticket",
    dndCancel: "Atrás",
    dndDone: "Listo",
    dndTitle: "Asignar artículos",
    dndSubtitle: "Arrastra los artículos a los platos de cada persona",
    dndUnassignedSection: "Artículos sin asignar",
    dndPeopleSection: "Personas",
    dndAllAssigned: "Todos los artículos están asignados.",
    dndUnassignA11y: "Quitar «{{name}}» de esta persona",
    describeHeading: "Añadir gasto con IA",
    describeLead:
      "Escribe el gasto, toca el micrófono para grabarlo o adjunta una foto del ticket. Edita el texto y vuelve a analizarlo para reenviarlo a la IA.",
    describePlaceholder:
      "Ej.: pagué 80 $ por la cena, a partes iguales con Alicia y Bruno. Alicia pagó 20 $ por las bebidas para los tres.",
    describeAnalyze: "Analizar",
    describeAnalyzing: "Pensando…",
    describeEmpty: "Escribe al menos unas palabras antes de analizar.",
    describeFailed: "La IA no pudo entenderlo. Inténtalo de nuevo con más detalle.",
    proposedHeading: "Gastos propuestos",
    proposedPaidBy: "Pagado por {{name}}",
    proposedAddAll: "Añadir todos a {{group}}",
    proposedAdding: "Añadiendo…",
    proposedAddFailed: "No se pudieron añadir estos gastos.",
    proposedSplitSummary: "Dividido entre {{count}}",
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
    snack: "Snacks",
    drink: "Bebidas",
    home: "Hogar",
    transport: "Transporte",
  },
  groupList: {
    totalBalance: "Saldo total",
    netBalance: "Tu saldo neto",
    acrossGroups: "en {{count}} grupos",
    net: "Neto",
    youAreOwed: "Te deben",
    peopleOweYou: "Te deben",
    rowYouLent: "Prestaste",
    rowYouOwe: "Debes",
    rowSettled: "Saldado",
    youOwe: "Debes",
    createdAt: "Creado · {{when}}",
    empty: "Aún no hay grupos. Crea uno para llevar gastos compartidos.",
    deleteConfirm:
      '¿Eliminar «{{name}}» y todos sus gastos? No se puede deshacer.',
    alertDeleteGroup: "Eliminar grupo",
    delete: "Eliminar",
    statusSettled: "Estás al día en este grupo",
    statusYouAreOwed: "Te deben {{amount}}",
    statusYouOwe: "Debes {{amount}}",
    fabQuickAddExpense: "Añadir gasto rápido",
    fabMicA11y: "Grabar gasto con IA por voz",
    menuDismiss: "Cerrar menú",
    menuMoreActions: "Más acciones para {{name}}",
    menuTitleFallback: "Grupo",
    editGroup: "Editar grupo",
    deleteGroup: "Eliminar grupo",
    deleteGroupA11y: "Eliminar grupo {{name}}",
    pickSummaryCurrency: "Mostrar saldo en",
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
    currencySub: "Se usa para todos los gastos del grupo",
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
    peopleEmptyCta: "Escribe un nombre y pulsa Enter para añadir",
    peopleInputPlaceholder: "Añade un nombre o busca amigos…",
    noFriendsYet: "Aún no hay amigos guardados — escribe un nombre arriba para añadir.",
    linkedHint: "Enlazado a un amigo existente",
    searching: "Buscando…",
    link: "Enlazar",
    addFriendNoMatchCta: "Sin coincidencia — añadir persona",
    suggestedSection: "Sugeridos",
    inviteByLink: "Invitar con enlace",
    inviteByLinkSub: "No necesitan cuenta.",
    addPerson: "+ Añadir persona",
    saving: "Guardando…",
    saveGroup: "Guardar grupo",
    modalCurrency: "Moneda",
    done: "Listo",
    searchPlaceholder: "Buscar por código o país",
    emptySearch: "Sin resultados. Prueba otra búsqueda.",
    errSave: "No se pudo crear el grupo",
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
    time: "Hora",
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
    loadingExpense: "Cargando gasto…",
    needDescription: "Añade una descripción",
    needAmount: "Introduce el importe",
    needSomeoneToSplit: "Añade a alguien con quien repartir",
    sharePromptTitle: "Compártelo con tu grupo",
    shareNow: "Compartir",
    addAnother: "Añadir otro",
    doneSharing: "Listo",
    shareMessageBody: "{{description}} — {{amount}}",
    savedToast: "Guardado",
    chipsTitle: "¿Con quién es esto?",
    chipsAddPerson: "Añadir",
    chipsYouLabel: "Tú",
    advancedSplitToggle: "Opciones avanzadas de reparto",
    advancedSplitHint: "Importes exactos, porcentajes, partes, ajustes",
    paidByYou: "Pagaste tú",
    paidByName: "Pagó {{name}}",
    changePayer: "Cambiar",
    payerPickerTitle: "¿Quién pagó?",
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
    addPersonA11y: "Añadir una persona a este grupo",
    addPersonTitle: "Añadir persona",
    addPersonNamePlaceholder: "Escribe un nombre",
    title: "Añadir gasto",
    amountLabel: "Importe",
    fieldDescriptionLabel: "¿Para qué fue?",
    splitEqualEach: "{{each}} cada uno · {{count}} personas",
    splitMethod: "Método de división",
    whoIsIn: "¿Quién participa?",
    exactAmounts: "Importes exactos",
    percentages: "Porcentajes",
    sharesSection: "Partes",
    adjustments: "Ajustes",
    notIncluded: "No incluido",
    sharesUnit: "parte",
    adjustZero: "sin ajuste",
    decrementShare: "Quitar parte",
    incrementShare: "Añadir parte",
    totalLabel: "Total",
    totalSharesLabel: "Total de partes",
    sharesSummaryLine: "{{count}} / 1 parte = {{amount}}",
    equalSummaryIncluded: "{{count}} de {{total}} incluidos",
    equalSummaryEach: "{{amount}} cada uno",
    summaryBalanced: "Equilibrado",
    summaryPercentOver: "{{percent}}% de más",
    summaryPercentUnder: "{{percent}}% de menos",
    summaryAdjustOver: "{{amount}} de más",
    summaryAdjustUnder: "{{amount}} de menos",
  },
  groupDetail: {
    titleFallback: "Grupo",
    a11ySettings: "Ajustes del grupo",
    a11yMembers: "Gestionar miembros",
    tabExpenses: "Gastos",
    tabBalances: "Saldos",
    tabTotals: "Totales",
    groupTotal: "Total del grupo: ",
    expensesCount: "{{count}} gastos",
    yourBalance: "Tu saldo: ",
    summaryTheyOweYou: "Te deben",
    summaryYouOwe: "Tú debes",
    summaryAllSettled: "Todo saldado",
    balances: "Saldos",
    suggestedSettlements: "Pagos sugeridos",
    suggestedSettlementsSub: "Menos pagos para saldar a todos.",
    transactionsTitle: "Quién paga a quién",
    transactionsSub: "Todos pagan directamente a todos.",
    settlementLine: "{{from}} debe pagar a {{to}} {{amount}}",
    remind: "Recordar",
    shareSettlementsA11y: "Compartir pagos sugeridos",
    shareSettlementsIntro: "{{group}} — pagos sugeridos para saldar:",
    shareSettlementsFooter: "Saldad cuando podáis.",
    settlementExportColFrom: "Paga",
    settlementExportColTo: "A",
    settlementExportColAmount: "Importe",
    allSettledNoPayments: "No hacen falta pagos — todos al día.",
    everyone: "Todos",
    showNetBalances: "Ver saldos netos",
    hideNetBalances: "Ocultar saldos",
    balancesSettlementSummary: "{{count}} transferencias · {{amount}} a mover",
    simplifyBenefitOneLiner: "Menos pagos. Los mismos saldos netos.",
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
    deleteExpenseA11y: "Eliminar {{description}}",
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
    inviteByEmail: "Invitar por correo",
    inviteHint:
      "Si escribes un correo, crearemos una invitación para esa dirección. Activa la sincronización en Ajustes para que pueda recibirla.",
    inviteRoleCooperate: "Coeditar",
    inviteRoleWatch: "Solo ver",
    inviteEmailPlaceholder: "amigo@ejemplo.com",
    inviteFailedTitle: "No se pudo crear la invitación",
  },
  groupShare: {
    headerTitle: "Compartir",
    title: "Invita a tus amigos",
    subtitle: "Comparte este código QR para que todos puedan unirse",
    copyLink: "Copiar enlace",
    copyShareLink: "Copiar enlace para compartir",
    copied: "Enlace copiado",
    continueWithoutSharing: "Continuar sin compartir",
    peopleJoined: "Personas unidas",
    peopleJoinedCount: "{{count}} personas se han unido",
    noOneJoinedYet: "Nadie se ha unido todavía.",
    footerHint: "Cualquiera con este código puede unirse a «{{name}}».",
    openCta: "Compartir vía QR",
  },
  inviteAccepted: {
    title: "¡Estás dentro!",
    youJoined: "Te has unido a",
    viewGroup: "Abrir grupo",
    bodyLine:
      "Te uniste a un grupo. Comienza a dividir gastos desde la próxima cuenta.",
    memberCount: "{{count}} miembros",
    viewAll: "Ver todos los grupos",
    closeA11y: "Cerrar",
  },
  tour: {
    skipBtn: "Saltar",
    backBtn: "Atrás",
    nextBtn: "Siguiente",
    doneBtn: "Listo",
    fab: {
      title: "Añade gastos rápido",
      body: "Toca + para añadir un gasto, o mantén el mic para dictarlo.",
    },
    ai: {
      title: "Escanea un ticket",
      body: "La IA lee el ticket y reparte los productos entre tu grupo.",
    },
    qr: {
      title: "Únete con un QR",
      body: "Escanea el código de invitación para unirte al grupo al instante.",
    },
  },
  settings: {
    title: "Ajustes",
    preferencesSection: "Preferencias",
  },
  qrScan: {
    title: "Escanear código QR",
    cancel: "Cancelar",
    scanning: "Escaneando…",
    holdSteady: "Mantén el dispositivo firme",
    tryAgain: "Reintentar",
    permissionTitle: "Se necesita permiso de cámara",
    permissionBody:
      "Tally necesita acceso a la cámara para escanear códigos QR de invitación.",
    permissionGrant: "Conceder acceso",
    openSettings: "Abrir Ajustes",
    unrecognizedTitle: "Código QR no reconocido",
    unrecognizedBody: "Este código QR no parece un enlace de invitación de Tally.",
    expenseNotFoundTitle: "Gasto no disponible",
    expenseNotFoundBody:
      "No encontramos ese gasto en este dispositivo. Pide al anfitrión que comparta primero la invitación al grupo.",
    pointAtCode: "Apunta a un código QR de Tally para unirte",
    pasteLinkTitle: "O pega un enlace",
    pasteLinkBody: "tally.cc/g/…",
    joiningCaption: "Uniéndose…",
    pasteLinkCta: "Pegar un enlace",
  },
  joinQr: {
    title: "Compartir vía QR",
    copyLink: "Copiar enlace",
    expenseSubtitle:
      "Cualquiera que escanee se une al gasto — abre la app si está instalada, si no la app web.",
    groupSubtitle:
      "Cualquiera que escanee se une al grupo — abre la app si está instalada, si no la app web.",
    openButton: "Mostrar QR para unirse",
    closeButton: "Cerrar",
    sheetTitle: "Invitar a {{name}}",
    sheetSubtitle: "Escanea, toca o comparte — no necesitan cuenta.",
    shareTile: "Compartir",
    whatsappTile: "WhatsApp",
    emailTile: "Email",
  },
  notifications: {
    title: "Notificaciones",
    markAllRead: "Marcar todo como leído",
    markRead: "Marcar leído",
    archive: "Archivar",
    emptyTitle: "Sin notificaciones todavía",
    emptyBody:
      "Cuando ocurra algo en tus grupos, aparecerá aquí.",
    section_action_required: "Requiere acción",
    section_money_updates: "Movimientos de dinero",
    section_activity: "Actividad",
    section_system: "Anterior",
    seeAll: "Ver todas las notificaciones",
    bucketToday: "Hoy",
    bucketYesterday: "Ayer",
    bucketEarlier: "Antes",
    unreadCount: "Tienes {{count}} sin leer",
    moreA11y: "Más opciones",
    accept: "Aceptar",
    decline: "Rechazar",
  },
  premium: {
    gateTitle: "Mejora tu plan",
    gateBody:
      "Plus desbloquea las herramientas de comodidad — sigue usando Tally gratis todo el tiempo que quieras.",
    gateCta: "Ver planes",
    gateBusy: "Espera un momento…",
    gateSubscribeWebCta: "Suscribirse en línea",
    gateAiTitle: "Foto. Reparto. Listo.",
    gateAiBody:
      "Toma una foto del recibo y Tally reparte cada artículo entre todos — sin escribir nada.",
    gateSyncTitle: "Sincroniza en todos tus dispositivos",
    gateSyncBody:
      "Continúa donde lo dejaste en cualquier teléfono o computadora. Plus mantiene cada viaje al día.",
  },
  plans: {
    title: "Pases de Tally",
    subtitle: "Herramientas premium cuando las necesitas. Pagas una vez y las usas durante el período.",
    freeName: "Gratis",
    freePrice: "$0",
    freeTagline: "Lleva las cuentas compartidas en este dispositivo.",
    freeFeature1: "Grupos y gastos ilimitados",
    freeFeature2: "Reparto equitativo y saldos en vivo",
    freeFeature3: "Se queda en este teléfono — nada se sube a la nube",
    passFeature1: "Foto al recibo — los repartos se asignan solos",
    passFeature2: "Repartos avanzados: porciones, porcentajes, monto exacto",
    passFeature3: "Sugerencias inteligentes para saldar",
    passFeature4: "Sincronización en la nube en todos tus dispositivos",
    nightName: "Pase de Noche",
    nightDuration: "24 horas",
    nightPrice: "$1.99",
    nightExtendPrice: "$0.99",
    nightTagline:
      "Cena, copas, el taxi de vuelta — reparte todo en segundos.",
    tripName: "Pase de Viaje",
    tripBadge: "Más popular",
    tripDuration: "7 días",
    tripPrice: "$5.99",
    tripExtendPrice: "$2.99",
    tripTagline:
      "¿Te vas de viaje? Herramientas premium toda la semana, sin suscripción.",
    explorerName: "Pase Explorer",
    explorerDuration: "30 días",
    explorerPrice: "$14.99",
    explorerExtendPrice: "$7.99",
    explorerTagline:
      "¿Siempre repartiendo? Un mes completo de premium sin cobro automático.",
    ctaBuy: "Comprar pase",
    ctaExtend: "Extender pase",
    ctaActive: "Pase activo",
    activeStatusActive: "Activo",
    activeStatusExtended: "Extendido",
    activeStatusEnded: "Finalizado",
    remainingDaysHours: "{{d}}d {{h}}h restantes",
    remainingHoursMinutes: "{{h}}h {{m}}m restantes",
    remainingMinutes: "{{m}}m restantes",
    remainingExpired: "Acaba de terminar",
    restoreCta: "Restaurar compras",
    legalFinePrint:
      "Compras únicas. Tally nunca te cobra automáticamente — extiende o compra un pase nuevo cuando quieras.",
    webFallbackHint:
      "Las compras dentro de la app no están disponibles en esta versión.",
    webFallbackCta: "Comprar en la web",
    iapErrorTitle: "La compra no se completó",
    iapErrorBody:
      "No pudimos completar esta compra. Inténtalo de nuevo o restaura una compra anterior.",
  },
  onboarding: {
    next: "Siguiente",
    page1Title: "Bienvenido a Tally",
    page1Body:
      "Lleva el control de los gastos compartidos con amigos, compañeros de piso o de viaje — sin cuentas raras.",
    page2Title: "Registra gastos al instante",
    page2Body:
      "Anota quién pagó y para quién; Tally calcula automáticamente lo que le toca a cada uno.",
    page3Title: "Simplifica las deudas",
    page3Body:
      "Tally fusiona los pagos entre personas para que todos queden en paz con el mínimo de transferencias.",
    page4Title: "Vamos a empezar",
    page4Body:
      "Usa Tally solo en este dispositivo, o inicia sesión para que tus datos te acompañen entre teléfono y web.",
    intentTitle: "Bienvenido a Tally",
    welcomeHeadlineLead: "Divide gastos, no",
    welcomeHeadlineAccent: "amistades",
    intentBody:
      "Controla los gastos compartidos con cualquiera — viajes, compañeros de piso, citas. Tally hace las cuentas y la IA lee el recibo.",
    featureAiTitle: "Escaneo de recibos con IA",
    featureAiBody: "Toma una foto, los ítems se dividen solos",
    featureSimplifyTitle: "Simplifica las deudas",
    featureSimplifyBody: "Menos pagos, los mismos importes netos",
    featureSyncTitle: "Sincroniza en todos lados",
    featureSyncBody: "Local primero, copia en la nube, sin iniciar sesión",
    welcomeFooter: "No hace falta cuenta. Añade la nube cuando quieras.",
    welcomeCta: "Empezar",
    namePlaceholder: "Tu nombre",
    primaryCta: "Añadir tu primer gasto",
    defaultGroupName: "Grupo nuevo",
    signInLink: "¿Ya tienes cuenta? Inicia sesión",
    useLocally: "Usar local",
    authCta: "Iniciar sesión o crear cuenta",
    confirmEmailTitle: "Confirma tu correo",
    confirmEmailBody:
      "Te enviamos un enlace de confirmación a {{email}}. Haz clic para desbloquear la sincronización en la nube y la IA.",
    confirmEmailHint:
      "Puedes seguir usando Tally en este dispositivo sin confirmar — pulsa «Usar local» para continuar sin conexión.",
    confirmEmailResendCta: "Reenviar correo",
    confirmEmailResending: "Enviando…",
    confirmEmailResendSent: "✓ Correo enviado — revisa tu bandeja",
    confirmEmailEditCta: "Usar otro correo",
    confirmEmailContinueCta: "Ya lo confirmé — continuar",
    confirmEmailContinueBusy: "Comprobando…",
    confirmEmailContinueFailed: "Aún sin confirmar — vuelve a intentarlo",
  },
};

export const translations: Record<AppLocale, MessageTree> = { en, fa, es };
