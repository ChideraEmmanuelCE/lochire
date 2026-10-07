CREATE TABLE `bank_balances` (
	`user_id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`available` integer NOT NULL,
	`environment` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reference` text NOT NULL,
	`account` text NOT NULL,
	`status` text NOT NULL,
	`amount` integer,
	`environment` text NOT NULL,
	`receipt_reference` text,
	`created_at` text NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deposit_user_reference_environment` ON `bank_deposits` (`user_id`,`reference`,`environment`);--> statement-breakpoint
ALTER TABLE `wallets` ADD `bank_environment` text;--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_bank_account_environment` ON `wallets` (`bank_account`,`bank_environment`);