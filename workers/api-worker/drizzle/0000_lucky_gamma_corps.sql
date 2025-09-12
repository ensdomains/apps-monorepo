CREATE TABLE "users" (
	"address" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ens_eval_pointers" (
	"name" text PRIMARY KEY NOT NULL,
	"next_eval_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ens_names" (
	"name" text PRIMARY KEY NOT NULL,
	"expiry_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ens_watchers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_address" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "ens_watcher_unique" UNIQUE("user_address","name")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"name" text NOT NULL,
	"user_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "favorites_user_address_name_pk" PRIMARY KEY("user_address","name")
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "broadcasts_seen" (
	"user_address" text NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "broadcasts_seen_user_address_broadcast_id_pk" PRIMARY KEY("user_address","broadcast_id")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0,
	"provider_msg_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_address" text NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true,
	"extra_config" jsonb,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "notification_preference_unique" UNIQUE("user_address","kind","channel")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_address" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "user_channels" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"user_address" text NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"verified_at" timestamp with time zone,
	"status" text NOT NULL,
	"status_reason" text,
	"last_sent_at" timestamp with time zone,
	"last_bounce_at" timestamp with time zone,
	CONSTRAINT "user_channel_unique" UNIQUE("user_address","channel","target")
);
--> statement-breakpoint
ALTER TABLE "ens_eval_pointers" ADD CONSTRAINT "ens_eval_pointers_name_ens_names_name_fk" FOREIGN KEY ("name") REFERENCES "public"."ens_names"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ens_watchers" ADD CONSTRAINT "ens_watchers_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ens_watchers" ADD CONSTRAINT "ens_watchers_name_ens_names_name_fk" FOREIGN KEY ("name") REFERENCES "public"."ens_names"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts_seen" ADD CONSTRAINT "broadcasts_seen_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts_seen" ADD CONSTRAINT "broadcasts_seen_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;