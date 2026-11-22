CREATE TABLE "almost_full_notices" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "almost_full_notices_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "follow_prompts" (
	"user_id" text NOT NULL,
	"kind" "follow_kind" NOT NULL,
	"target_id" text NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "follow_prompts_user_id_kind_target_id_pk" PRIMARY KEY("user_id","kind","target_id")
);
--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "keywords" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "almost_full_notices" ADD CONSTRAINT "almost_full_notices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "almost_full_notices" ADD CONSTRAINT "almost_full_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_prompts" ADD CONSTRAINT "follow_prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "almost_full_notices_user" ON "almost_full_notices" USING btree ("user_id","sent_at");
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'تدريس
تعليم
دروس
درس
دورة
محاضرة
تقوية
teach
tutor
lesson
course' WHERE "id" = 'teaching';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'اسعاف
إسعاف
اسعافات
جروح
first aid
cpr' WHERE "id" = 'first_aid';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'تمريض
ممرض
مرضى
مسنين
رعاية
nurse
patients
elderly' WHERE "id" = 'nursing';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'توصيل
سيارة
سائق
نقل
سلال
driv
deliver
transport' WHERE "id" = 'driving';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'تصوير
صور
توثيق
photo
camera' WHERE "id" = 'photography';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'تصميم
ملصق
منشور
لافتة
design
poster
flyer' WHERE "id" = 'design';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'طبخ
وجبات
مطبخ
افطار
إفطار
طعام
cook
meal
kitchen
iftar' WHERE "id" = 'cooking';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'نجارة
صيانة
اصلاح
إصلاح
تركيب
دهان
repair
carpent
paint
fix' WHERE "id" = 'carpentry';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'زراعة
تشجير
اشجار
أشجار
شتلات
حديقة
plant
tree
garden
farm' WHERE "id" = 'farming';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'تنظيم
تنسيق
حملة
استقبال
organi
coordinat
campaign' WHERE "id" = 'organizing';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'انجليزي
إنجليزي
ترجمة
لغة
english
translat
language' WHERE "id" = 'languages';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'قران
قرآن
تحفيظ
تجويد
حفظ
quran
tajweed' WHERE "id" = 'quran';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'اطفال
أطفال
ايتام
أيتام
تلاميذ
طلاب
children
kids
orphan' WHERE "id" = 'children';
--> statement-breakpoint
UPDATE "skills" SET "keywords" = 'حاسوب
كمبيوتر
برمجة
تقنية
انترنت
computer
coding
laptop' WHERE "id" = 'computers';
