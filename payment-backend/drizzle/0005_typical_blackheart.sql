CREATE TABLE `demo_bank_balances` (
	`user_id` text PRIMARY KEY NOT NULL,
	`available` integer DEFAULT 0 NOT NULL,
	`held` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "demo_bank_nonnegative" CHECK("demo_bank_balances"."available" >= 0 AND "demo_bank_balances"."held" >= 0)
);
