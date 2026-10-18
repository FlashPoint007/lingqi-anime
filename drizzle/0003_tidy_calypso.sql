CREATE TABLE `email_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`hits` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_attempts_expiry` ON `email_attempts` (`expires_at`);