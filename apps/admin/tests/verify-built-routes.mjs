import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const home = await readFile(
  new URL("../.next/server/app/index.html", import.meta.url),
  "utf8",
);
const moderation = await readFile(
  new URL("../.next/server/app/moderation.html", import.meta.url),
  "utf8",
);

if (!home.includes('href="/admin/moderation"')) {
  throw new Error("Admin build must emit /admin/moderation");
}

if (home.includes('href="/admin/admin/moderation"')) {
  throw new Error("Admin build emitted a duplicated base path");
}

if (!moderation.includes("404: This page could not be found.")) {
  throw new Error(
    "Moderation route must remain denied in the production build",
  );
}
