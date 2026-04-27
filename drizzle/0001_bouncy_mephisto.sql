ALTER TABLE "accounts" ADD COLUMN "recurring_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_recurring_plan_id_recurring_plans_id_fk" FOREIGN KEY ("recurring_plan_id") REFERENCES "public"."recurring_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plan_default_lines" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "transaction_lines" DROP COLUMN "recurring_plan_role";--> statement-breakpoint
DROP TYPE "public"."recurring_plan_role";