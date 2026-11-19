ALTER TABLE "users" ALTER COLUMN "level" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "event_organizers" ADD COLUMN "pledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "base_points";--> statement-breakpoint
-- Owner's decisions (2026-11-18/19): levels 0 to 10, 7500 points in all; level 5 (1500 points) unlocks proposing events (shared/placeholders.ts).
DELETE FROM "levels";--> statement-breakpoint
INSERT INTO "levels" ("level", "min_points", "can_create_events", "can_report") VALUES
  (0, 0, false, true), (1, 150, false, true), (2, 360, false, true), (3, 660, false, true), (4, 1050, false, true),
  (5, 1500, true, true), (6, 2100, true, true), (7, 3000, true, true), (8, 4200, true, true), (9, 5700, true, true), (10, 7500, true, true);--> statement-breakpoint
-- A point is now a minute (shared/rules.ts pointsForHours). Only test data exists, so the points already
-- given are counted again that way, and each person's total and level follow.
UPDATE "points_ledger" AS pl SET "points" = round(a."hours" * 60)
  FROM "attendance" AS a WHERE a."event_id" = pl."event_id" AND a."user_id" = pl."user_id" AND a."hours" IS NOT NULL;--> statement-breakpoint
UPDATE "users" AS u SET "total_points" = coalesce((SELECT sum(pl."points") FROM "points_ledger" AS pl WHERE pl."user_id" = u."id"), 0);--> statement-breakpoint
UPDATE "users" AS u SET "level" = (SELECT max(l."level") FROM "levels" AS l WHERE l."min_points" <= u."total_points");
