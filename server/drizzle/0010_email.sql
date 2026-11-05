CREATE TYPE "public"."email_code_purpose" AS ENUM('sign_up', 'reset_password', 'change_email');--> statement-breakpoint
CREATE TABLE "email_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"purpose" "email_code_purpose" NOT NULL,
	"user_id" text,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_codes_email" ON "email_codes" USING btree ("email","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_active" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null;