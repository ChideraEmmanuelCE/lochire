CREATE TABLE `message_views` (
	`message_id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`viewer_id` text NOT NULL,
	`viewed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`purged` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `live_engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`viewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `message_views_expiry` ON `message_views` (`purged`,`expires_at`);--> statement-breakpoint
CREATE INDEX `message_views_engagement` ON `message_views` (`engagement_id`);