DROP INDEX "transactions_group_date_sortkey_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_group_date_sortkey_unique" ON "transactions" USING btree ("group_id","date","sort_key") WHERE "transactions"."date" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "deleted_at";