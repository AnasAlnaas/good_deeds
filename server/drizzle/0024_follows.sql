CREATE TYPE "public"."follow_kind" AS ENUM('institution', 'person', 'class');--> statement-breakpoint
CREATE TABLE "follow_notices" (
	"event_id" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" text NOT NULL,
	"kind" "follow_kind" NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follows_user_id_kind_target_id_pk" PRIMARY KEY("user_id","kind","target_id")
);
--> statement-breakpoint
ALTER TABLE "follow_notices" ADD CONSTRAINT "follow_notices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_target" ON "follows" USING btree ("kind","target_id");