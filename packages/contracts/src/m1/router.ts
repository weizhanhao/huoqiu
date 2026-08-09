import { initContract } from "@ts-rest/core";

import { authContract } from "./auth.contract.js";
import { contentSocialContract } from "./content-social.contract.js";
import { feedWatchlistContract } from "./feed-watchlist.contract.js";
import { instrumentContract } from "./instrument.contract.js";
import { notificationModerationContract } from "./notification-moderation.contract.js";
import { portfolioContract } from "./portfolio.contract.js";

const c = initContract();

export const m1Router = c.router({
  ...authContract,
  ...instrumentContract,
  ...feedWatchlistContract,
  ...contentSocialContract,
  ...notificationModerationContract,
  ...portfolioContract,
});
