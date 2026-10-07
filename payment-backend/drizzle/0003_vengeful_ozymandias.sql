CREATE TABLE `job_locations` (
	`job_id` text PRIMARY KEY NOT NULL,
	`postcode` text NOT NULL,
	`status` text NOT NULL,
	`environment` text NOT NULL,
	`administrative` text,
	`address` text,
	`checked_at` text,
	`accepted_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `payment_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
