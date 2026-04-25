CREATE TABLE "recurring_plan_default_line_tags" (
	"line_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "recurring_plan_default_line_tags_line_id_tag_id_pk" PRIMARY KEY("line_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_plan_default_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_plan_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid,
	"role" "recurring_plan_role" NOT NULL,
	"amount" bigint,
	"currency" char(3) NOT NULL,
	"description" text
);
--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD COLUMN "default_account_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_plan_default_line_tags" ADD CONSTRAINT "recurring_plan_default_line_tags_line_id_recurring_plan_default_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."recurring_plan_default_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plan_default_line_tags" ADD CONSTRAINT "recurring_plan_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plan_default_lines" ADD CONSTRAINT "recurring_plan_default_lines_recurring_plan_id_recurring_plans_id_fk" FOREIGN KEY ("recurring_plan_id") REFERENCES "public"."recurring_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plan_default_lines" ADD CONSTRAINT "recurring_plan_default_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_plan_default_lines" ADD CONSTRAINT "recurring_plan_default_lines_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_plan_default_line_tags_tag_idx" ON "recurring_plan_default_line_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "recurring_plan_default_lines_plan_idx" ON "recurring_plan_default_lines" USING btree ("recurring_plan_id");--> statement-breakpoint
CREATE INDEX "recurring_plan_default_lines_category_idx" ON "recurring_plan_default_lines" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "recurring_plans" ADD CONSTRAINT "recurring_plans_default_account_id_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;