CREATE TABLE `account_photos` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data_uri` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_photo_size" CHECK(length("account_photos"."data_uri")<5000)
);
