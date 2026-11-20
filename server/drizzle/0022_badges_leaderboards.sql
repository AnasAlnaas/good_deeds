ALTER TYPE "public"."admin_action" ADD VALUE 'set_hijri_month';--> statement-breakpoint
CREATE TABLE "hijri_adjustments" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"days" integer NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hijri_adjustments_year_month_pk" PRIMARY KEY("year","month"),
	CONSTRAINT "hijri_adjustments_days" CHECK ("hijri_adjustments"."days" between -1 and 1)
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_on_leaderboards" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hijri_adjustments" ADD CONSTRAINT "hijri_adjustments_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_badges_to_push" ON "user_badges" USING btree ("earned_at") WHERE "user_badges"."pushed_at" is null;