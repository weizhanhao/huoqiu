import type { Metadata } from "next";

import { RelationPage } from "../../../../features/account/relation-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "查看该账号关注的人",
  title: "关注 · 火球",
};

export default async function FollowingPage({
  params,
}: Readonly<{ params: Promise<{ userId: string }> }>) {
  return <RelationPage kind="following" params={params} />;
}
