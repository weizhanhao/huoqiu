CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_post_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"revision" bigint NOT NULL,
	"editor_id" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"source_event_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"card_type" text NOT NULL,
	"card_payload" jsonb NOT NULL,
	"ranking_value" numeric(38, 18) NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_ranking_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"source_event_id" uuid NOT NULL,
	"algorithm_version" text NOT NULL,
	"ranked_items" jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"avatar_url" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_users" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"normalized_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"exchange_id" text NOT NULL,
	"trading_date" date NOT NULL,
	"session_state" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"market" text NOT NULL,
	"timezone" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_pinyin" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instrument_type" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"instrument_id" text NOT NULL,
	"exchange_id" text NOT NULL,
	"market" text NOT NULL,
	"symbol" text NOT NULL,
	"symbol_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_bars" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"listing_id" text NOT NULL,
	"interval" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"open_price" numeric(38, 18) NOT NULL,
	"high_price" numeric(38, 18) NOT NULL,
	"low_price" numeric(38, 18) NOT NULL,
	"close_price" numeric(38, 18) NOT NULL,
	"volume" numeric(38, 18) NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_entitlement_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"market" text NOT NULL,
	"entitlement" text NOT NULL,
	"valid_until" timestamp with time zone,
	"source_event_id" uuid,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"listing_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"revision" bigint NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"observed_value" numeric(38, 18) NOT NULL,
	"source_event_id" uuid,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"observation_id" text NOT NULL,
	"provider" text NOT NULL,
	"listing_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"revision" bigint NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"bid_price" numeric(38, 18),
	"bid_quantity" numeric(38, 18),
	"ask_price" numeric(38, 18),
	"ask_quantity" numeric(38, 18),
	"last_price" numeric(38, 18) NOT NULL,
	"last_quantity" numeric(38, 18),
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_appeals" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"decision_id" text NOT NULL,
	"appellant_id" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"primary_report_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"assigned_reviewer_id" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"source_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"evidence_type" text NOT NULL,
	"storage_reference" text NOT NULL,
	"digest" text NOT NULL,
	"submitted_by_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"channel" text NOT NULL,
	"attempt" bigint NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"attempted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_read_state" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"watermark_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"canonical_key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_event_id" uuid NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_admin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"details" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" text NOT NULL,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_version" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"listing_id" text,
	"quantity" numeric(38, 18),
	"price" numeric(38, 18),
	"amount" numeric(38, 18) NOT NULL,
	"fees" numeric(38, 18) DEFAULT '0' NOT NULL,
	"currency" text NOT NULL,
	"reversal_of_id" text,
	"posted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_position_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"average_cost" numeric(38, 18) NOT NULL,
	"market_value" numeric(38, 18) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source_event_id" uuid NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_valuation_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"total_value" numeric(38, 18) NOT NULL,
	"cash_value" numeric(38, 18) NOT NULL,
	"currency" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"base_currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"document_type" text NOT NULL,
	"document_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"source_event_id" uuid NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"parent_comment_id" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_follows" (
	"id" text PRIMARY KEY NOT NULL,
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reaction_type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"watchlist_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post_revisions" ADD CONSTRAINT "content_post_revisions_post_id_content_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_channel_id_feed_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."feed_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_ranking_snapshots" ADD CONSTRAINT "feed_ranking_snapshots_channel_id_feed_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."feed_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_profiles" ADD CONSTRAINT "identity_profiles_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_calendars" ADD CONSTRAINT "exchange_calendars_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_observation_id_market_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."market_observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_decision_id_moderation_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."moderation_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_audit" ADD CONSTRAINT "moderation_audit_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_primary_report_id_moderation_reports_id_fk" FOREIGN KEY ("primary_report_id") REFERENCES "public"."moderation_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_evidence" ADD CONSTRAINT "moderation_evidence_case_id_moderation_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."moderation_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_ledger_entries" ADD CONSTRAINT "portfolio_ledger_entries_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_ledger_entries" ADD CONSTRAINT "portfolio_ledger_entries_reversal_of_id_portfolio_ledger_entries_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."portfolio_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_position_projection" ADD CONSTRAINT "portfolio_position_projection_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_valuation_snapshots" ADD CONSTRAINT "portfolio_valuation_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_parent_comment_id_social_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."social_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_unique" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_unique" ON "auth_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_users_email_unique" ON "auth_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "content_post_revisions_post_revision_unique" ON "content_post_revisions" USING btree ("post_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "content_posts_author_client_request_unique" ON "content_posts" USING btree ("author_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_channels_key_unique" ON "feed_channels" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_channel_source_event_unique" ON "feed_items" USING btree ("channel_id","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_ranking_channel_source_event_unique" ON "feed_ranking_snapshots" USING btree ("channel_id","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_profiles_user_unique" ON "identity_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_users_subject_unique" ON "identity_users" USING btree ("subject");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_users_normalized_email_unique" ON "identity_users" USING btree ("normalized_email") WHERE "identity_users"."normalized_email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_calendars_exchange_date_unique" ON "exchange_calendars" USING btree ("exchange_id","trading_date");--> statement-breakpoint
CREATE UNIQUE INDEX "exchanges_code_unique" ON "exchanges" USING btree ("code");--> statement-breakpoint
CREATE INDEX "instruments_name_trgm_idx" ON "instruments" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "instruments_name_pinyin_trgm_idx" ON "instruments" USING gin ("name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "instruments_aliases_trgm_idx" ON "instruments" USING gin (("aliases"::text) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "listings_market_symbol_unique" ON "listings" USING btree ("market","symbol");--> statement-breakpoint
CREATE INDEX "listings_symbol_trgm_idx" ON "listings" USING gin ("symbol" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "listings_symbol_aliases_trgm_idx" ON "listings" USING gin (("symbol_aliases"::text) gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "market_bars_listing_interval_start_revision_unique" ON "market_bars" USING btree ("provider","listing_id","interval","starts_at","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "market_entitlement_subject_market_unique" ON "market_entitlement_projection" USING btree ("subject_id","market");--> statement-breakpoint
CREATE UNIQUE INDEX "market_observations_provider_listing_sequence_revision_unique" ON "market_observations" USING btree ("provider","listing_id","sequence","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "market_quotes_provider_listing_sequence_revision_unique" ON "market_quotes" USING btree ("provider","listing_id","sequence","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_reports_target_reporter_reason_unique" ON "moderation_reports" USING btree ("target_type","target_id","reporter_id","reason_code");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_attempt_unique" ON "notification_delivery_attempts" USING btree ("notification_id","channel","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_read_state_recipient_unique" ON "notification_read_state" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_recipient_canonical_key_unique" ON "notifications" USING btree ("recipient_id","canonical_key");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_admin_audit_event_unique" ON "operations_admin_audit" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_key_unique" ON "idempotency_records" USING btree ("scope","key");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_receipts_consumer_event_unique" ON "inbox_receipts" USING btree ("consumer","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_id_unique" ON "outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_ledger_portfolio_client_request_unique" ON "portfolio_ledger_entries" USING btree ("portfolio_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_position_portfolio_listing_unique" ON "portfolio_position_projection" USING btree ("portfolio_id","listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_valuation_portfolio_as_of_unique" ON "portfolio_valuation_snapshots" USING btree ("portfolio_id","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "search_documents_type_document_unique" ON "search_documents" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_blocks_actor_target_unique" ON "social_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_bookmarks_actor_target_unique" ON "social_bookmarks" USING btree ("actor_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_follows_actor_target_unique" ON "social_follows" USING btree ("follower_id","followee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_reactions_actor_target_type_unique" ON "social_reactions" USING btree ("actor_id","target_type","target_id","reaction_type");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_list_listing_unique" ON "watchlist_items" USING btree ("watchlist_id","listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_owner_kind_unique" ON "watchlists" USING btree ("owner_id","kind");