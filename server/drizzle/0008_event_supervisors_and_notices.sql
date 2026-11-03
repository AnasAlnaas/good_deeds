CREATE TABLE "event_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_organizers" ADD COLUMN "added_by" text;--> statement-breakpoint
ALTER TABLE "event_notices" ADD CONSTRAINT "event_notices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notices" ADD CONSTRAINT "event_notices_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_notices_event" ON "event_notices" USING btree ("event_id","created_at");--> statement-breakpoint
ALTER TABLE "event_organizers" ADD CONSTRAINT "event_organizers_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;