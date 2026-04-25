CREATE TABLE "transaction_line_tags" (
	"line_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "transaction_line_tags_line_id_tag_id_pk" PRIMARY KEY("line_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "transaction_lines" DROP CONSTRAINT "transaction_lines_tag_id_tags_id_fk";
--> statement-breakpoint
DROP INDEX "transaction_lines_tag_idx";--> statement-breakpoint
ALTER TABLE "transaction_line_tags" ADD CONSTRAINT "transaction_line_tags_line_id_transaction_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."transaction_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_line_tags" ADD CONSTRAINT "transaction_line_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_line_tags_tag_idx" ON "transaction_line_tags" USING btree ("tag_id");--> statement-breakpoint
ALTER TABLE "transaction_lines" DROP COLUMN "tag_id";