-- One-time owner-requested deletion. Exact IDs and reserved test emails only.
-- Separate statements avoid the hosted database's compound SELECT limit.
CREATE TABLE "_lochire_demo_cleanup_20261016" (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL);
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-176f7cde-c8d8-43bd-b82d-7e5b477f4009' AND email='wema-demo-employer-6013393e@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-1ff3b1cf-789b-4b85-a710-7cb653ff9170' AND email='wema-demo-worker-b7c3a7a8@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-3e3c79ee-979b-44f4-b203-4c100e495da1' AND email='postcode-qa-worker-58119257@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-4ea938b3-580d-45c4-b8d1-87c28061ef6e' AND email='postcode-qa-employer-b83391de@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-7011aab8-02e3-40a7-a9fa-638c961f164a' AND email='postcode-qa-employer-58119257@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-86282b11-61f5-4174-93e6-162778b098b4' AND email='qa-worker-2473d75e@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-8c509567-d515-4c50-8306-c55695740e28' AND email='wema-demo-worker-6013393e@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-8f965794-07ea-43de-8dd9-314d28831508' AND email='wema-demo-employer-9f7ae837@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-9bdaea70-faa0-43c3-b3b2-c848aa65a27a' AND email='qa-employer-ce5ffcda@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-c205eb50-f40e-413c-a3e9-d2b6103e4e8e' AND email='postcode-qa-worker-b83391de@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-e4c4e1b9-8bb3-4467-bc7f-bb50817608de' AND email='wema-demo-employer-b7c3a7a8@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-e89729dd-5221-403b-80a6-4ac79f939f29' AND email='wema-demo-worker-9f7ae837@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-f757e7b3-e3ce-4759-b96f-bba4f0b4891a' AND email='qa-employer-2473d75e@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
INSERT INTO "_lochire_demo_cleanup_20261016" (id,email) SELECT id,email FROM users WHERE id='LH-fcc1f805-07b7-4552-8497-55a5b2c90837' AND email='qa-worker-ce5ffcda@example.test' AND email LIKE '%@example.test';
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "reference" FROM "bank_requests" WHERE ("bank_requests"."job_id" IN (SELECT "id" FROM "payment_jobs" WHERE ("payment_jobs"."worker_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_jobs"."employer_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "bank_requests"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "reference" FROM "transactions" WHERE ("transactions"."job_id" IN (SELECT "id" FROM "payment_jobs" WHERE ("payment_jobs"."worker_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_jobs"."employer_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "transactions"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "reference" FROM "bank_deposits" WHERE ("bank_deposits"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "reference" FROM "kora_test_deposits" WHERE ("kora_test_deposits"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "id" FROM "kora_test_operations" WHERE ("kora_test_operations"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "reference" FROM "lh_kora_premium_orders" WHERE ("lh_kora_premium_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "reference" FROM "lh_orders" WHERE ("lh_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM bank_events WHERE reference IN (SELECT "reference" FROM "paystack_payments" WHERE ("paystack_payments"."recipient" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."payer" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."engagement_id" IN (SELECT "id" FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")))))))));
--> statement-breakpoint
DELETE FROM bank_events WHERE (CASE WHEN json_valid(state) THEN json_extract(state,'$.accountReference') ELSE NULL END) IN (SELECT reference FROM kora_test_accounts WHERE ("kora_test_accounts"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM "lh_platform_entries" WHERE reference IN (SELECT reference FROM "lh_orders" WHERE ("lh_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM "lh_platform_entries" WHERE reference IN (SELECT reference FROM "paystack_payments" WHERE ("paystack_payments"."recipient" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."payer" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."engagement_id" IN (SELECT "id" FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")))))))));
--> statement-breakpoint
DELETE FROM "lh_platform_entries" WHERE reference IN (SELECT reference FROM "lh_kora_premium_orders" WHERE ("lh_kora_premium_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM "lh_refund_adjustments" WHERE reference IN (SELECT reference FROM "lh_orders" WHERE ("lh_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM "lh_refund_adjustments" WHERE reference IN (SELECT reference FROM "paystack_payments" WHERE ("paystack_payments"."recipient" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."payer" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."engagement_id" IN (SELECT "id" FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")))))))));
--> statement-breakpoint
DELETE FROM "lh_refund_adjustments" WHERE reference IN (SELECT reference FROM "lh_kora_premium_orders" WHERE ("lh_kora_premium_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM "lh_dispute_holds" WHERE reference IN (SELECT reference FROM "lh_orders" WHERE ("lh_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM "lh_dispute_holds" WHERE reference IN (SELECT reference FROM "paystack_payments" WHERE ("paystack_payments"."recipient" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."payer" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."engagement_id" IN (SELECT "id" FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")))))))));
--> statement-breakpoint
DELETE FROM "lh_dispute_holds" WHERE reference IN (SELECT reference FROM "lh_kora_premium_orders" WHERE ("lh_kora_premium_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM lh_dispute_holds WHERE user_id IN (SELECT id FROM "_lochire_demo_cleanup_20261016");
--> statement-breakpoint
DELETE FROM live_notifications WHERE user_id IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR engagement_id IN (SELECT id FROM live_engagements WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))))) OR id IN (SELECT notification_id FROM lh_job_alerts WHERE ("lh_job_alerts"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))) OR "lh_job_alerts"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")));
--> statement-breakpoint
DELETE FROM live_reports WHERE user_id IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR target IN (SELECT id FROM live_profiles WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR target IN (SELECT id FROM live_openings WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))) OR target IN (SELECT id FROM live_engagements WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016")))))));
--> statement-breakpoint
DELETE FROM rate_limits WHERE EXISTS (SELECT 1 FROM "_lochire_demo_cleanup_20261016" t WHERE key='auth:'||t.email OR substr(key,-length(t.id)-1)=':'||t.id);
--> statement-breakpoint
DELETE FROM "lh_job_alert_outbox" WHERE ("lh_job_alert_outbox"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))));
--> statement-breakpoint
DELETE FROM "lh_premium_grants" WHERE ("lh_premium_grants"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "lh_premium_grants"."reference" IN (SELECT "reference" FROM "lh_kora_premium_orders" WHERE ("lh_kora_premium_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))));
--> statement-breakpoint
DELETE FROM "lh_kora_premium_orders" WHERE ("lh_kora_premium_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "lh_job_alerts" WHERE ("lh_job_alerts"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))) OR "lh_job_alerts"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "lh_job_alert_preferences" WHERE ("lh_job_alert_preferences"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "kora_test_wallets" WHERE ("kora_test_wallets"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "kora_test_operations" WHERE ("kora_test_operations"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "kora_test_memberships" WHERE ("kora_test_memberships"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "kora_test_entries" WHERE ("kora_test_entries"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "kora_test_deposits" WHERE ("kora_test_deposits"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "kora_test_accounts" WHERE ("kora_test_accounts"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "live_worker_matches" WHERE ("live_worker_matches"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_worker_matches"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_worker_matches"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))));
--> statement-breakpoint
DELETE FROM "live_presence" WHERE ("live_presence"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "live_notification_emails" WHERE ("live_notification_emails"."notification_id" IN (SELECT "id" FROM "live_notifications" WHERE ("live_notifications"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))));
--> statement-breakpoint
DELETE FROM "lh_withdrawals" WHERE ("lh_withdrawals"."owner_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "lh_memberships" WHERE ("lh_memberships"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "lh_credit_entries" WHERE ("lh_credit_entries"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "lh_orders" WHERE ("lh_orders"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "lh_credit_balances" WHERE ("lh_credit_balances"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "paystack_payments" WHERE ("paystack_payments"."recipient" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."payer" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_payments"."engagement_id" IN (SELECT "id" FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))))));
--> statement-breakpoint
DELETE FROM "paystack_destinations" WHERE ("paystack_destinations"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "paystack_destinations"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "paystack_bank_tokens" WHERE ("paystack_bank_tokens"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "live_reviews" WHERE ("live_reviews"."target" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_reviews"."author" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_reviews"."engagement_id" IN (SELECT "id" FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))))));
--> statement-breakpoint
DELETE FROM "live_reports" WHERE ("live_reports"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "live_payments" WHERE ("live_payments"."recipient" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_payments"."payer" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_payments"."engagement_id" IN (SELECT "id" FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))))));
--> statement-breakpoint
DELETE FROM "live_notifications" WHERE ("live_notifications"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "live_engagements" WHERE ("live_engagements"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."worker_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_engagements"."opening_id" IN (SELECT "id" FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))))));
--> statement-breakpoint
DELETE FROM "live_openings" WHERE ("live_openings"."employer_id" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))));
--> statement-breakpoint
DELETE FROM "live_email_tokens" WHERE ("live_email_tokens"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "live_blocks" WHERE ("live_blocks"."target" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "live_blocks"."actor" IN (SELECT "id" FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))));
--> statement-breakpoint
DELETE FROM "live_profiles" WHERE ("live_profiles"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "live_account_settings" WHERE ("live_account_settings"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "demo_bank_balances" WHERE ("demo_bank_balances"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "bank_deposits" WHERE ("bank_deposits"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "bank_balances" WHERE ("bank_balances"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "job_locations" WHERE ("job_locations"."job_id" IN (SELECT "id" FROM "payment_jobs" WHERE ("payment_jobs"."worker_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_jobs"."employer_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))));
--> statement-breakpoint
DELETE FROM "wallets" WHERE ("wallets"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "transactions" WHERE ("transactions"."job_id" IN (SELECT "id" FROM "payment_jobs" WHERE ("payment_jobs"."worker_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_jobs"."employer_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "transactions"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "sessions" WHERE ("sessions"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "payment_reviews" WHERE ("payment_reviews"."target_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_reviews"."author_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_reviews"."job_id" IN (SELECT "id" FROM "payment_jobs" WHERE ("payment_jobs"."worker_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_jobs"."employer_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))));
--> statement-breakpoint
DELETE FROM "operations" WHERE ("operations"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "bank_requests" WHERE ("bank_requests"."job_id" IN (SELECT "id" FROM "payment_jobs" WHERE ("payment_jobs"."worker_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_jobs"."employer_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"))) OR "bank_requests"."user_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "payment_jobs" WHERE ("payment_jobs"."worker_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016") OR "payment_jobs"."employer_id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016"));
--> statement-breakpoint
DELETE FROM "users" WHERE "users"."id" IN (SELECT id FROM "_lochire_demo_cleanup_20261016");
--> statement-breakpoint
DROP TABLE "_lochire_demo_cleanup_20261016";
