CREATE TABLE "homura_file_chunks" (
	"object_key" text,
	"chunk_index" integer,
	"data" text NOT NULL,
	CONSTRAINT "homura_file_chunks_pkey" PRIMARY KEY("object_key","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "homura_files" (
	"object_key" text PRIMARY KEY,
	"content_type" text NOT NULL,
	"total_size" bigint NOT NULL,
	"chunk_size" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
