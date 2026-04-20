ALTER TABLE "transactions" ADD COLUMN "sort_key" integer;--> statement-breakpoint
-- Backfill: existing processed rows get 1..N per (group_id, date)
-- ordered by created_at. Pending rows (date IS NULL) keep sort_key NULL.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY group_id, date ORDER BY created_at ASC) AS rn
    FROM "transactions"
   WHERE date IS NOT NULL
)
UPDATE "transactions" t
   SET sort_key = ranked.rn
  FROM ranked
 WHERE t.id = ranked.id;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_group_date_sortkey_unique" ON "transactions" USING btree ("group_id","date","sort_key") WHERE "transactions"."date" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sort_key_matches_date" CHECK (("transactions"."date" IS NULL) = ("transactions"."sort_key" IS NULL));
