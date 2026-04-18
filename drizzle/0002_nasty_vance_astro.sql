ALTER TABLE "accounts" DROP CONSTRAINT "accounts_account_group_id_account_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "account_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_account_group_id_account_groups_id_fk" FOREIGN KEY ("account_group_id") REFERENCES "public"."account_groups"("id") ON DELETE restrict ON UPDATE no action;