CREATE TABLE `license_state` (
	`id` text PRIMARY KEY,
	`license_id` text,
	`instance_key` text NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`token_hash` text PRIMARY KEY,
	`family_id` text NOT NULL,
	`sid` text NOT NULL,
	`sub` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`profile` text
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`ownerSub` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`meta` text
);
--> statement-breakpoint
CREATE INDEX `refresh_tokens_family_idx` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_sub_idx` ON `refresh_tokens` (`sub`);