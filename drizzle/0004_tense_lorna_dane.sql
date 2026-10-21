CREATE TABLE `discussion_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` integer NOT NULL,
	`scope` text NOT NULL,
	`parent_id` text,
	`user_id` text NOT NULL,
	`alias` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`mutation_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discussion_scope_created` ON `discussion_posts` (`subject_id`,`scope`,`created_at`);--> statement-breakpoint
CREATE INDEX `discussion_user_created` ON `discussion_posts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `discussion_parent` ON `discussion_posts` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `discussion_mutation` ON `discussion_posts` (`user_id`,`mutation_id`);