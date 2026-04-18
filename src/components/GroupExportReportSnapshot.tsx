import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  GROUP_EXPORT_WATERMARK_TEXT,
  type GroupReportModel,
} from "../core/groupExport";
import { AutoDirectionText } from "./AutoDirectionText";

type Props = {
  model: GroupReportModel | null;
};

const COLS = ["Date", "Paid by", "Amount", "Description", "Category", "Split"] as const;

export const GroupExportReportSnapshot = forwardRef<View, Props>(
  function GroupExportReportSnapshot({ model }, ref) {
    return (
      <View ref={ref} collapsable={false} style={model ? styles.root : styles.rootHidden}>
        {model ? (
          <>
            <View style={styles.watermarkWrap} pointerEvents="none">
              <View style={styles.watermarkRot}>
                <Text style={styles.watermarkText}>{GROUP_EXPORT_WATERMARK_TEXT}</Text>
              </View>
            </View>
            <View style={styles.inner}>
              <Text style={styles.h1}>{model.title}</Text>
              <Text style={styles.meta}>{model.metaLine}</Text>
              <View style={styles.table}>
                <View style={styles.trHead}>
                  {COLS.map((h) => (
                    <Text key={h} style={styles.th}>
                      {h}
                    </Text>
                  ))}
                </View>
                {model.rows.length === 0 ? (
                  <View style={styles.tr}>
                    <Text style={styles.tdFull}>No expenses</Text>
                  </View>
                ) : (
                  model.rows.map((row, i) => (
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
    padding: 16,
  },
  rootHidden: {
    width: 0,
    height: 0,
    opacity: 0,
    overflow: "hidden",
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
  },
  h1: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    color: "#555555",
    marginBottom: 16,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cccccc",
  },
  trHead: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#cccccc",
  },
  th: {
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    color: "#111111",
    padding: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#cccccc",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#cccccc",
  },
  td: {
    flex: 1,
    fontSize: 10,
    color: "#111111",
    padding: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#cccccc",
  },
  tdAmount: {
    textAlign: "right",
  },
  tdFull: {
    flex: 1,
    fontSize: 11,
    color: "#111111",
    padding: 8,
  },
});
