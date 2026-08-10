import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  CommunityFeed,
  PostDetail,
  Publisher,
} from "../../../../../apps/web/src/features/community/community-experience";

const component = new URLSearchParams(window.location.search).get("component");
const experience =
  component === "post" ? (
    <PostDetail />
  ) : component === "publisher" ? (
    <Publisher />
  ) : (
    <CommunityFeed />
  );
const root = document.querySelector("#root");

if (!root) {
  throw new Error("Community component harness root is missing.");
}

createRoot(root).render(<StrictMode>{experience}</StrictMode>);
