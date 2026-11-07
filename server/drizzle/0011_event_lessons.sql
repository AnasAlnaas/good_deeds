CREATE TABLE "event_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_completions" (
	"lesson_id" text NOT NULL,
	"user_id" text NOT NULL,
	"learned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_completions_lesson_id_user_id_pk" PRIMARY KEY("lesson_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "event_lessons" ADD CONSTRAINT "event_lessons_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_lesson_id_event_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."event_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_lessons_order" ON "event_lessons" USING btree ("event_id","order_index");--> statement-breakpoint
CREATE INDEX "lesson_completions_user" ON "lesson_completions" USING btree ("user_id","learned_at");