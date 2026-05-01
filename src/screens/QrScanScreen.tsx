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

/**
 * Full-screen QR scanner. Detects a code, parses an invite token out of the
 * URL, and forwards the deep link to the app via `Linking.openURL` so the
 * existing `InviteDeepLinkHandler` does the join work. Avoids duplicating
 * Supabase logic here.
 */
export function QrScanScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => buildStyles(colors), [colors]);
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

      // Forward the URL to the OS so universal-link routing (when set up) or
      // the in-app `InviteDeepLinkHandler` picks it up. On web, this opens
      // the link in a new tab and the user can continue there.
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
      <View style={[styles.permissionRoot, { paddingTop: insets.top + 20 }]}>
        <Ionicons
          name="camera-outline"
          size={48}
          color={colors.muted}
          style={{ marginBottom: 12 }}
        />
        <Text style={styles.permissionTitle}>
          {t("qrScan.permissionTitle")}
        </Text>
        <Text style={styles.permissionBody}>{t("qrScan.permissionBody")}</Text>
        {permission.canAskAgain ? (
          <AppButton
            variant="primary"
            label={t("qrScan.permissionGrant")}
            onPress={() => void requestPermission()}
            style={{ marginTop: 16 }}
          />
        ) : (
          <AppButton
            variant="secondary"
            label={t("qrScan.openSettings")}
            onPress={() => void RNLinking.openSettings()}
            style={{ marginTop: 16 }}
          />
        )}
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.cancelBtn}
          accessibilityRole="button"
        >
          <Text style={styles.cancelBtnText}>{t("qrScan.cancel")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        // Limit detection to QR for faster + more reliable scanning.
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />

      <View
        style={[styles.headerBar, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
          accessibilityRole="button"
          hitSlop={10}
        >
          <Text style={styles.headerBackText}>{t("qrScan.cancel")}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t("qrScan.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.frameRow}>
          <View style={[styles.cornerTL, { borderColor: colors.primary }]} />
          <View style={styles.frameSpacer} />
          <View style={[styles.cornerTR, { borderColor: colors.primary }]} />
        </View>
        <View style={styles.frameMiddle} />
        <View style={styles.frameRow}>
          <View style={[styles.cornerBL, { borderColor: colors.primary }]} />
          <View style={styles.frameSpacer} />
          <View style={[styles.cornerBR, { borderColor: colors.primary }]} />
        </View>
      </View>

      <View
        style={[styles.scanPillWrap, { paddingBottom: insets.bottom + 24 }]}
        pointerEvents="none"
      >
        <View style={styles.scanPill}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={styles.scanPillDot} />
          )}
          <Text style={styles.scanPillText}>{t("qrScan.scanning")}</Text>
        </View>
      </View>
    </View>
  );
}

const FRAME = 240;
const CORNER = 36;
const CORNER_W = 6;

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    headerBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      // Height grows with the safe-area inset (`paddingTop` is set dynamically
      // on the JSX) so the title and Cancel are never clipped behind the
      // status bar / Dynamic Island. A fixed `height: 80` left only ~25px of
      // content area on notch devices, hiding most of the row.
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    headerBack: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 60 },
    headerBackText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "600",
    },
    headerTitle: {
      color: "#fff",
      fontSize: 17,
      fontWeight: "700",
    },
    headerSpacer: { width: 60 },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    frameRow: {
      flexDirection: "row",
      width: FRAME,
      justifyContent: "space-between",
    },
    frameSpacer: { flex: 1 },
    frameMiddle: { height: FRAME - CORNER * 2 },
    cornerTL: {
      width: CORNER,
      height: CORNER,
      borderTopWidth: CORNER_W,
      borderLeftWidth: CORNER_W,
      borderTopLeftRadius: 12,
    },
    cornerTR: {
      width: CORNER,
      height: CORNER,
      borderTopWidth: CORNER_W,
      borderRightWidth: CORNER_W,
      borderTopRightRadius: 12,
    },
    cornerBL: {
      width: CORNER,
      height: CORNER,
      borderBottomWidth: CORNER_W,
      borderLeftWidth: CORNER_W,
      borderBottomLeftRadius: 12,
    },
    cornerBR: {
      width: CORNER,
      height: CORNER,
      borderBottomWidth: CORNER_W,
      borderRightWidth: CORNER_W,
      borderBottomRightRadius: 12,
    },
    scanPillWrap: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
      alignItems: "center",
    },
    scanPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.92)",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.18,
          shadowRadius: 4,
        },
        default: { elevation: 2 },
      }),
    },
    scanPillDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    scanPillText: {
      // Fixed dark on the fixed white pill background — `colors.text` flips to
      // near-white in dark mode and disappears on the pill.
      color: "#0d2024",
      fontSize: 13,
      fontWeight: "600",
    },
    permissionRoot: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 24,
      alignItems: "center",
    },
    permissionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      marginTop: 8,
      textAlign: "center",
    },
    permissionBody: {
      fontSize: 14,
      color: colors.muted,
      marginTop: 8,
      textAlign: "center",
      lineHeight: 20,
    },
    cancelBtn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 16 },
    cancelBtnText: {
      color: colors.muted,
      fontSize: 15,
      fontWeight: "600",
    },
  });
}
