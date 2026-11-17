ALTER TYPE "public"."admin_action" ADD VALUE 'remove_cover';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cover_image_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_image_id_lesson_images_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."lesson_images"("id") ON DELETE no action ON UPDATE no action;