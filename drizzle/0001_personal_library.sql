CREATE TABLE `personal_items` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer NOT NULL,
	`value_json` text,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sort_at` integer NOT NULL,
	`mutation_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `subject_id`)
);
--> statement-breakpoint
CREATE INDEX `personal_items_owner_sort` ON `personal_items` (`user_id`,`kind`,`sort_at`);