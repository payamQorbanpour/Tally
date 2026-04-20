import { forwardRef } from "react";
import { I18nManager, Image, Platform, StyleSheet, View } from "react-native";
import { Text } from "../ui/AppText";
import { TALLY_SLOGAN_LOGO_SOURCE } from "../core/groupExportBrandImage";
import {
  GROUP_EXPORT_BRAND,
  GROUP_EXPORT_WATERMARK_TEXT,
  settlementExportAvatarStyle,
  settlementExportPersonInitial,
  type GroupPngSnapshot,
} from "../core/groupExport";
import { AutoDirectionText } from "./AutoDirectionText";

type Props = {
  snapshot: GroupPngSnapshot | null;
};

const EXP_COLS = ["Date", "Paid by", "Amount", "Description", "Category", "Split"] as const;

export const GroupExportReportSnapshot = forwardRef<View, Props>(
  function GroupExportReportSnapshot({ snapshot }, ref) {
    const visible = snapshot != null;
    return (
      <View ref={ref} collapsable={false} style={visible ? styles.root : styles.rootHidden}>
        {snapshot?.kind === "expenses" ? (
          <>
            <View style={styles.accentStrip} />
            <View style={styles.watermarkWrap} pointerEvents="none">
              <View style={styles.watermarkRot}>
                <Text style={styles.watermarkText}>{GROUP_EXPORT_WATERMARK_TEXT}</Text>
              </View>
            </View>
            <View style={styles.inner}>
              <View style={styles.brandHead}>
                <Image
                  source={TALLY_SLOGAN_LOGO_SOURCE}
                  style={styles.brandLogoImg}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>
              <Text style={styles.h1}>{snapshot.model.title}</Text>
              <Text style={styles.meta}>{snapshot.model.metaLine}</Text>
              <View style={styles.table}>
                <View style={styles.trHead}>
                  {EXP_COLS.map((h) => (
                    <Text key={h} style={styles.th}>
                      {h}
                    </Text>
                  ))}
                </View>
                {snapshot.model.rows.length === 0 ? (
                  <View style={styles.tr}>
                    <Text style={styles.tdFull}>No expenses</Text>
                  </View>
                ) : (
                  snapshot.model.rows.map((row, i) => (
                    <View key={i} style={styles.tr}>
                      <AutoDirectionText style={styles.td}>{row.date}</AutoDirectionText>
                      <AutoDirectionText style={styles.td}>{row.paidBy}</AutoDirectionText>
                      <Text style={[styles.td, styles.tdAmount]}>{row.amount}</Text>
                      <AutoDirectionText style={styles.td}>{row.description}</AutoDirectionText>
                      <AutoDirectionText style={styles.td}>{row.category}</AutoDirectionText>
                      <AutoDirectionText style={styles.td}>{row.split}</AutoDirectionText>
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        ) : snapshot?.kind === "settlements" ? (
          <>
            <View style={styles.watermarkWrap} pointerEvents="none">
              <View style={styles.watermarkRot}>
                <Text style={styles.watermarkText}>{GROUP_EXPORT_WATERMARK_TEXT}</Text>
              </View>
            </View>
            <View style={[styles.inner, styles.settleReceiptInner]}>
              <View style={styles.settleReceiptHead}>
                <Image
                  source={TALLY_SLOGAN_LOGO_SOURCE}
                  style={styles.settleReceiptLogo}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>
              <View style={styles.settleList}>
                {snapshot.model.rows.length === 0 ? (
                  <Text style={styles.settleEmpty}>—</Text>
                ) : (
                  snapshot.model.rows.map((row, i) => {
                    const avP = settlementExportAvatarStyle(row.payerUserId);
                    const avR = settlementExportAvatarStyle(row.payeeUserId);
                    return (
                      <View key={i} style={styles.settleCard}>
                        <View style={styles.settleRow}>
                          <View style={styles.settleParties}>
                            <View style={styles.settlePerson}>
                              <View style={styles.settleIdentity}>
                                <View style={[styles.settleAv, avP]}>
                                  <Text style={styles.settleAvLetter}>
                                    {settlementExportPersonInitial(row.payer)}
                                  </Text>
                                </View>
                                <Text style={styles.settleUnderName} numberOfLines={2}>
                                  {row.payer}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.settleArrowSlot} accessibilityElementsHidden>
                              <Text style={styles.settleArr}>
                                {I18nManager.isRTL ? "←" : "→"}
                              </Text>
                            </View>
                            <View style={styles.settlePerson}>
                              <View style={styles.settleIdentity}>
                                <View style={[styles.settleAv, avR]}>
                                  <Text style={styles.settleAvLetter}>
                                    {settlementExportPersonInitial(row.payee)}
                                  </Text>
                                </View>
                                <Text style={styles.settleUnderName} numberOfLines={2}>
                                  {row.payee}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.settleAmtBlock}>
                            <Text style={styles.settleAmt}>{row.amount}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    position: "relative",
    backgroundColor: "#ffffff",
    width: 720,
    paddingBottom: 16,
    paddingHorizontal: 0,
    overflow: "hidden",
  },
  rootHidden: {
    width: 0,
    height: 0,
    opacity: 0,
    overflow: "hidden",
  },
  accentStrip: {
    height: 4,
    width: "100%",
    backgroundColor: GROUP_EXPORT_BRAND.primary,
  },
  settleReceiptInner: {
    paddingTop: 16,
  },
  settleReceiptHead: {
    backgroundColor: GROUP_EXPORT_BRAND.surfaceDeep,
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 16,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  settleReceiptLogo: {
    width: 220,
    height: 56,
    maxWidth: "100%",
  },
  brandHead: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GROUP_EXPORT_BRAND.border,
  },
  brandLogoImg: {
    width: "100%",
    maxWidth: 320,
    height: 88,
    alignSelf: "flex-start",
  },
  settleList: {
    flexDirection: "column",
    gap: 10,
  },
  settleCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GROUP_EXPORT_BRAND.border,
    backgroundColor: GROUP_EXPORT_BRAND.headerTint,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  settleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  settleParties: {
    flexDirection: "row",
    flex: 1,
    minWidth: 180,
    alignItems: "flex-start",
    gap: 2,
  },
  settlePerson: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  settleIdentity: {
    width: "100%",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  settleArrowSlot: {
    width: 22,
    minWidth: 22,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  settleAv: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "center",
  },
  settleAvLetter: {
    fontSize: 16,
    fontWeight: "800",
    color: GROUP_EXPORT_BRAND.text,
  },
  settleUnderName: {
    fontSize: 12,
    fontWeight: "600",
    color: GROUP_EXPORT_BRAND.muted,
    textAlign: "center",
    lineHeight: 16,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    // Always centered under avatars (not AutoDirectionText) — bidi in export is a tradeoff.
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  settleArr: {
    flexShrink: 0,
    color: GROUP_EXPORT_BRAND.muted,
    fontSize: 18,
    lineHeight: 20,
  },
  settleAmtBlock: {
    alignItems: "flex-end",
    flexShrink: 0,
    minWidth: 96,
  },
  settleAmt: {
    fontSize: 18,
    fontWeight: "800",
    color: GROUP_EXPORT_BRAND.text,
    fontVariant: ["tabular-nums"],
  },
  settleEmpty: {
    fontSize: 13,
    color: GROUP_EXPORT_BRAND.muted,
    marginTop: 4,
  },
  watermarkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  },
  watermarkRot: {
    transform: [{ rotate: "-28deg" }],
  },
  watermarkText: {
    fontSize: 96,
    fontWeight: "700",
    color: "rgba(0,0,0,0.07)",
  },
  inner: {
    position: "relative",
    zIndex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  h1: {
    fontSize: 18,
    fontWeight: "700",
    color: GROUP_EXPORT_BRAND.text,
    marginBottom: 8,
  },
  h2: {
    fontSize: 15,
    fontWeight: "700",
    color: GROUP_EXPORT_BRAND.text,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    color: GROUP_EXPORT_BRAND.muted,
    marginBottom: 10,
    lineHeight: 16,
  },
  meta: {
    fontSize: 12,
    color: GROUP_EXPORT_BRAND.muted,
    marginBottom: 16,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GROUP_EXPORT_BRAND.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  trHead: {
    flexDirection: "row",
    backgroundColor: GROUP_EXPORT_BRAND.headerTint,
    borderBottomWidth: 2,
    borderBottomColor: GROUP_EXPORT_BRAND.primary,
  },
  th: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: GROUP_EXPORT_BRAND.text,
    padding: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: GROUP_EXPORT_BRAND.border,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GROUP_EXPORT_BRAND.border,
  },
  td: {
    flex: 1,
    fontSize: 10,
    color: GROUP_EXPORT_BRAND.text,
    padding: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: GROUP_EXPORT_BRAND.border,
  },
  tdAmount: {
    textAlign: "right",
  },
  tdFull: {
    flex: 1,
    fontSize: 11,
    color: GROUP_EXPORT_BRAND.text,
    padding: 8,
  },
});
