CREATE TABLE `request_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `request_buckets_window` ON `request_buckets` (`window_start`);--> statement-breakpoint
CREATE TABLE `shared_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`stale_until` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shared_cache_stale` ON `shared_cache` (`stale_until`);--> statement-breakpoint
CREATE INDEX `shared_cache_updated` ON `shared_cache` (`updated_at`);