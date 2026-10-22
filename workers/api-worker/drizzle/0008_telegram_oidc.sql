CREATE TABLE "telegram_login_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"state_digest" text NOT NULL,
	"code_verifier" text,
	"nonce" text,
	"redirect_uri" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "telegram_login_attempts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "telegram_login_attempts_state_digest_unique" UNIQUE("state_digest")
);
--> statement-breakpoint
ALTER TABLE "telegram_login_attempts" ADD CONSTRAINT "telegram_login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_login_attempts_expiry_index" ON "telegram_login_attempts" USING btree ("expires_at");