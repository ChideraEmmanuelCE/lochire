CREATE TABLE `account_lock_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`until_at` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `account_locks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`until_at` integer,
	`updated_at` text NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE VIEW available_live_profiles AS SELECT p.* FROM live_profiles p WHERE NOT EXISTS (SELECT 1 FROM account_locks l WHERE l.user_id=p.user_id AND l.kind!='unlocked' AND (l.until_at IS NULL OR l.until_at>unixepoch('now')*1000));
