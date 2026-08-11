import { useRouter } from "expo-router";

import { MessageCenter } from "../src/components/five-tab/message-center";
import { syntheticMessages } from "../src/features/five-tab/synthetic-fixture";
import { createD0BackHandler } from "../src/navigation/back-or-home";

export default function MessagesScreen() {
  const router = useRouter();

  return (
    <MessageCenter
      messages={syntheticMessages}
      onBack={createD0BackHandler(router, "/profile")}
    />
  );
}
