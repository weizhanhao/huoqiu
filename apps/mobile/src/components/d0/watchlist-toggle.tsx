import { tokens } from "@huoqiu/native-ui";
import { Pressable, StyleSheet, Text } from "react-native";

import { useD0Watchlist } from "../../stores/d0-watchlist";

type WatchlistToggleProperties = Readonly<{
  listingId: string;
  removeLabel?: string;
}>;

export function WatchlistToggle({
  listingId,
  removeLabel = "已加自选",
}: WatchlistToggleProperties) {
  const { add, has, remove } = useD0Watchlist();
  const isIncluded = has(listingId);

  return (
    <Pressable
      accessibilityLabel={isIncluded ? "取消自选" : "加自选"}
      accessibilityRole="button"
      accessibilityState={{ selected: isIncluded }}
      aria-pressed={isIncluded}
      onPress={() => {
        if (isIncluded) {
          remove(listingId);
        } else {
          add(listingId);
        }
      }}
      style={[styles.button, isIncluded && styles.buttonIncluded]}
    >
      <Text style={[styles.label, isIncluded && styles.labelIncluded]}>
        {isIncluded ? removeLabel : "加自选"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: tokens.brand.primary,
    borderColor: tokens.brand.primary,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonIncluded: {
    backgroundColor: tokens.surface.base,
    borderColor: tokens.surface.divider,
  },
  label: {
    color: tokens.brand.onPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  labelIncluded: {
    color: tokens.text.secondary,
  },
});
