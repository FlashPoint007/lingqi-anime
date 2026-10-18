CREATE TABLE `email_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_accounts_email_unique` ON `email_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `email_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_sessions_expiry` ON `email_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `email_sessions_user` ON `email_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `site_rule_sets` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	`checked_at` integer NOT NULL
);
