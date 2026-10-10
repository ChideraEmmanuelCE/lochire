CREATE TABLE `paystack_bank_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bank_code` text NOT NULL,
	`account_number` text NOT NULL,
	`account_name` text NOT NULL,
	`bank_name` text NOT NULL,
	`mode` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `paystack_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`mode` text NOT NULL,
	`bank_name` text NOT NULL,
	`account_name` text NOT NULL,
	`last4` text NOT NULL,
	`subaccount` text,
	`status` text NOT NULL,
	`claim` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `paystack_payments` (
	`reference` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`payer` text NOT NULL,
	`recipient` text NOT NULL,
	`amount` integer NOT NULL,
	`mode` text NOT NULL,
	`terms_version` integer NOT NULL,
	`period` text NOT NULL,
	`subaccount` text NOT NULL,
	`status` text NOT NULL,
	`checkout_url` text,
	`created_at` text NOT NULL,
	`paid_at` text,
	`fees` integer,
	`claim` text NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `live_engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "paystack_positive_amount" CHECK("paystack_payments"."amount" >= 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paystack_work_period` ON `paystack_payments` (`engagement_id`,`terms_version`,`period`,`mode`);