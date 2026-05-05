import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as Linking from "expo-linking";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking as RNLinking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseInviteTokenFromScannedUrl } from "../core/inviteEnv";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

const FRAME = 230;
const CORNER = 28;
const CORNER_W = 4;

/**
 * Full-screen QR scanner. Detects a code, parses an invite token out of the
 * URL, and forwards the deep link to the app via `Linking.openURL` so the
 * existing `InviteDeepLinkHandler` does the join work. Avoids duplicating
 * Supabase logic here.
 */
export function QrScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  /** Suppress repeated scans of the same code while the alert/handler runs. */
  const handledRef = useRef<string | null>(null);

  const onScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const raw = result.data?.trim() ?? "";
      if (!raw || handledRef.current === raw || busy) return;
      handledRef.current = raw;
      setBusy(true);

      const invite = parseInviteTokenFromScannedUrl(raw);
      if (!invite) {
        Alert.alert(
          t("qrScan.unrecognizedTitle"),
          t("qrScan.unrecognizedBody"),
          [
            {
              text: t("qrScan.tryAgain"),
              onPress: () => {
                handledRef.current = null;
                setBusy(false);
              },
            },
          ],
        );
        return;
      }

      void Linking.openURL(raw)
        .catch(() => {
          /* fall through to dismiss either way */
        })
        .finally(() => {
          navigation.goBack();
        });
    },
    [busy, navigation, t],
  );

  const onPasteLink = useCallback(() => {
    if (Platform.OS === "web") {
      // Web has clipboard API access; native iOS/Android prompt would need
      // `Alert.prompt`. For both, fall back to opening a simple input dialog.
      const url =
        typeof window !== "undefined"
          ? window.prompt(t("qrScan.pasteLinkTitle"), "")
          : null;
      if (!url) return;
      onScanned({ data: url, type: "qr" } as BarcodeScanningResult);
      return;
    }
    if (Platform.OS === "ios") {
      // iOS-only: `Alert.prompt` opens a single-field input.
      Alert.prompt(
        t("qrScan.pasteLinkTitle"),
        t("qrScan.pasteLinkBody"),
        [
          { text: t("qrScan.cancel"), style: "cancel" },
          {
            text: t("addExpense.save"),
            onPress: (url) => {
              if (!url || !url.trim()) return;
              onScanned({ data: url.trim(), type: "qr" } as BarcodeScanningResult);
            },
          },
        ],
        "plain-text",
        "",
        "url",
      );
      return;
    }
    // Android: Alert.prompt isn't supported; nudge the user to use the camera.
    Alert.alert(t("qrScan.pasteLinkTitle"), t("qrScan.pasteLinkBody"));
  }, [onScanned, t]);

  // First-render permission gate.
  if (!permission) {
    return (
      <View style={[styles.permissionRoot, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.darkRoot}>
        {/* Faux gradient + light blobs for depth on the permission state. */}
        <View style={styles.gradientLayer} />
        <View style={[styles.blobA]} />
        <View style={[styles.blobB]} />

        {/* Translucent header with close button */}
        <View
          style={[styles.headerBar, { paddingTop: insets.top + 12 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.headerCloseBtn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("qrScan.cancel")}
            hitSlop={10}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("qrScan.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.deniedWrap}>
          <View style={styles.deniedIconTile}>
            <Ionicons
              name="camera-reverse-outline"
              size={38}
              color="#fff"
            />
          </View>
          <Text style={styles.deniedTitle}>
            {t("qrScan.permissionTitle")}
          </Text>
          <Text style={styles.deniedBody}>{t("qrScan.permissionBody")}</Text>
          <View style={styles.deniedCtaCol}>
            {permission.canAskAgain ? (
              <AppButton
                variant="primary"
                fullWidth
                label={t("qrScan.permissionGrant")}
                onPress={() => void requestPermission()}
              />
            ) : (
              <AppButton
                variant="primary"
                fullWidth
                label={t("qrScan.openSettings")}
                onPress={() => void RNLinking.openSettings()}
              />
            )}
            <Pressable
              onPress={onPasteLink}
              style={({ pressed }) => [
                styles.deniedSecondary,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.deniedSecondaryText}>
                {t("qrScan.pasteLinkCta")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.darkRoot}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        // Limit detection to QR for faster + more reliable scanning.
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />

      {/* Top translucent header with close (✕) button */}
      <View
        style={[styles.headerBar, { paddingTop: insets.top + 12 }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.headerCloseBtn,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("qrScan.cancel")}
          hitSlop={10}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("qrScan.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Viewfinder — square frame with corner ticks + scan-line gradient */}
      <View pointerEvents="none" style={styles.viewfinderWrap}>
        <View style={styles.frame}>
          <View style={styles.frameInner} />
          {/* Corner ticks */}
          <View
            style={[
              styles.corner,
              { top: 0, left: 0, borderColor: colors.primary },
              styles.cornerTL,
            ]}
          />
          <View
            style={[
              styles.corner,
              { top: 0, right: 0, borderColor: colors.primary },
              styles.cornerTR,
            ]}
          />
          <View
            style={[
              styles.corner,
              { bottom: 0, left: 0, borderColor: colors.primary },
              styles.cornerBL,
            ]}
          />
          <View
            style={[
              styles.corner,
              { bottom: 0, right: 0, borderColor: colors.primary },
              styles.cornerBR,
            ]}
          />
          {busy ? (
            <View style={styles.successWrap}>
              <View style={[styles.successCheck, { backgroundColor: colors.primary }]}>
                <Ionicons name="checkmark" size={48} color="#fff" />
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.scanLine,
                { backgroundColor: colors.primary },
              ]}
            />
          )}
        </View>
        <Text style={styles.caption}>
          {busy ? t("qrScan.joiningCaption") : t("qrScan.pointAtCode")}
        </Text>
      </View>

      {/* Bottom paste-link hint (kit's translucent dark sheet) */}
      <View
        style={[
          styles.bottomHintWrap,
          { paddingBottom: insets.bottom + 22 },
        ]}
      >
        <Pressable
          onPress={onPasteLink}
          accessibilityRole="button"
          accessibilityLabel={t("qrScan.pasteLinkTitle")}
          style={({ pressed }) => [
            styles.pasteHint,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.pasteHintIcon}>
            <Ionicons name="link-outline" size={18} color="#fff" />
          </View>
          <View style={styles.pasteHintCol}>
            <Text style={styles.pasteHintTitle}>
              {t("qrScan.pasteLinkTitle")}
            </Text>
            <Text style={styles.pasteHintBody}>
              {t("qrScan.pasteLinkBody")}
            </Text>
          </View>
          <Ionicons
            name={isRTL ? "chevron-back" : "chevron-forward"}
            size={16}
            color="rgba(255,255,255,0.6)"
          />
        </Pressable>
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  return StyleSheet.create({
    darkRoot: {
      flex: 1,
      backgroundColor: "#061E1E",
      overflow: "hidden",
    },
    gradientLayer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0A2625",
    },
    blobA: {
      position: "absolute",
      left: "10%",
      top: "30%",
      width: 220,
      height: 220,
      borderRadius: 220,
      backgroundColor: "rgba(94,230,160,0.10)",
    },
    blobB: {
      position: "absolute",
      right: "5%",
      top: "60%",
      width: 260,
      height: 260,
      borderRadius: 260,
      backgroundColor: "rgba(255,255,255,0.06)",
    },

    /* ── Header ──────────────────────────────────────────────────── */
    headerBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingBottom: 12,
      paddingHorizontal: 16,
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.32)",
      zIndex: 3,
    },
    headerCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    headerTitle: {
      flex: 1,
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },
    headerSpacer: { width: 36 },

    /* ── Viewfinder ──────────────────────────────────────────────── */
    viewfinderWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    frame: {
      width: FRAME,
      height: FRAME,
      position: "relative",
    },
    frameInner: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.04)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    corner: {
      position: "absolute",
      width: CORNER,
      height: CORNER,
    },
    cornerTL: {
      borderTopWidth: CORNER_W,
      borderLeftWidth: CORNER_W,
      borderTopLeftRadius: 18,
    },
    cornerTR: {
      borderTopWidth: CORNER_W,
      borderRightWidth: CORNER_W,
      borderTopRightRadius: 18,
    },
    cornerBL: {
      borderBottomWidth: CORNER_W,
      borderLeftWidth: CORNER_W,
      borderBottomLeftRadius: 18,
    },
    cornerBR: {
      borderBottomWidth: CORNER_W,
      borderRightWidth: CORNER_W,
      borderBottomRightRadius: 18,
    },
    scanLine: {
      position: "absolute",
      left: 16,
      right: 16,
      top: "50%",
      height: 2,
      borderRadius: 1,
      opacity: 0.7,
    },
    successWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    successCheck: {
      width: 90,
      height: 90,
      borderRadius: 45,
      alignItems: "center",
      justifyContent: "center",
    },
    caption: {
      marginTop: 22,
      fontSize: 14,
      fontWeight: "600",
      color: "rgba(255,255,255,0.85)",
      textAlign: "center",
      paddingHorizontal: 24,
    },

    /* ── Bottom paste-link hint ──────────────────────────────────── */
    bottomHintWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 22,
      paddingTop: 18,
      backgroundColor: "rgba(0,0,0,0.32)",
      zIndex: 3,
    },
    pasteHint: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)",
    },
    pasteHintIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    pasteHintCol: { flex: 1, minWidth: 0 },
    pasteHintTitle: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "800",
    },
    pasteHintBody: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 12,
      marginTop: 2,
    },

    /* ── Permission denied ───────────────────────────────────────── */
    deniedWrap: {
      flex: 1,
      paddingHorizontal: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    deniedIconTile: {
      width: 84,
      height: 84,
      borderRadius: 26,
      backgroundColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    deniedTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: -0.3,
      marginTop: 18,
      textAlign: "center",
    },
    deniedBody: {
      fontSize: 14,
      color: "rgba(255,255,255,0.7)",
      textAlign: "center",
      lineHeight: 20,
      marginTop: 8,
    },
    deniedCtaCol: {
      width: "100%",
      gap: 10,
      marginTop: 22,
    },
    deniedSecondary: {
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)",
    },
    deniedSecondaryText: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 14,
      fontWeight: "700",
    },

    /* ── Loading shell shown before permission state resolves ────── */
    permissionRoot: {
      flex: 1,
      backgroundColor: "#061E1E",
      paddingHorizontal: 24,
      alignItems: "center",
    },

    pressed: { opacity: 0.85 },
  });
}
