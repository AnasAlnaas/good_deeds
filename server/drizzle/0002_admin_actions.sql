CREATE TYPE "public"."admin_action" AS ENUM('change_role', 'create_event', 'update_event', 'publish_event', 'cancel_event', 'resolve_dispute');--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" "admin_action" NOT NULL,
	"target_id" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_actions_created" ON "admin_actions" USING btree ("created_at");