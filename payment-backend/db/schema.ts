import { sqliteTable, text, integer, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), email: text('email').notNull().unique(),
  name: text('name').notNull(), phone: text('phone').notNull(), role: text('role').notNull(),
  passwordHash: text('password_hash').notNull(), passwordSalt: text('password_salt').notNull(),
  createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
});
export const wallets = sqliteTable('wallets', {
  userId: text('user_id').primaryKey().references(() => users.id),
  available: integer('available').notNull().default(0), held: integer('held').notNull().default(0),
  bankStatus: text('bank_status').notNull().default('not_connected'),
  bankAccount: text('bank_account'), bankName: text('bank_name'),
  bankTracking: text('bank_tracking'), bankConsentAt: text('bank_consent_at'),
}, t => [check('wallet_nonnegative',sql`${t.available} >= 0 AND ${t.held} >= 0`)]);
export const jobs = sqliteTable('payment_jobs', {
  id: text('id').primaryKey(), employerId: text('employer_id').notNull().references(() => users.id),
  workerId: text('worker_id').notNull().references(() => users.id),
  title: text('title').notNull(), scope: text('scope').notNull(), category: text('category').notNull(),
  amount: integer('amount').notNull(), status: text('status').notNull().default('invited'),
  rail: text('rail').notNull().default('sandbox'),
  employerDone: integer('employer_done').notNull().default(0),
  workerDone: integer('worker_done').notNull().default(0),
  disputeReason: text('dispute_reason'), createdAt: text('created_at').notNull(), completedAt: text('completed_at'),
}, t => [check('job_amount_positive',sql`${t.amount} >= 100`)]);
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(), reference: text('reference').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id), jobId: text('job_id').references(() => jobs.id),
  kind: text('kind').notNull(), amount: integer('amount').notNull(), status: text('status').notNull(),
  description: text('description').notNull(), mode: text('mode').notNull().default('sandbox'),
  createdAt: text('created_at').notNull(),
});
export const operations = sqliteTable('operations', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  key: text('key').notNull(), fingerprint: text('fingerprint').notNull(), kind: text('kind').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('operations_user_key').on(t.userId, t.key)]);
export const reviews = sqliteTable('payment_reviews', {
  id: text('id').primaryKey(), jobId: text('job_id').notNull().references(() => jobs.id),
  authorId: text('author_id').notNull().references(() => users.id), targetId: text('target_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(), text: text('text').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('payment_reviews_job_author').on(t.jobId, t.authorId)]);
export const bankRequests = sqliteTable('bank_requests', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id),
  kind: text('kind').notNull(), reference: text('reference').notNull().unique(),
  providerReference: text('provider_reference'), amount: integer('amount'), source: text('source'), destination: text('destination'),
  jobId: text('job_id').references(() => jobs.id), status: text('status').notNull().default('pending'),
  environment: text('environment').notNull().default('sandbox'),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('bank_requests_job_kind').on(t.jobId,t.kind)]);
export const bankEvents = sqliteTable('bank_events', {
  id: text('id').primaryKey(), reference: text('reference').notNull(),
  state: text('state').notNull(), createdAt: text('created_at').notNull(),
});
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), expiresAt: integer('expires_at').notNull(),
});
