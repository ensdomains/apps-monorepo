ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_delivery_unique";--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "channel_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_id_user_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."user_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Bind existing deliveries to their source channel only where exactly one
-- channel of the recipient matches the exact type and target, and that channel
-- was already established when the delivery was created. A channel removed
-- and re-created with the same target is not the source of older deliveries,
-- so those rows, like deliveries of removed channels, stay unbound (NULL).
UPDATE "notification_deliveries" AS "delivery"
SET "channel_id" = "source"."channel_id"
FROM (
	SELECT "nd"."id" AS "delivery_id", (array_agg("uc"."id"))[1] AS "channel_id"
	FROM "notification_deliveries" AS "nd"
	INNER JOIN "notifications" AS "n" ON "n"."id" = "nd"."notification_id"
	INNER JOIN "user_channels" AS "uc"
		ON "uc"."user_id" = "n"."user_id"
		AND "uc"."channel" = "nd"."channel"
		AND "uc"."target" = "nd"."target"
		AND "uc"."verified_at" <= "nd"."created_at"
	GROUP BY "nd"."id"
	HAVING count(*) = 1
) AS "source"
WHERE "delivery"."id" = "source"."delivery_id";--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP COLUMN "target";--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_delivery_unique" UNIQUE("notification_id","channel_id");