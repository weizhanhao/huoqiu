import type { Metadata } from "next";

import { RelationPage } from "../../../../features/account/relation-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "查看该账号的粉丝名单，可直接回关",
  title: "粉丝 · 火球",
};

export default async function FollowersPage({
  params,
}: Readonly<{ params: Promise<{ userId: string }> }>) {
  return <RelationPage kind="followers" params={params} />;
}
