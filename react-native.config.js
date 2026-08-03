module.exports = {
  dependencies: {
    // Temporarily disabled for Android: app.json's androidAppId is still the
    // XXXX placeholder, which the SDK's ContentProvider validates on process
    // start and crashes on. admobProvider.ts already falls back gracefully
    // when this native module is absent. Remove this exclusion once a real
    // (or Google test) AdMob App ID is set in app.json.
    //
    // `platforms.android: null` is the documented way to disable a platform,
    // but expo-modules-autolinking's config merge treats `null` as `typeof
    // 'object'` and silently no-ops instead of clearing it (a bug in
    // expo-modules-autolinking/build/reactNativeConfig/reactNativeConfig.js's
    // deepObjectMerge). Pointing sourceDir at a nonexistent directory forces
    // the same "module not found" outcome via a different code path.
    "react-native-google-mobile-ads": {
      platforms: {
        android: {
          sourceDir: "__disabled_by_react_native_config__",
        },
      },
    },
  },
};
