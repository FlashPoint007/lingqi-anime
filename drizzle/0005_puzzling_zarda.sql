CREATE TABLE `site_danmaku` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` integer NOT NULL,
	`episode` text NOT NULL,
	`user_id` text NOT NULL,
	`time_ms` integer NOT NULL,
	`mode` integer NOT NULL,
	`color` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`mutation_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `site_danmaku_timeline` ON `site_danmaku` (`subject_id`,`episode`,`deleted_at`,`time_ms`);--> statement-breakpoint
CREATE INDEX `site_danmaku_user_created` ON `site_danmaku` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_danmaku_own_episode` ON `site_danmaku` (`user_id`,`subject_id`,`episode`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_danmaku_mutation` ON `site_danmaku` (`user_id`,`mutation_id`);