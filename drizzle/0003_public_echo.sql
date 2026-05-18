ALTER TYPE "public"."transaction_type" ADD VALUE 'refund';--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "refunded_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_refunded_transaction_id_transactions_id_fk" FOREIGN KEY ("refunded_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_refunded_transaction_idx" ON "transactions" USING btree ("refunded_transaction_id");