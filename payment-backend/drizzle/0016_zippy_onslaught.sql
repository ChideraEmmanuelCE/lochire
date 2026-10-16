CREATE TABLE `lh_job_alert_outbox` (
	`opening_id` text PRIMARY KEY NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`opening_id`) REFERENCES `live_openings`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
-- Commit a durable fan-out task with every new public opening. No old openings
-- are seeded: buying a Plus pass must not replay past jobs as fresh alerts.
CREATE TRIGGER lh_new_opening_alert_outbox AFTER INSERT ON live_openings
WHEN NEW.status='Open'
BEGIN
  INSERT OR IGNORE INTO lh_job_alert_outbox(opening_id) VALUES(NEW.id);
END;
