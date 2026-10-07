ALTER TABLE `wallets` ADD `active_role` text DEFAULT 'worker' NOT NULL;
--> statement-breakpoint
UPDATE wallets SET active_role='employer' WHERE user_id IN (SELECT id FROM users WHERE role IN ('employer','both'));
