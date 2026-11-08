CREATE TABLE "lesson_images" (
	"id" text PRIMARY KEY NOT NULL,
	"jpeg" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_lessons" ADD COLUMN "image_id" text;--> statement-breakpoint
ALTER TABLE "lesson_images" ADD CONSTRAINT "lesson_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_lessons" ADD CONSTRAINT "event_lessons_image_id_lesson_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."lesson_images"("id") ON DELETE no action ON UPDATE no action;