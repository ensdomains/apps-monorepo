CREATE TABLE "auth_attempts" (
	"nonce" text PRIMARY KEY NOT NULL,
	"redemption_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_attempts_expires_at_index" ON "auth_attempts" USING btree ("expires_at");