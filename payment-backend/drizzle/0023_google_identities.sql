CREATE TABLE `google_identities` (
  `google_sub` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `linked_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `google_identities_user_id_unique` ON `google_identities` (`user_id`);