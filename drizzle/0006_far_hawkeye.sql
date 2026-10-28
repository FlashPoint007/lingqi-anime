CREATE TABLE `email_action_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`user_id` text,
	`credential_hash` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`claim_id` text
);
--> statement-breakpoint
CREATE INDEX `email_action_expiry` ON `email_action_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `email_action_owner` ON `email_action_tokens` (`email`,`purpose`);--> statement-breakpoint
ALTER TABLE `email_accounts` ADD `email_verified_at` integer;