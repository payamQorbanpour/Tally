import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { Pressable, View } from "react-native";
import { PersonAvatar } from "../../components/PersonAvatar";
import { Text } from "../../ui/AppText";

export type ReceiptLineRowMember = { id: string; name: string; avatarUri?: string | null };

/**
 * Style values handed down from `AiReceiptScreen`'s `buildStyles(...)`. The
 * screen owns the concrete `StyleSheet.create` result (many specific keys);
 * this keeps the prop reviewable without importing the screen's private
 * return type, while still typechecking against real View/Text/Image style
 * props instead of a bare `object`.
 */
type StyleValue = ViewStyle | TextStyle | ImageStyle;

export type ReceiptLineRowProps = {
  kind: "item" | "spread";
  sharerIds: string[];
  /** Member id → this member's slice of this line, in minor units. */
  slices: Map<string, number>;
  members: ReceiptLineRowMember[];
  expanded: boolean;
  disabled: boolean;
  /** Formatted by the parent, which owns the currency and locale. */
  formatAmount: (minor: number) => string;
  /** Non-null only for spread rows: the share of the item subtotal, e.g. "16.6%". */
  spreadPercentLabel: string | null;
  onToggleSharer: (memberId: string) => void;
  onChangeKind: (kind: "item" | "spread") => void;
  /** Matches `useLocale()`'s real `t` — interpolation vars are strings, so
   *  numeric values (e.g. a member count) must be stringified by the caller. */
  t: (key: string, vars?: Record<string, string>) => string;
  styles: Record<string, StyleValue>;
};

const AVATAR_STACK_MAX = 3;

export function ReceiptLineRow(props: ReceiptLineRowProps) {
  const { kind, sharerIds, members, expanded, slices, t, styles } = props;

  const stack = sharerIds.slice(0, AVATAR_STACK_MAX);
  const overflow = sharerIds.length - stack.length;
  // Nothing to show for an unassigned `kind: "item"` row — the row above
  // (now the tap target for the tray, see `AiReceiptScreen`) already
  // communicates its own state via `accessibilityState.expanded`, so this
  // strip only renders once there's something to summarize.
  const hasSummary = kind === "spread" || sharerIds.length > 0;

  return (
    <View>
      {hasSummary ? (
        <View style={styles.lineSharerSummary}>
          {kind === "spread" ? (
            <Text style={styles.lineSpreadChip}>{t("aiReceipt.spreadOverItems")}</Text>
          ) : sharerIds.length > 1 ? (
            <Text style={styles.lineShareCount}>
              {t("aiReceipt.sharedByCount", { count: String(sharerIds.length) })}
            </Text>
          ) : null}
          {kind === "item"
            ? stack.map((id) => {
                const m = members.find((x) => x.id === id);
                return m ? (
                  <PersonAvatar
                    key={id}
                    name={m.name}
                    avatarUri={m.avatarUri ?? null}
                    size={20}
                    containerStyle={styles.lineStackAvatar}
                    letterStyle={styles.lineStackAvatarLetter}
                  />
                ) : null;
              })
            : null}
          {overflow > 0 ? <Text style={styles.lineShareCount}>{`+${overflow}`}</Text> : null}
        </View>
      ) : null}

      {expanded && !props.disabled ? (
        <View style={styles.lineTray}>
          <View style={styles.lineKindSeg}>
            <Pressable
              onPress={() => props.onChangeKind("item")}
              style={[styles.lineKindSegBtn, kind === "item" && styles.lineKindSegBtnSel]}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === "item" }}
            >
              <Text style={styles.lineKindSegText}>{t("aiReceipt.shareLikeItem")}</Text>
            </Pressable>
            <Pressable
              onPress={() => props.onChangeKind("spread")}
              style={[styles.lineKindSegBtn, kind === "spread" && styles.lineKindSegBtnSel]}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === "spread" }}
            >
              <Text style={styles.lineKindSegText}>{t("aiReceipt.spreadOverItems")}</Text>
            </Pressable>
          </View>

          {kind === "spread" && props.spreadPercentLabel ? (
            <Text style={styles.lineTrayHint}>
              {t("aiReceipt.spreadHint", { percent: props.spreadPercentLabel })}
            </Text>
          ) : null}

          <View style={styles.lineTrayPicks}>
            {members.map((m) => {
              const on = kind === "spread" ? slices.has(m.id) : sharerIds.includes(m.id);
              const slice = slices.get(m.id);
              // Item mode: this control adds AND removes the member on the
              // same press, so it gets one label in both states rather than
              // switching between "unassign" and "add/remove" wording —
              // `accessibilityState.checked` already carries on/off, and a
              // user flipping this back and forth should hear one coherent
              // phrase, not two structurally different ones.
              // Spread mode: the row is informational only (`disabled`
              // below, role "text") — there is nothing to toggle, so it gets
              // no action label at all; the name and amount `Text` children
              // are announced on their own.
              const a11yLabel =
                kind === "item" ? t("aiReceipt.toggleSharerA11y", { name: m.name }) : undefined;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    if (kind === "item") props.onToggleSharer(m.id);
                  }}
                  disabled={kind === "spread"}
                  accessibilityRole={kind === "item" ? "checkbox" : "text"}
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={a11yLabel}
                  style={[styles.lineTrayPick, !on && styles.lineTrayPickOff]}
                >
                  <PersonAvatar
                    name={m.name}
                    avatarUri={m.avatarUri ?? null}
                    size={28}
                    containerStyle={styles.lineTrayPickAvatar}
                    letterStyle={styles.lineTrayPickAvatarLetter}
                  />
                  <Text style={styles.lineTrayPickName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.lineTrayPickSlice}>
                    {on && slice != null ? props.formatAmount(slice) : "—"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
