export const approvedEventTypes = [
  "identity.user_registered",
  "content.post_submitted",
  "moderation.decision_recorded",
  "content.post_published",
  "content.post_hidden",
  "content.post_restored",
  "identity.user_suspended",
  "social.comment_submitted",
  "social.comment_published",
  "social.comment_hidden",
  "social.comment_restored",
  "social.reaction_changed",
  "watchlist.item_changed",
  "notification.created",
  "notification.read_watermark_advanced",
  "moderation.report_submitted",
  "portfolio.ledger_entry_posted",
  "market.quote_revised",
] as const;

export type ApprovedEventType = (typeof approvedEventTypes)[number];
