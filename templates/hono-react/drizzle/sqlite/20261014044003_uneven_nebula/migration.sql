CREATE TABLE `homura_file_chunks` (
	`object_key` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `homura_file_chunks_pk` PRIMARY KEY(`object_key`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `homura_files` (
	`object_key` text PRIMARY KEY,
	`content_type` text NOT NULL,
	`total_size` integer NOT NULL,
	`chunk_size` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
