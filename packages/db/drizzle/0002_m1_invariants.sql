ALTER TABLE "identity_users"
	ADD CONSTRAINT "identity_users_status_check"
	CHECK ("status" IN ('active', 'suspended', 'deleted'));
--> statement-breakpoint
ALTER TABLE "instruments"
	ADD CONSTRAINT "instruments_status_check"
	CHECK ("status" IN ('active', 'inactive'));
--> statement-breakpoint
ALTER TABLE "market_observations"
	ADD CONSTRAINT "market_observations_sequence_check" CHECK ("sequence" > 0),
	ADD CONSTRAINT "market_observations_revision_check" CHECK ("revision" >= 0),
	ADD CONSTRAINT "market_observations_value_check" CHECK ("observed_value" >= 0),
	ADD CONSTRAINT "market_observations_raw_check" CHECK (jsonb_typeof("raw") = 'object'),
	ADD CONSTRAINT "market_observations_lineage_unique"
		UNIQUE ("id", "provider", "listing_id", "sequence", "revision");
--> statement-breakpoint
ALTER TABLE "market_quotes"
	ADD CONSTRAINT "market_quotes_sequence_check" CHECK ("sequence" > 0),
	ADD CONSTRAINT "market_quotes_revision_check" CHECK ("revision" >= 0),
	ADD CONSTRAINT "market_quotes_prices_check" CHECK (
		"last_price" >= 0
		AND ("bid_price" IS NULL OR "bid_price" >= 0)
		AND ("ask_price" IS NULL OR "ask_price" >= 0)
		AND ("bid_price" IS NULL OR "ask_price" IS NULL OR "bid_price" <= "ask_price")
	),
	ADD CONSTRAINT "market_quotes_quantities_check" CHECK (
		("bid_quantity" IS NULL OR "bid_quantity" >= 0)
		AND ("ask_quantity" IS NULL OR "ask_quantity" >= 0)
		AND ("last_quantity" IS NULL OR "last_quantity" >= 0)
	),
	ADD CONSTRAINT "market_quotes_observation_lineage_fk"
		FOREIGN KEY ("observation_id", "provider", "listing_id", "sequence", "revision")
		REFERENCES "market_observations" ("id", "provider", "listing_id", "sequence", "revision");
--> statement-breakpoint
ALTER TABLE "market_bars"
	ADD CONSTRAINT "market_bars_revision_check" CHECK ("revision" >= 0),
	ADD CONSTRAINT "market_bars_time_check" CHECK ("ends_at" > "starts_at"),
	ADD CONSTRAINT "market_bars_values_check" CHECK (
		"open_price" >= 0
		AND "high_price" >= 0
		AND "low_price" >= 0
		AND "close_price" >= 0
		AND "volume" >= 0
		AND "low_price" <= "high_price"
		AND "low_price" <= "open_price"
		AND "low_price" <= "close_price"
		AND "high_price" >= "open_price"
		AND "high_price" >= "close_price"
	);
--> statement-breakpoint
ALTER TABLE "portfolio_ledger_entries"
	ADD CONSTRAINT "portfolio_ledger_fees_check" CHECK ("fees" >= 0),
	ADD CONSTRAINT "portfolio_ledger_price_check" CHECK ("price" IS NULL OR "price" >= 0),
	ADD CONSTRAINT "portfolio_ledger_reversal_check" CHECK ("reversal_of_id" IS NULL OR "reversal_of_id" <> "id");
--> statement-breakpoint
ALTER TABLE "outbox_events"
	ADD CONSTRAINT "outbox_events_version_check" CHECK ("aggregate_version" > 0),
	ADD CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0),
	ADD CONSTRAINT "outbox_events_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
	ADD CONSTRAINT "outbox_events_publish_time_check" CHECK ("published_at" IS NULL OR "published_at" >= "occurred_at");
--> statement-breakpoint
ALTER TABLE "inbox_receipts"
	ADD CONSTRAINT "inbox_receipts_completion_check" CHECK (
		("processed_at" IS NULL AND "outcome" IS NULL)
		OR (
			"processed_at" IS NOT NULL
			AND "processed_at" >= "received_at"
			AND "outcome" IS NOT NULL
			AND length(btrim("outcome")) > 0
		)
	);
--> statement-breakpoint
CREATE FUNCTION "m1_reject_append_only_mutation"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	RAISE EXCEPTION 'M1_APPEND_ONLY: %.% rejects %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "market_observations_append_only"
	BEFORE UPDATE OR DELETE ON "market_observations"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "market_quotes_append_only"
	BEFORE UPDATE OR DELETE ON "market_quotes"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "market_bars_append_only"
	BEFORE UPDATE OR DELETE ON "market_bars"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "content_post_revisions_append_only"
	BEFORE UPDATE OR DELETE ON "content_post_revisions"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "moderation_evidence_append_only"
	BEFORE UPDATE OR DELETE ON "moderation_evidence"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "moderation_decisions_append_only"
	BEFORE UPDATE OR DELETE ON "moderation_decisions"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "moderation_audit_append_only"
	BEFORE UPDATE OR DELETE ON "moderation_audit"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "feed_ranking_snapshots_append_only"
	BEFORE UPDATE OR DELETE ON "feed_ranking_snapshots"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "notification_delivery_attempts_append_only"
	BEFORE UPDATE OR DELETE ON "notification_delivery_attempts"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "portfolio_ledger_entries_append_only"
	BEFORE UPDATE OR DELETE ON "portfolio_ledger_entries"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "portfolio_valuation_snapshots_append_only"
	BEFORE UPDATE OR DELETE ON "portfolio_valuation_snapshots"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "operations_admin_audit_append_only"
	BEFORE UPDATE OR DELETE ON "operations_admin_audit"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE TRIGGER "idempotency_records_append_only"
	BEFORE UPDATE OR DELETE ON "idempotency_records"
	FOR EACH ROW EXECUTE FUNCTION "m1_reject_append_only_mutation"();
--> statement-breakpoint
CREATE FUNCTION "m1_guard_outbox_transition"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'M1_OUTBOX_MONOTONIC: delete rejected';
	END IF;
	IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
		OR NEW."event_type" IS DISTINCT FROM OLD."event_type"
		OR NEW."aggregate_type" IS DISTINCT FROM OLD."aggregate_type"
		OR NEW."aggregate_id" IS DISTINCT FROM OLD."aggregate_id"
		OR NEW."aggregate_version" IS DISTINCT FROM OLD."aggregate_version"
		OR NEW."payload" IS DISTINCT FROM OLD."payload"
		OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
		OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
		OR NEW."attempts" < OLD."attempts"
		OR (OLD."published_at" IS NOT NULL AND NEW."published_at" IS DISTINCT FROM OLD."published_at") THEN
		RAISE EXCEPTION 'M1_OUTBOX_MONOTONIC: immutable data or state regression';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "outbox_events_monotonic"
	BEFORE UPDATE OR DELETE ON "outbox_events"
	FOR EACH ROW EXECUTE FUNCTION "m1_guard_outbox_transition"();
--> statement-breakpoint
CREATE FUNCTION "m1_guard_inbox_transition"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'M1_INBOX_MONOTONIC: delete rejected';
	END IF;
	IF NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."consumer" IS DISTINCT FROM OLD."consumer"
		OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
		OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
		OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
		OR (OLD."processed_at" IS NOT NULL AND NEW."processed_at" IS DISTINCT FROM OLD."processed_at")
		OR (OLD."outcome" IS NOT NULL AND NEW."outcome" IS DISTINCT FROM OLD."outcome") THEN
		RAISE EXCEPTION 'M1_INBOX_MONOTONIC: immutable data or state regression';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "inbox_receipts_monotonic"
	BEFORE UPDATE OR DELETE ON "inbox_receipts"
	FOR EACH ROW EXECUTE FUNCTION "m1_guard_inbox_transition"();
