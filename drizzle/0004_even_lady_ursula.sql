CREATE TYPE "public"."recurring_plan_role" AS ENUM('principal', 'interest', 'fee');--> statement-breakpoint
ALTER TABLE "recurring_plans" RENAME COLUMN "total_amount" TO "amount_per_period";--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD COLUMN "principal_amount" bigint;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD COLUMN "recurring_plan_role" "recurring_plan_role";