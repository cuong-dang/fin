ALTER TABLE "account_groups" DROP CONSTRAINT "account_groups_group_name_unique";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_group_name_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_group_kind_name_unique";--> statement-breakpoint
ALTER TABLE "subcategories" DROP CONSTRAINT "subcategories_category_name_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_group_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "account_groups_group_name_unique" ON "account_groups" USING btree ("group_id","name") WHERE "account_groups"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_group_name_unique" ON "accounts" USING btree ("group_id","name") WHERE "accounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_group_kind_name_unique" ON "categories" USING btree ("group_id","kind","name") WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subcategories_category_name_unique" ON "subcategories" USING btree ("category_id","name") WHERE "subcategories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_group_name_unique" ON "tags" USING btree ("group_id","name") WHERE "tags"."deleted_at" IS NULL;