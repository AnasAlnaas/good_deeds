CREATE TYPE "public"."notice_kind" AS ENUM('announcement', 'question');--> statement-breakpoint
CREATE TYPE "public"."notice_reaction" AS ENUM('noted', 'agree', 'disagree', 'undecided', 'sad');--> statement-breakpoint
CREATE TABLE "event_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" "notice_kind" DEFAULT 'announcement' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_reactions" (
	"notice_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" "notice_reaction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_reactions_notice_id_user_id_pk" PRIMARY KEY("notice_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "event_organizers" ADD COLUMN "added_by" text;--> statement-breakpoint
ALTER TABLE "event_notices" ADD CONSTRAINT "event_notices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notices" ADD CONSTRAINT "event_notices_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reactions" ADD CONSTRAINT "notice_reactions_notice_id_event_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."event_notices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reactions" ADD CONSTRAINT "notice_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_notices_event" ON "event_notices" USING btree ("event_id","created_at");--> statement-breakpoint
ALTER TABLE "event_organizers" ADD CONSTRAINT "event_organizers_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;