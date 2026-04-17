CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_group_name_unique";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "kind" "category_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_kind_name_unique" UNIQUE("group_id","kind","name");