CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"otp_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "email_verifications_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
-- Old email setup cannot be resumed. SendGrid may have changed an unverified
-- email to bounced or unsubscribed, so use proof rather than current status.
DELETE FROM "user_channels" WHERE "channel" = 'email' AND "verified_at" IS NULL;--> statement-breakpoint
-- A previously verified email could have returned to pending during retry.
-- Keep the established association, but do not resume delivery automatically.
UPDATE "user_channels" SET "status" = 'disabled', "status_reason" = COALESCE("status_reason", 'LEGACY_REVERIFICATION_PENDING') WHERE "channel" = 'email' AND "status" = 'pending';--> statement-breakpoint
-- Telegram Login already established association. Legacy pending meant the
-- bot returned 403; /start restores disabled rows with this exact reason.
UPDATE "user_channels" SET "status" = 'disabled', "status_reason" = 'FORBIDDEN_BY_TELEGRAM' WHERE "channel" = 'telegram' AND "status" = 'pending';--> statement-breakpoint
UPDATE "user_channels" SET "status" = 'disabled', "status_reason" = COALESCE("status_reason", 'LEGACY_UNAVAILABLE') WHERE "status" = 'pending';--> statement-breakpoint
DROP TABLE "channel_verifications";--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channels" DROP COLUMN "last_verification_sent_at";--> statement-breakpoint
ALTER TABLE "user_channels" DROP COLUMN "verification_attempts";
