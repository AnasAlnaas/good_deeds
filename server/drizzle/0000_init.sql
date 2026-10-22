CREATE TYPE "public"."end_source" AS ENUM('live', 'backdated', 'auto_closed');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'running', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."gender_category" AS ENUM('male', 'female', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('pending', 'confirmed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."pillar" AS ENUM('spiritual', 'mental', 'physical');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending_terms', 'joined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('member', 'supervisor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."start_source" AS ENUM('live', 'backdated');--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"start_source" "start_source" NOT NULL,
	"ended_at" timestamp with time zone,
	"end_source" "end_source",
	"hours" numeric(6, 2),
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"participant_status" "participant_status" DEFAULT 'pending' NOT NULL,
	"participant_acted_at" timestamp with time zone,
	CONSTRAINT "attendance_ends_after_start" CHECK ("attendance"."ended_at" is null or "attendance"."ended_at" > "attendance"."started_at")
);
--> statement-breakpoint
CREATE TABLE "branch_pillars" (
	"branch_id" text NOT NULL,
	"pillar" "pillar" NOT NULL,
	CONSTRAINT "branch_pillars_branch_id_pillar_pk" PRIMARY KEY("branch_id","pillar")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"source_ref" text NOT NULL,
	"is_agreed" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_branches" (
	"event_id" text NOT NULL,
	"branch_id" text NOT NULL,
	CONSTRAINT "event_branches_event_id_branch_id_pk" PRIMARY KEY("event_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "event_organizers" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "event_organizers_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "event_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"text" text,
	"image_url" text,
	"audio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"subtype" text NOT NULL,
	"image_url" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"address_text" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"gender_category" "gender_category" NOT NULL,
	"base_points" integer NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"terms_locked_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_ends_after_start" CHECK ("events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_capacity_positive" CHECK ("events"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"level" integer PRIMARY KEY NOT NULL,
	"min_points" integer NOT NULL,
	"can_create_events" boolean NOT NULL,
	"can_report" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"pillar" "pillar" NOT NULL,
	"points" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "registration_status" NOT NULL,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"registration_id" text NOT NULL,
	"term_id" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"gender" "gender" NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"city" text NOT NULL,
	"avatar_url" text,
	"role" "role" DEFAULT 'member' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"total_points" numeric(10, 2) DEFAULT 0 NOT NULL,
	"is_association_member" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_pillars" ADD CONSTRAINT "branch_pillars_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_branches" ADD CONSTRAINT "event_branches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_branches" ADD CONSTRAINT "event_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_organizers" ADD CONSTRAINT "event_organizers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_organizers" ADD CONSTRAINT "event_organizers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_terms" ADD CONSTRAINT "event_terms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_acceptances" ADD CONSTRAINT "term_acceptances_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_acceptances" ADD CONSTRAINT "term_acceptances_term_id_event_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."event_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_event_user" ON "attendance" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "attendance_user" ON "attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attendance_open" ON "attendance" USING btree ("event_id") WHERE "attendance"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "event_organizers_user" ON "event_organizers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_terms_order" ON "event_terms" USING btree ("event_id","order_index");--> statement-breakpoint
CREATE INDEX "login_codes_phone" ON "login_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "points_ledger_user" ON "points_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_event_user" ON "registrations" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "registrations_user" ON "registrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "term_acceptances_once" ON "term_acceptances" USING btree ("registration_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_active" ON "users" USING btree ("phone") WHERE "users"."deleted_at" is null;