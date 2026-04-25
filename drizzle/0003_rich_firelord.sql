ALTER TYPE "public"."installment_frequency" RENAME TO "recurring_frequency";--> statement-breakpoint
ALTER TABLE "installment_plans" RENAME TO "recurring_plans";--> statement-breakpoint
ALTER TABLE "transactions" RENAME COLUMN "installment_plan_id" TO "recurring_plan_id";--> statement-breakpoint
ALTER TABLE "recurring_plans" DROP CONSTRAINT "installment_plans_group_id_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_installment_plan_id_installment_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_plan_id_recurring_plans_id_fk" FOREIGN KEY ("recurring_plan_id") REFERENCES "public"."recurring_plans"("id") ON DELETE set null ON UPDATE no action;