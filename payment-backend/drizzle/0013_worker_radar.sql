CREATE TABLE `live_presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_worker_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`opening_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`employer_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`engagement_id` text,
	FOREIGN KEY (`opening_id`) REFERENCES `live_openings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`worker_id`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employer_id`) REFERENCES `live_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "live_match_status" CHECK("live_worker_matches"."status" IN ('pending','invited','declined'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_match_opening_worker` ON `live_worker_matches` (`opening_id`,`worker_id`);--> statement-breakpoint
CREATE INDEX `live_match_employer_status` ON `live_worker_matches` (`employer_id`,`status`);--> statement-breakpoint
ALTER TABLE `live_notification_emails` ADD `payload` text;
--> statement-breakpoint
DROP TRIGGER live_notification_email_queue;
--> statement-breakpoint
CREATE TRIGGER live_notification_email_queue AFTER INSERT ON live_notifications
WHEN NEW.kind IN ('invitation','accept','decline','message','terms','confirm','complete','cancel','review','payment','support','worker_match','interview')
BEGIN
  INSERT OR IGNORE INTO live_notification_emails(notification_id) VALUES(NEW.id);
END;
