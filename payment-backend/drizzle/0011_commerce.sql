ALTER TABLE paystack_payments ADD COLUMN platform_fee INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE lh_commerce_settings (id TEXT PRIMARY KEY, commission_bps INTEGER NOT NULL DEFAULT 0, premium_amount INTEGER NOT NULL DEFAULT 0, plan_code TEXT, plan_amount INTEGER, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE lh_credit_balances (user_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,mode));
--> statement-breakpoint
CREATE TABLE lh_orders (reference TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), status TEXT NOT NULL, checkout_url TEXT, plan_code TEXT, created_at TEXT NOT NULL, paid_at TEXT, fees INTEGER, applied INTEGER NOT NULL DEFAULT 0, reversed INTEGER NOT NULL DEFAULT 0, claim TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX lh_order_claim ON lh_orders(user_id,mode,claim);
--> statement-breakpoint
CREATE TABLE lh_credit_entries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, amount INTEGER NOT NULL, kind TEXT NOT NULL, reference TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE lh_platform_entries (id TEXT PRIMARY KEY, mode TEXT NOT NULL, amount INTEGER NOT NULL, kind TEXT NOT NULL, reference TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE lh_memberships (user_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, expires_at TEXT NOT NULL, subscription_code TEXT, customer_code TEXT, plan_code TEXT, renewal_status TEXT NOT NULL DEFAULT 'manual', PRIMARY KEY(user_id,mode));
--> statement-breakpoint
CREATE TABLE lh_payout_bank (mode TEXT PRIMARY KEY, recipient_code TEXT NOT NULL, bank_name TEXT NOT NULL, account_name TEXT NOT NULL, last4 TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE lh_withdrawals (reference TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), mode TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), reserve_fee INTEGER NOT NULL, recipient_code TEXT NOT NULL, status TEXT NOT NULL, transfer_code TEXT, actual_fee INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX lh_one_pending_withdrawal ON lh_withdrawals(mode) WHERE status NOT IN ('success','failed','reversed','abandoned','rejected');
--> statement-breakpoint
CREATE TABLE lh_refund_adjustments (id TEXT PRIMARY KEY, reference TEXT NOT NULL, mode TEXT NOT NULL, amount INTEGER NOT NULL, applied INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE lh_dispute_holds (id TEXT PRIMARY KEY, reference TEXT NOT NULL, mode TEXT NOT NULL, user_id TEXT, amount INTEGER NOT NULL, status TEXT NOT NULL);
