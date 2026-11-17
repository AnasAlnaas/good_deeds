CREATE TYPE "public"."institution_kind" AS ENUM('association', 'foundation', 'school', 'university', 'mosque', 'company', 'team', 'other');--> statement-breakpoint
CREATE TYPE "public"."institution_role" AS ENUM('representative', 'member');--> statement-breakpoint
CREATE TYPE "public"."institution_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pending', 'confirmed');--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE 'approve_institution';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE 'reject_institution';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE 'add_representative';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE 'remove_representative';--> statement-breakpoint
CREATE TABLE "institution_members" (
	"institution_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "institution_role" NOT NULL,
	"status" "membership_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "institution_members_institution_id_user_id_pk" PRIMARY KEY("institution_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "institution_kind" NOT NULL,
	"status" "institution_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "institution_id" text;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_members" ADD CONSTRAINT "institution_members_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institution_members_user" ON "institution_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "institutions_status" ON "institutions" USING btree ("status","name");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_institution" ON "events" USING btree ("institution_id");