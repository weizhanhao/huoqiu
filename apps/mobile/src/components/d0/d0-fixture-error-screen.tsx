import { tokens } from "@huoqiu/native-ui";
import { StyleSheet, View } from "react-native";

import { PageState } from "./page-state";
import { ScreenHeader } from "./screen-header";

type D0FixtureErrorScreenProperties = Readonly<{
  errorMessage: string;
  onBack?: (() => void) | undefined;
  onRetry: () => void;
  subtitle?: string | undefined;
  title: string;
}>;

export function D0FixtureErrorScreen({
  errorMessage,
  onBack,
  onRetry,
  subtitle,
  title,
}: D0FixtureErrorScreenProperties) {
  return (
    <View style={styles.viewport}>
      <ScreenHeader
        {...(onBack === undefined ? {} : { onBack })}
        {...(subtitle === undefined ? {} : { subtitle })}
        title={title}
      />
      <View style={styles.stateWrap}>
        <PageState
          errorMessage={errorMessage}
          onRetry={onRetry}
          state="error"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: tokens.surface.canvas,
    flex: 1,
  },
  stateWrap: {
    flex: 1,
    padding: 16,
  },
});
