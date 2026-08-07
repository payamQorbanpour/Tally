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
  sharerIds: string[];
  /** Member id → this member's slice of this line, in minor units. */
  slices: Map<string, number>;
  members: ReceiptLineRowMember[];
  expanded: boolean;
  disabled: boolean;
  /** Formatted by the parent, which owns the currency and locale. */
  formatAmount: (minor: number) => string;
  onToggleSharer: (memberId: string) => void;
  /** Matches `useLocale()`'s real `t` — interpolation vars are strings, so
   *  numeric values (e.g. a member count) must be stringified by the caller. */
  t: (key: string, vars?: Record<string, string>) => string;
  styles: Record<string, StyleValue>;
};

const AVATAR_STACK_MAX = 3;

export function ReceiptLineRow(props: ReceiptLineRowProps) {
  const { sharerIds, members, expanded, slices, t, styles } = props;

  const stack = sharerIds.slice(0, AVATAR_STACK_MAX);
  const overflow = sharerIds.length - stack.length;
  // Nothing to show for an unassigned row — the row above (now the tap
  // target for the tray, see `AiReceiptScreen`) already communicates its
  // own state via `accessibilityState.expanded`, so this strip only
  // renders once there's something to summarize.
  const hasSummary = sharerIds.length > 0;

  return (
    <View>
      {hasSummary ? (
        <View style={styles.lineSharerSummary}>
          {sharerIds.length > 1 ? (
            <Text style={styles.lineShareCount}>
              {t("aiReceipt.sharedByCount", { count: String(sharerIds.length) })}
            </Text>
          ) : null}
          {stack.map((id) => {
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
          })}
          {overflow > 0 ? <Text style={styles.lineShareCount}>{`+${overflow}`}</Text> : null}
        </View>
      ) : null}

      {expanded && !props.disabled ? (
        <View style={styles.lineTray}>
          <View style={styles.lineTrayPicks}>
            {members.map((m) => {
              const on = sharerIds.includes(m.id);
              const slice = slices.get(m.id);
              // This control adds AND removes the member on the same press,
              // so it gets one label in both states rather than switching
              // between "unassign" and "add/remove" wording —
              // `accessibilityState.checked` already carries on/off, and a
              // user flipping this back and forth should hear one coherent
              // phrase, not two structurally different ones.
              const a11yLabel = t("aiReceipt.toggleSharerA11y", { name: m.name });
              return (
                <Pressable
                  key={m.id}
                  onPress={() => props.onToggleSharer(m.id)}
                  accessibilityRole="checkbox"
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
