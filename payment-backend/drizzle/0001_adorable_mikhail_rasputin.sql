ALTER TABLE `payment_jobs` ADD `rail` text DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bank_requests_job_kind` ON `bank_requests` (`job_id`,`kind`);