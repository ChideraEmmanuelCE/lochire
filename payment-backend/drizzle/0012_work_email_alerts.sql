-- Reviewed Drizzle delta. Commerce tables and platform_fee already exist in 0011.

CREATE TABLE `live_notification_emails` (
	`notification_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`claim` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer,
	`sent_at` text,
	`last_error` text,
	FOREIGN KEY (`notification_id`) REFERENCES `live_notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "live_notification_emails_status" CHECK("live_notification_emails"."status" IN ('pending','sending','sent','skipped','failed','review'))
);

--> statement-breakpoint

CREATE INDEX `live_notification_emails_due` ON `live_notification_emails` (`status`,`next_at`,`lease_until`);
--> statement-breakpoint

ALTER TABLE `live_account_settings` ADD `hiring_email_enabled` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Queue only new events. Existing inbox history must never be replayed as email.
CREATE TRIGGER live_notification_email_queue AFTER INSERT ON live_notifications
WHEN NEW.kind IN ('invitation','accept','decline','message','terms','confirm','complete','cancel','review','payment','support')
BEGIN
  INSERT OR IGNORE INTO live_notification_emails(notification_id) VALUES(NEW.id);
END;
