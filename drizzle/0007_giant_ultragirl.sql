ALTER TABLE "recurring_plan_default_line_tags" DROP CONSTRAINT "recurring_plan_default_line_tags_tag_id_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "recurring_plans" DROP CONSTRAINT "recurring_plans_default_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_default_line_tags" DROP CONSTRAINT "subscription_default_line_tags_tag_id_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_default_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "transaction_line_tags" DROP CONSTRAINT "transaction_line_tags_tag_id_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_recurring_plan_id_recurring_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "account_groups" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurring_plan_default_line_tags" ADD CONSTRAINT "recurring_plan_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_default_account_id_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_default_line_tags" ADD CONSTRAINT "subscription_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_default_account_id_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_line_tags" ADD CONSTRAINT "transaction_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_plan_id_recurring_plans_id_fk" FOREIGN KEY ("recurring_plan_id") REFERENCES "public"."recurring_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;