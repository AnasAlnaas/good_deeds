ALTER TYPE "public"."admin_action" ADD VALUE 'change_skill';--> statement-breakpoint
CREATE TABLE "event_skills" (
	"event_id" text NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "event_skills_event_id_skill_id_pk" PRIMARY KEY("event_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_interests" (
	"user_id" text NOT NULL,
	"event_class" text NOT NULL,
	CONSTRAINT "user_interests_user_id_event_class_pk" PRIMARY KEY("user_id","event_class")
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"user_id" text NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "user_skills_user_id_skill_id_pk" PRIMARY KEY("user_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "event_skills" ADD CONSTRAINT "event_skills_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_skills" ADD CONSTRAINT "event_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_skills_skill" ON "event_skills" USING btree ("skill_id");--> statement-breakpoint
-- The association's starting list of skills (shared/skills.ts STARTING_SKILLS); admins add more in the panel.
INSERT INTO "skills" ("id", "name_ar", "name_en", "is_active", "created_at") VALUES
('teaching', 'تدريس', 'Teaching', true, now()),
('first_aid', 'إسعافات أولية', 'First aid', true, now()),
('nursing', 'تمريض', 'Nursing', true, now()),
('driving', 'قيادة سيارة', 'Driving', true, now()),
('photography', 'تصوير', 'Photography', true, now()),
('design', 'تصميم', 'Design', true, now()),
('cooking', 'طبخ', 'Cooking', true, now()),
('carpentry', 'نجارة وصيانة', 'Carpentry and repairs', true, now()),
('farming', 'زراعة', 'Farming', true, now()),
('organizing', 'تنظيم فعاليات', 'Organising events', true, now()),
('languages', 'لغات أجنبية', 'Foreign languages', true, now()),
('quran', 'حفظ القرآن وتجويده', 'Quran memorisation and tajweed', true, now()),
('children', 'العمل مع الأطفال', 'Working with children', true, now()),
('computers', 'حاسوب وتقنية', 'Computers and tech', true, now())
ON CONFLICT DO NOTHING;
