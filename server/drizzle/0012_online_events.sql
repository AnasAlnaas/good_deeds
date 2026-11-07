CREATE TYPE "public"."location_type" AS ENUM('in_person', 'online');--> statement-breakpoint
CREATE TYPE "public"."meeting_platform" AS ENUM('zoom', 'meet', 'teams', 'telegram', 'other');--> statement-breakpoint
CREATE TABLE "meeting_link_reminders" (
	"event_id" text PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "address_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_type" "location_type" DEFAULT 'in_person' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "meeting_platform" "meeting_platform";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "meeting_link_reminders" ADD CONSTRAINT "meeting_link_reminders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_place_matches_type" CHECK (("events"."location_type" = 'in_person' and "events"."lat" is not null and "events"."lng" is not null and "events"."address_text" is not null and "events"."meeting_url" is null)
        or ("events"."location_type" = 'online' and "events"."meeting_platform" is not null and "events"."meeting_url" is not null and "events"."lat" is null and "events"."lng" is null));