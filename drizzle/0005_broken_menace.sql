ALTER TYPE "public"."recurring_frequency" ADD VALUE 'quarterly';--> statement-breakpoint
ALTER TYPE "public"."recurring_frequency" ADD VALUE 'yearly';--> statement-breakpoint
CREATE TABLE "subscription_default_line_tags" (
	"line_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "subscription_default_line_tags_line_id_tag_id_pk" PRIMARY KEY("line_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_default_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"first_charge_date" date NOT NULL,
	"default_account_id" uuid,
	"cancelled_at" timestamp with time zone,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "subscription_default_line_tags" ADD CONSTRAINT "subscription_default_line_tags_line_id_subscription_default_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."subscription_default_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_default_line_tags" ADD CONSTRAINT "subscription_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_default_lines" ADD CONSTRAINT "subscription_default_lines_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_default_lines" ADD CONSTRAINT "subscription_default_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_default_lines" ADD CONSTRAINT "subscription_default_lines_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_default_account_id_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_default_line_tags_tag_idx" ON "subscription_default_line_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "subscription_default_lines_sub_idx" ON "subscription_default_lines" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_default_lines_category_idx" ON "subscription_default_lines" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;