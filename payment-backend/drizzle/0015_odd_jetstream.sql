CREATE TABLE `lh_job_alert_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`city` text NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lh_job_alerts` (
	`notification_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`opening_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opening_id`) REFERENCES `live_openings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lh_job_alert_user_opening` ON `lh_job_alerts` (`user_id`,`opening_id`);--> statement-breakpoint
CREATE TABLE `lh_kora_premium_orders` (
	`reference` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`tier` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`claim` text NOT NULL,
	`checkout_url` text,
	`created_at` text NOT NULL,
	`paid_at` text,
	`fees` integer,
	`applied` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lh_kora_premium_amount" CHECK("lh_kora_premium_orders"."amount">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lh_kora_premium_claim` ON `lh_kora_premium_orders` (`user_id`,`mode`,`claim`);--> statement-breakpoint
CREATE INDEX `lh_kora_premium_user` ON `lh_kora_premium_orders` (`user_id`,`mode`);--> statement-breakpoint
CREATE TABLE `lh_premium_grants` (
	`reference` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`tier` text NOT NULL,
	`starts_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`reference`) REFERENCES `lh_kora_premium_orders`(`reference`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lh_premium_grants_user` ON `lh_premium_grants` (`user_id`,`mode`,`expires_at`);