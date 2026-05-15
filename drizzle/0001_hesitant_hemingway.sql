CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid,
	"subcategory_id" uuid,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "budgets_target_xor" CHECK (("budgets"."category_id" IS NULL) <> ("budgets"."subcategory_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_workspace_category_currency_unique" ON "budgets" USING btree ("workspace_id","category_id","currency") WHERE "budgets"."deleted_at" IS NULL AND "budgets"."subcategory_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_workspace_subcategory_currency_unique" ON "budgets" USING btree ("workspace_id","subcategory_id","currency") WHERE "budgets"."deleted_at" IS NULL AND "budgets"."category_id" IS NULL;--> statement-breakpoint
CREATE INDEX "budgets_workspace_idx" ON "budgets" USING btree ("workspace_id");