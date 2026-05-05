CREATE TYPE "public"."account_type" AS ENUM('checking_savings', 'credit_card', 'loan');--> statement-breakpoint
CREATE TYPE "public"."bill_type" AS ENUM('utility', 'subscription', 'other');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer', 'adjustment');--> statement-breakpoint
CREATE TABLE "account_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"type" "account_type" NOT NULL,
	"credit_limit" bigint,
	"default_pay_from_account_id" uuid,
	"loan_id" uuid,
	"exclude_from_net_worth" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bill_default_line_tags" (
	"line_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "bill_default_line_tags_line_id_tag_id_pk" PRIMARY KEY("line_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "bill_default_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid,
	"amount" bigint
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "bill_type" NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"default_pay_from_account_id" uuid,
	"currency" char(3) NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "category_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "loan_default_line_tags" (
	"line_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "loan_default_line_tags_line_id_tag_id_pk" PRIMARY KEY("line_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "loan_default_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid,
	"amount" bigint
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"amount_per_period" bigint NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transaction_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_line_tags" (
	"line_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "transaction_line_tags_line_id_tag_id_pk" PRIMARY KEY("line_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "transaction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date,
	"type" "transaction_type" NOT NULL,
	"bill_id" uuid,
	"sort_key" integer,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_sort_key_matches_date" CHECK (("transactions"."date" IS NULL) = ("transactions"."sort_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_account_group_id_account_groups_id_fk" FOREIGN KEY ("account_group_id") REFERENCES "public"."account_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_default_pay_from_account_id_accounts_id_fk" FOREIGN KEY ("default_pay_from_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_default_line_tags" ADD CONSTRAINT "bill_default_line_tags_line_id_bill_default_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."bill_default_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_default_line_tags" ADD CONSTRAINT "bill_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_default_lines" ADD CONSTRAINT "bill_default_lines_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_default_lines" ADD CONSTRAINT "bill_default_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_default_lines" ADD CONSTRAINT "bill_default_lines_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_default_pay_from_account_id_accounts_id_fk" FOREIGN KEY ("default_pay_from_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_default_line_tags" ADD CONSTRAINT "loan_default_line_tags_line_id_loan_default_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."loan_default_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_default_line_tags" ADD CONSTRAINT "loan_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_default_lines" ADD CONSTRAINT "loan_default_lines_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_default_lines" ADD CONSTRAINT "loan_default_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_default_lines" ADD CONSTRAINT "loan_default_lines_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_legs" ADD CONSTRAINT "transaction_legs_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_legs" ADD CONSTRAINT "transaction_legs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_line_tags" ADD CONSTRAINT "transaction_line_tags_line_id_transaction_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."transaction_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_line_tags" ADD CONSTRAINT "transaction_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_groups_workspace_name_unique" ON "account_groups" USING btree ("workspace_id","name") WHERE "account_groups"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_account_group_name_unique" ON "accounts" USING btree ("account_group_id","name") WHERE "accounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_loan_unique" ON "accounts" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "bill_default_lines_bill_idx" ON "bill_default_lines" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_workspace_kind_name_unique" ON "categories" USING btree ("workspace_id","kind","name") WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "loan_default_lines_loan_idx" ON "loan_default_lines" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subcategories_category_name_unique" ON "subcategories" USING btree ("category_id","name") WHERE "subcategories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_unique" ON "tags" USING btree ("workspace_id","name") WHERE "tags"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transaction_legs_tx_idx" ON "transaction_legs" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_legs_account_idx" ON "transaction_legs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transaction_line_tags_tag_idx" ON "transaction_line_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "transaction_lines_tx_idx" ON "transaction_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_lines_category_idx" ON "transaction_lines" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_workspace_date_idx" ON "transactions" USING btree ("workspace_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_workspace_date_sortkey_unique" ON "transactions" USING btree ("workspace_id","date","sort_key") WHERE "transactions"."date" IS NOT NULL;