ALTER TYPE "public"."admin_action" ADD VALUE 'reject_event';--> statement-breakpoint
ALTER TYPE "public"."event_status" ADD VALUE 'rejected';--> statement-breakpoint
CREATE TABLE "user_photos" (
	"user_id" text PRIMARY KEY NOT NULL,
	"jpeg" "bytea" NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;