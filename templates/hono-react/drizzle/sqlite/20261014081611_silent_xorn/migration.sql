CREATE TABLE `oauth2_identity_links` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_sub` text NOT NULL,
	`raw_profile` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passwords` (
	`user_id` text PRIMARY KEY,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`username` text,
	`nickname` text,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webauthn_credentials` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`display_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth2_links_user_idx` ON `oauth2_identity_links` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth2_links_provider_sub_uidx` ON `oauth2_identity_links` (`provider`,`provider_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uidx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `webauthn_creds_user_idx` ON `webauthn_credentials` (`user_id`);