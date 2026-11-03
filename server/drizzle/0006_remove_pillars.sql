DROP TABLE "branch_pillars" CASCADE;--> statement-breakpoint
ALTER TABLE "points_ledger" DROP COLUMN "pillar";--> statement-breakpoint
DROP TYPE "public"."pillar";