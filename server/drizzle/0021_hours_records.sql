CREATE TYPE "public"."outside_hours_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"institution_id" text,
	"hours" numeric(8, 2) NOT NULL,
	"events" integer NOT NULL,
	"outside_hours" numeric(8, 2) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outside_hours" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"institution_id" text NOT NULL,
	"done_on" text NOT NULL,
	"minutes" integer NOT NULL,
	"description" text NOT NULL,
	"place" text,
	"image_id" text,
	"status" "outside_hours_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "outside_hours_minutes_range" CHECK ("outside_hours"."minutes" > 0 and "outside_hours"."minutes" <= 720)
);
--> statement-breakpoint
ALTER TABLE "points_ledger" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD COLUMN "outside_hours_id" text;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_hours" ADD CONSTRAINT "outside_hours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_hours" ADD CONSTRAINT "outside_hours_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_hours" ADD CONSTRAINT "outside_hours_image_id_lesson_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."lesson_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outside_hours" ADD CONSTRAINT "outside_hours_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificates_user" ON "certificates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outside_hours_user" ON "outside_hours" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outside_hours_institution" ON "outside_hours" USING btree ("institution_id","status");--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_outside_hours_id_outside_hours_id_fk" FOREIGN KEY ("outside_hours_id") REFERENCES "public"."outside_hours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_one_source" CHECK (("points_ledger"."event_id" is null) <> ("points_ledger"."outside_hours_id" is null));