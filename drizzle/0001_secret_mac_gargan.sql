ALTER TABLE "ingest_state" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ingest_state" CASCADE;--> statement-breakpoint
DROP INDEX "movies_top200_idx";--> statement-breakpoint
CREATE INDEX "movies_top200_idx" ON "movies" USING btree ("id") WHERE in_top200;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_status_valide" CHECK ("matches"."status" IN ('a_voir', 'vu', 'abandonne'));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_code_format" CHECK ("rooms"."code" ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$');