import { useRouter } from "expo-router";
import { useState } from "react";

import { SettingsPanel } from "../src/components/five-tab/settings-panel";
import type { SettingsDensity } from "../src/features/five-tab/synthetic-fixture";
import { createD0BackHandler } from "../src/navigation/back-or-home";

export default function SettingsScreen() {
  const router = useRouter();
  const [density, setDensity] = useState<SettingsDensity>("comfortable");

  return (
    <SettingsPanel
      density={density}
      onBack={createD0BackHandler(router, "/profile")}
      onSelectDensity={setDensity}
    />
  );
}
