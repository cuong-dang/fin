ALTER TABLE "transactions" DROP CONSTRAINT "transactions_recurring_plan_id_recurring_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "recurring_plan_id";