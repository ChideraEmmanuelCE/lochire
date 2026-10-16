CREATE TABLE `kora_test_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`account_number` text,
	`account_name` text,
	`bank_name` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kora_test_accounts_reference_unique` ON `kora_test_accounts` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `kora_test_accounts_account_number_unique` ON `kora_test_accounts` (`account_number`);--> statement-breakpoint
CREATE TABLE `kora_test_deposits` (
	`reference` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`gross` integer NOT NULL,
	`fee` integer NOT NULL,
	`net` integer NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kora_test_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bucket` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`reference` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kora_test_entries_user` ON `kora_test_entries` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `kora_test_memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kora_test_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kora_test_operations_user` ON `kora_test_operations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `kora_test_wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`funds` integer DEFAULT 0 NOT NULL,
	`earnings` integer DEFAULT 0 NOT NULL,
	`frozen` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "kora_test_nonnegative" CHECK("kora_test_wallets"."funds">=0 AND "kora_test_wallets"."earnings">=0)
);
