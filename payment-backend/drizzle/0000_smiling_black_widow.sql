CREATE TABLE `bank_events` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bank_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`provider_reference` text,
	`amount` integer,
	`source` text,
	`destination` text,
	`job_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `payment_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_requests_reference_unique` ON `bank_requests` (`reference`);--> statement-breakpoint
CREATE TABLE `payment_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`title` text NOT NULL,
	`scope` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`employer_done` integer DEFAULT 0 NOT NULL,
	`worker_done` integer DEFAULT 0 NOT NULL,
	`dispute_reason` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`employer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_amount_positive" CHECK("payment_jobs"."amount" >= 100)
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_user_key` ON `operations` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`author_id` text NOT NULL,
	`target_id` text NOT NULL,
	`rating` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `payment_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_reviews_job_author` ON `payment_reviews` (`job_id`,`author_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`description` text NOT NULL,
	`mode` text DEFAULT 'sandbox' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `payment_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_reference_unique` ON `transactions` (`reference`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`available` integer DEFAULT 0 NOT NULL,
	`held` integer DEFAULT 0 NOT NULL,
	`bank_status` text DEFAULT 'not_connected' NOT NULL,
	`bank_account` text,
	`bank_name` text,
	`bank_tracking` text,
	`bank_consent_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wallet_nonnegative" CHECK("wallets"."available" >= 0 AND "wallets"."held" >= 0)
);
