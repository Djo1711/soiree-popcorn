CREATE TABLE "ingest_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"movie_id" integer NOT NULL,
	"status" text DEFAULT 'a_voir' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_room_movie_unique" UNIQUE("room_code","movie_id")
);
--> statement-breakpoint
CREATE TABLE "member_filters" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"year_from" integer,
	"year_to" integer,
	"min_rating" real DEFAULT 0 NOT NULL,
	"max_runtime" integer,
	"providers" text[] DEFAULT '{}' NOT NULL,
	"include_top200" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_room_name_unique" UNIQUE("room_code","display_name")
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"overview" text,
	"poster_path" text,
	"backdrop_path" text,
	"release_date" date,
	"release_year" integer,
	"runtime" integer,
	"vote_average" real,
	"vote_count" integer,
	"popularity" real,
	"popularity_percentile" double precision DEFAULT 0 NOT NULL,
	"genres" text[] DEFAULT '{}' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"providers" text[] DEFAULT '{}' NOT NULL,
	"in_top200" boolean DEFAULT false NOT NULL,
	"director" text,
	"detail_fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"code" text PRIMARY KEY NOT NULL,
	"expected_members" integer NOT NULL,
	"match_threshold" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_expected_members_range" CHECK ("rooms"."expected_members" BETWEEN 2 AND 8),
	CONSTRAINT "rooms_threshold_range" CHECK ("rooms"."match_threshold" BETWEEN 2 AND "rooms"."expected_members")
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"member_id" uuid NOT NULL,
	"movie_id" integer NOT NULL,
	"liked" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipes_member_id_movie_id_pk" PRIMARY KEY("member_id","movie_id")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_filters" ADD CONSTRAINT "member_filters_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_room_id_idx" ON "matches" USING btree ("room_code","id");--> statement-breakpoint
CREATE INDEX "movies_genres_idx" ON "movies" USING gin ("genres");--> statement-breakpoint
CREATE INDEX "movies_keywords_idx" ON "movies" USING gin ("keywords");--> statement-breakpoint
CREATE INDEX "movies_providers_idx" ON "movies" USING gin ("providers");--> statement-breakpoint
CREATE INDEX "movies_release_year_idx" ON "movies" USING btree ("release_year");--> statement-breakpoint
CREATE INDEX "movies_vote_average_idx" ON "movies" USING btree ("vote_average");--> statement-breakpoint
CREATE INDEX "movies_top200_idx" ON "movies" USING btree ("in_top200");--> statement-breakpoint
CREATE INDEX "movies_detail_fetched_idx" ON "movies" USING btree ("detail_fetched_at");--> statement-breakpoint
CREATE INDEX "swipes_member_recent_idx" ON "swipes" USING btree ("member_id","created_at");