-- Owner-authorized reset of the single inspected test account.
-- Referencing work/payments intentionally block deletion rather than removing shared history.
--> statement-breakpoint
DELETE FROM sessions WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM live_email_tokens WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM live_account_settings WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM live_notifications WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM live_reports WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM paystack_bank_tokens WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM paystack_destinations WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM operations WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM bank_requests WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa' AND environment IN ('demo','sandbox');
--> statement-breakpoint
DELETE FROM bank_deposits WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa' AND environment IN ('demo','sandbox');
--> statement-breakpoint
DELETE FROM bank_balances WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa' AND environment IN ('demo','sandbox');
--> statement-breakpoint
DELETE FROM demo_bank_balances WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM wallets WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM transactions WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa' AND mode IN ('sandbox','wema_demo');
--> statement-breakpoint
DELETE FROM live_blocks WHERE actor IN (SELECT id FROM live_profiles WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa') OR target IN (SELECT id FROM live_profiles WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa');
--> statement-breakpoint
DELETE FROM live_openings WHERE employer_id IN (SELECT id FROM live_profiles WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa');
--> statement-breakpoint
DELETE FROM live_profiles WHERE user_id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM rate_limits WHERE key='auth:'||(SELECT email FROM users WHERE id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa') OR key='account:LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
--> statement-breakpoint
DELETE FROM users WHERE id='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa';
