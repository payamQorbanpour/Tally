const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Tapsell's mediation SDK requires the AD_ID permission to read the Android
 * advertising id. The npm package ships no config plugin, so a prebuild would
 * otherwise drop it and ads would fail to fill at runtime.
 */
module.exports = function withTapsellAdId(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const name = "com.google.android.gms.permission.AD_ID";
    const already = manifest["uses-permission"].some(
      (p) => p.$?.["android:name"] === name,
    );
    if (!already) {
      manifest["uses-permission"].push({ $: { "android:name": name } });
    }
    return cfg;
  });
};
