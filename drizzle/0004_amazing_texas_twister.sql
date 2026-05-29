ALTER TABLE "bill_default_line_tags" DROP CONSTRAINT "bill_default_line_tags_tag_id_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "loan_default_line_tags" DROP CONSTRAINT "loan_default_line_tags_tag_id_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "transaction_line_tags" DROP CONSTRAINT "transaction_line_tags_tag_id_tags_id_fk";
--> statement-breakpoint
DROP INDEX "tags_workspace_name_unique";--> statement-breakpoint
ALTER TABLE "bill_default_line_tags" ADD CONSTRAINT "bill_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_default_line_tags" ADD CONSTRAINT "loan_default_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_line_tags" ADD CONSTRAINT "transaction_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_unique" ON "tags" USING btree ("workspace_id","name");--> statement-breakpoint
ALTER TABLE "tags" DROP COLUMN "deleted_at";