CREATE TABLE `live_account_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email_verified_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_blocks` (
	`actor` text NOT NULL,
	`target` text NOT NULL,
	FOREIGN KEY (`actor`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_block_actor_target` ON `live_blocks` (`actor`,`target`);--> statement-breakpoint
CREATE TABLE `live_email_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_email_tokens_hash_unique` ON `live_email_tokens` (`hash`);--> statement-breakpoint
CREATE TABLE `live_engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`opening_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`employer_id` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`opening_id`) REFERENCES `live_openings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employer_id`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_engagement_opening_worker` ON `live_engagements` (`opening_id`,`worker_id`);--> statement-breakpoint
CREATE TABLE `live_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`engagement_id` text,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_openings` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`payer` text NOT NULL,
	`recipient` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`engagement_id`) REFERENCES `live_engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "live_payment_positive" CHECK("live_payments"."amount" >= 100)
);
--> statement-breakpoint
CREATE TABLE `live_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_profile_user_role` ON `live_profiles` (`user_id`,`role`);--> statement-breakpoint
CREATE TABLE `live_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`status` text NOT NULL,
	`resolution` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`author` text NOT NULL,
	`target` text NOT NULL,
	`rating` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `live_engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "live_rating_range" CHECK("live_reviews"."rating" >= 1 AND "live_reviews"."rating" <= 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_review_engagement_author` ON `live_reviews` (`engagement_id`,`author`);