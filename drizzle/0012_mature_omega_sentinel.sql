-- Pre-migration backfill: any existing rows that were created via the
-- short-lived `payment` type (sub charges) are remapped to `expense`. Their
-- `subscription_id` link is preserved, which is the rollback's intended
-- final state — sub charges live as expense + subscription_id.
UPDATE "transactions" SET "type" = 'expense' WHERE "type" = 'payment';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."transaction_type";--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer', 'adjustment');--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "type" SET DATA TYPE "public"."transaction_type" USING "type"::"public"."transaction_type";
