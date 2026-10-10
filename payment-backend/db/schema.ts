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
  activeRole:text('active_role').notNull().default('worker'),
  bankStatus: text('bank_status').notNull().default('not_connected'),
  bankAccount: text('bank_account'), bankName: text('bank_name'),
  bankTracking: text('bank_tracking'), bankConsentAt: text('bank_consent_at'),
  bankEnvironment: text('bank_environment'),
}, t => [check('wallet_nonnegative',sql`${t.available} >= 0 AND ${t.held} >= 0`),uniqueIndex('wallet_bank_account_environment').on(t.bankAccount,t.bankEnvironment)]);
export const bankDeposits = sqliteTable('bank_deposits', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),
  reference:text('reference').notNull(),account:text('account').notNull(),status:text('status').notNull(),
  amount:integer('amount'),environment:text('environment').notNull(),receiptReference:text('receipt_reference'),
  createdAt:text('created_at').notNull(),verifiedAt:text('verified_at'),
},t=>[uniqueIndex('deposit_user_reference_environment').on(t.userId,t.reference,t.environment)]);
export const bankBalances = sqliteTable('bank_balances', {
  userId:text('user_id').primaryKey().references(()=>users.id),account:text('account').notNull(),
  available:integer('available').notNull(),environment:text('environment').notNull(),checkedAt:text('checked_at').notNull(),
});
export const jobs = sqliteTable('payment_jobs', {
  id: text('id').primaryKey(), employerId: text('employer_id').notNull().references(() => users.id),
  workerId: text('worker_id').notNull().references(() => users.id),
  title: text('title').notNull(), scope: text('scope').notNull(), category: text('category').notNull(),
  amount: integer('amount').notNull(), status: text('status').notNull().default('invited'),
  rail: text('rail').notNull().default('sandbox'), bankEnvironment:text('bank_environment'),
  employerDone: integer('employer_done').notNull().default(0),
  workerDone: integer('worker_done').notNull().default(0),
  disputeReason: text('dispute_reason'), createdAt: text('created_at').notNull(), completedAt: text('completed_at'),
}, t => [check('job_amount_positive',sql`${t.amount} >= 100`)]);
export const jobLocations = sqliteTable('job_locations', {
  jobId: text('job_id').primaryKey().references(() => jobs.id),
  postcode: text('postcode').notNull(), status: text('status').notNull(),
  environment: text('environment').notNull(), administrative: text('administrative'), address: text('address'),
  checkedAt: text('checked_at'), acceptedAt: text('accepted_at'),
});
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

export const demoBankBalances = sqliteTable('demo_bank_balances', {
 userId:text('user_id').primaryKey().references(()=>users.id),available:integer('available').notNull().default(0),held:integer('held').notNull().default(0),
},t=>[check('demo_bank_nonnegative',sql`${t.available} >= 0 AND ${t.held} >= 0`)]);

export const liveProfiles = sqliteTable('live_profiles', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),
  role:text('role').notNull(),published:integer('published').notNull().default(1),
  suspended:integer('suspended').notNull().default(0),data:text('data').notNull(),
  revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('live_profile_user_role').on(t.userId,t.role)]);
export const liveOpenings = sqliteTable('live_openings', {
  id:text('id').primaryKey(),employerId:text('employer_id').notNull().references(()=>liveProfiles.id),
  status:text('status').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),
});
export const liveEngagements = sqliteTable('live_engagements', {
  id:text('id').primaryKey(),openingId:text('opening_id').notNull().references(()=>liveOpenings.id),
  workerId:text('worker_id').notNull().references(()=>liveProfiles.id),employerId:text('employer_id').notNull().references(()=>liveProfiles.id),
  status:text('status').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('live_engagement_opening_worker').on(t.openingId,t.workerId)]);
export const liveReviews = sqliteTable('live_reviews', {
  id:text('id').primaryKey(),engagementId:text('engagement_id').notNull().references(()=>liveEngagements.id),
  author:text('author').notNull().references(()=>liveProfiles.id),target:text('target').notNull().references(()=>liveProfiles.id),
  rating:integer('rating').notNull(),text:text('text').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('live_review_engagement_author').on(t.engagementId,t.author),check('live_rating_range',sql`${t.rating} >= 1 AND ${t.rating} <= 5`)]);
export const liveBlocks = sqliteTable('live_blocks', {
  actor:text('actor').notNull().references(()=>liveProfiles.id),target:text('target').notNull().references(()=>liveProfiles.id),
},t=>[uniqueIndex('live_block_actor_target').on(t.actor,t.target)]);
export const liveNotifications = sqliteTable('live_notifications', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),kind:text('kind').notNull(),title:text('title').notNull(),
  engagementId:text('engagement_id'),createdAt:text('created_at').notNull(),readAt:text('read_at'),
});
export const liveReports = sqliteTable('live_reports', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),target:text('target').notNull(),kind:text('kind').notNull(),
  reason:text('reason').notNull(),details:text('details').notNull(),status:text('status').notNull(),resolution:text('resolution'),createdAt:text('created_at').notNull(),
});
export const livePayments = sqliteTable('live_payments', {
  id:text('id').primaryKey(),engagementId:text('engagement_id').notNull().references(()=>liveEngagements.id),
  payer:text('payer').notNull().references(()=>liveProfiles.id),recipient:text('recipient').notNull().references(()=>liveProfiles.id),
  amount:integer('amount').notNull(),method:text('method').notNull(),note:text('note').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull(),confirmedAt:text('confirmed_at'),
},t=>[check('live_payment_positive',sql`${t.amount} >= 100`)]);
export const liveAccountSettings = sqliteTable('live_account_settings', {
  userId:text('user_id').primaryKey().references(()=>users.id),emailVerifiedAt:text('email_verified_at'),
});
export const liveEmailTokens = sqliteTable('live_email_tokens', {
  id:text('id').primaryKey(),hash:text('hash').notNull().unique(),userId:text('user_id').notNull().references(()=>users.id),purpose:text('purpose').notNull(),expiresAt:integer('expires_at').notNull(),usedAt:text('used_at'),
});

export const paystackDestinations = sqliteTable('paystack_destinations', {
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),workerId:text('worker_id').notNull().references(()=>liveProfiles.id),mode:text('mode').notNull(),bankName:text('bank_name').notNull(),accountName:text('account_name').notNull(),last4:text('last4').notNull(),subaccount:text('subaccount'),status:text('status').notNull(),claim:text('claim'),createdAt:text('created_at').notNull(),
});
export const paystackPayments = sqliteTable('paystack_payments', {
 reference:text('reference').primaryKey(),engagementId:text('engagement_id').notNull().references(()=>liveEngagements.id),payer:text('payer').notNull().references(()=>liveProfiles.id),recipient:text('recipient').notNull().references(()=>liveProfiles.id),amount:integer('amount').notNull(),mode:text('mode').notNull(),termsVersion:integer('terms_version').notNull(),period:text('period').notNull(),subaccount:text('subaccount').notNull(),status:text('status').notNull(),checkoutUrl:text('checkout_url'),createdAt:text('created_at').notNull(),paidAt:text('paid_at'),fees:integer('fees'),claim:text('claim').notNull(),
},t=>[uniqueIndex('paystack_work_period').on(t.engagementId,t.termsVersion,t.period,t.mode),check('paystack_positive_amount',sql`${t.amount} >= 10000`)]);
export const paystackBankTokens = sqliteTable('paystack_bank_tokens', {
 hash:text('hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),bankCode:text('bank_code').notNull(),accountNumber:text('account_number').notNull(),accountName:text('account_name').notNull(),bankName:text('bank_name').notNull(),mode:text('mode').notNull(),expiresAt:integer('expires_at').notNull(),
});
