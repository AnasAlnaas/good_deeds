CREATE TYPE "public"."report_category" AS ENUM('behaviour', 'safety', 'event', 'app', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'handled');--> statement-breakpoint
CREATE TYPE "public"."warning_status" AS ENUM('active', 'appealed', 'upheld', 'withdrawn');--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE 'handle_report';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE 'uphold_warning';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE 'withdraw_warning';--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"category" "report_category" NOT NULL,
	"event_id" text,
	"subject_id" text,
	"note" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"handled_by" text,
	"handled_at" timestamp with time zone,
	"handled_note" text
);
--> statement-breakpoint
CREATE TABLE "warnings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"issued_by" text NOT NULL,
	"event_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" "warning_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"appealed_at" timestamp with time zone,
	"appeal_reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "warnings_user" ON "warnings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warnings_once" ON "warnings" USING btree ("event_id","user_id","issued_by") WHERE "warnings"."status" <> 'withdrawn';