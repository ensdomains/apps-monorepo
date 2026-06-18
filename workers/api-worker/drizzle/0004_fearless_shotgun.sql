CREATE TABLE "crossmint_orders" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"crossmint_order_id" text,
	"user_id" uuid,
	"owner_address" text NOT NULL,
	"name" text NOT NULL,
	"duration" bigint NOT NULL,
	"secret" text NOT NULL,
	"commitment" text,
	"resolver_address" text,
	"payment_token" text,
	"voucher_token_id" text,
	"amount_paid" text,
	"commit_tx_hash" text,
	"register_tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crossmint_orders_crossmint_order_id_unique" UNIQUE("crossmint_order_id")
);
--> statement-breakpoint
ALTER TABLE "crossmint_orders" ADD CONSTRAINT "crossmint_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crossmint_orders_user_id_index" ON "crossmint_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crossmint_orders_owner_address_index" ON "crossmint_orders" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "crossmint_orders_status_index" ON "crossmint_orders" USING btree ("status");