CREATE TABLE `account_age_checks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`confirmed_at` text NOT NULL,
	`minimum_age` integer DEFAULT 18 NOT NULL,
	`method` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
