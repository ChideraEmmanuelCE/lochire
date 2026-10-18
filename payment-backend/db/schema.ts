import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
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
  userId:text('user_id').primaryKey().references(()=>users.id),emailVerifiedAt:text('email_verified_at'),hiringEmailEnabled:integer('hiring_email_enabled').notNull().default(1),
});
export const liveEmailTokens = sqliteTable('live_email_tokens', {
  id:text('id').primaryKey(),hash:text('hash').notNull().unique(),userId:text('user_id').notNull().references(()=>users.id),purpose:text('purpose').notNull(),expiresAt:integer('expires_at').notNull(),usedAt:text('used_at'),
});

export const paystackDestinations = sqliteTable('paystack_destinations', {
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),workerId:text('worker_id').notNull().references(()=>liveProfiles.id),mode:text('mode').notNull(),bankName:text('bank_name').notNull(),accountName:text('account_name').notNull(),last4:text('last4').notNull(),subaccount:text('subaccount'),status:text('status').notNull(),claim:text('claim'),createdAt:text('created_at').notNull(),
});
export const paystackPayments = sqliteTable('paystack_payments', {
 reference:text('reference').primaryKey(),engagementId:text('engagement_id').notNull().references(()=>liveEngagements.id),payer:text('payer').notNull().references(()=>liveProfiles.id),recipient:text('recipient').notNull().references(()=>liveProfiles.id),amount:integer('amount').notNull(),mode:text('mode').notNull(),termsVersion:integer('terms_version').notNull(),period:text('period').notNull(),subaccount:text('subaccount').notNull(),status:text('status').notNull(),checkoutUrl:text('checkout_url'),createdAt:text('created_at').notNull(),paidAt:text('paid_at'),fees:integer('fees'),claim:text('claim').notNull(),platformFee:integer('platform_fee').notNull().default(0),
},t=>[uniqueIndex('paystack_work_period').on(t.engagementId,t.termsVersion,t.period,t.mode),check('paystack_positive_amount',sql`${t.amount} >= 10000`)]);
export const paystackBankTokens = sqliteTable('paystack_bank_tokens', {
 hash:text('hash').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),bankCode:text('bank_code').notNull(),accountNumber:text('account_number').notNull(),accountName:text('account_name').notNull(),bankName:text('bank_name').notNull(),mode:text('mode').notNull(),expiresAt:integer('expires_at').notNull(),
});

// Commerce balances and revenue are separate from the retired sandbox ledger.
export const commerceSettings=sqliteTable('lh_commerce_settings',{id:text('id').primaryKey(),commissionBps:integer('commission_bps').notNull().default(0),premiumAmount:integer('premium_amount').notNull().default(0),planCode:text('plan_code'),planAmount:integer('plan_amount'),updatedAt:text('updated_at').notNull()});
export const creditBalances=sqliteTable('lh_credit_balances',{userId:text('user_id').notNull().references(()=>users.id),mode:text('mode').notNull(),balance:integer('balance').notNull().default(0)},t=>[uniqueIndex('lh_credit_owner_mode').on(t.userId,t.mode)]);
export const commerceOrders=sqliteTable('lh_orders',{reference:text('reference').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),mode:text('mode').notNull(),kind:text('kind').notNull(),amount:integer('amount').notNull(),status:text('status').notNull(),checkoutUrl:text('checkout_url'),planCode:text('plan_code'),createdAt:text('created_at').notNull(),paidAt:text('paid_at'),fees:integer('fees'),applied:integer('applied').notNull().default(0),reversed:integer('reversed').notNull().default(0),claim:text('claim').notNull()},t=>[uniqueIndex('lh_order_claim').on(t.userId,t.mode,t.claim),check('lh_positive_order',sql`${t.amount}>0`)]);
export const creditEntries=sqliteTable('lh_credit_entries',{id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),mode:text('mode').notNull(),amount:integer('amount').notNull(),kind:text('kind').notNull(),reference:text('reference').notNull(),createdAt:text('created_at').notNull()});
export const platformEntries=sqliteTable('lh_platform_entries',{id:text('id').primaryKey(),mode:text('mode').notNull(),amount:integer('amount').notNull(),kind:text('kind').notNull(),reference:text('reference').notNull(),createdAt:text('created_at').notNull()});
export const memberships=sqliteTable('lh_memberships',{userId:text('user_id').notNull().references(()=>users.id),mode:text('mode').notNull(),expiresAt:text('expires_at').notNull(),subscriptionCode:text('subscription_code'),customerCode:text('customer_code'),planCode:text('plan_code'),renewalStatus:text('renewal_status').notNull().default('manual')},t=>[uniqueIndex('lh_membership_owner_mode').on(t.userId,t.mode)]);
export const payoutBank=sqliteTable('lh_payout_bank',{mode:text('mode').primaryKey(),recipientCode:text('recipient_code').notNull(),bankName:text('bank_name').notNull(),accountName:text('account_name').notNull(),last4:text('last4').notNull(),updatedAt:text('updated_at').notNull()});
export const withdrawals=sqliteTable('lh_withdrawals',{reference:text('reference').primaryKey(),ownerId:text('owner_id').notNull().references(()=>users.id),mode:text('mode').notNull(),amount:integer('amount').notNull(),reserveFee:integer('reserve_fee').notNull(),recipientCode:text('recipient_code').notNull(),status:text('status').notNull(),transferCode:text('transfer_code'),actualFee:integer('actual_fee'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()},t=>[uniqueIndex('lh_one_pending_withdrawal').on(t.mode).where(sql`${t.status} NOT IN ('success','failed','reversed','abandoned','rejected')`),check('lh_positive_withdrawal',sql`${t.amount}>0`)]);
export const refundAdjustments=sqliteTable('lh_refund_adjustments',{id:text('id').primaryKey(),reference:text('reference').notNull(),mode:text('mode').notNull(),amount:integer('amount').notNull(),applied:integer('applied').notNull().default(0)});
export const disputeHolds=sqliteTable('lh_dispute_holds',{id:text('id').primaryKey(),reference:text('reference').notNull(),mode:text('mode').notNull(),userId:text('user_id'),amount:integer('amount').notNull(),status:text('status').notNull()});

export const liveNotificationEmails = sqliteTable('live_notification_emails', {
 notificationId:text('notification_id').primaryKey().references(()=>liveNotifications.id,{onDelete:'cascade'}),
 status:text('status').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),
 nextAt:integer('next_at').notNull().default(0),claim:text('claim'),leaseUntil:integer('lease_until').notNull().default(0),
 firstAttemptAt:integer('first_attempt_at'),sentAt:text('sent_at'),lastError:text('last_error'),payload:text('payload'),
},t=>[index('live_notification_emails_due').on(t.status,t.nextAt,t.leaseUntil),
 check('live_notification_emails_status',sql`${t.status} IN ('pending','sending','sent','skipped','failed','review')`)]);

export const livePresence=sqliteTable('live_presence',{
 userId:text('user_id').primaryKey().references(()=>users.id),lastSeenAt:integer('last_seen_at').notNull(),
});
export const liveWorkerMatches=sqliteTable('live_worker_matches',{
 id:text('id').primaryKey(),openingId:text('opening_id').notNull().references(()=>liveOpenings.id),
 workerId:text('worker_id').notNull().references(()=>liveProfiles.id),employerId:text('employer_id').notNull().references(()=>liveProfiles.id),
 status:text('status').notNull().default('pending'),data:text('data').notNull(),createdAt:text('created_at').notNull(),decidedAt:text('decided_at'),engagementId:text('engagement_id'),
},t=>[uniqueIndex('live_match_opening_worker').on(t.openingId,t.workerId),index('live_match_employer_status').on(t.employerId,t.status),check('live_match_status',sql`${t.status} IN ('pending','invited','declined')`)]);

// Kora sandbox only: these tables never grant live credits or premium benefits.
export const koraTestAccounts=sqliteTable('kora_test_accounts',{
 userId:text('user_id').primaryKey().references(()=>users.id),reference:text('reference').notNull().unique(),
 accountNumber:text('account_number').unique(),accountName:text('account_name'),bankName:text('bank_name'),
 status:text('status').notNull(),createdAt:text('created_at').notNull(),
});
export const koraTestWallets=sqliteTable('kora_test_wallets',{
 userId:text('user_id').primaryKey().references(()=>users.id),funds:integer('funds').notNull().default(0),earnings:integer('earnings').notNull().default(0),frozen:integer('frozen').notNull().default(0),
},t=>[check('kora_test_nonnegative',sql`${t.funds}>=0 AND ${t.earnings}>=0`)]);
export const koraTestDeposits=sqliteTable('kora_test_deposits',{
 reference:text('reference').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),gross:integer('gross').notNull(),fee:integer('fee').notNull(),net:integer('net').notNull(),applied:integer('applied').notNull().default(0),createdAt:text('created_at').notNull(),
});
export const koraTestOperations=sqliteTable('kora_test_operations',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),kind:text('kind').notNull(),amount:integer('amount').notNull(),status:text('status').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('kora_test_operations_user').on(t.userId,t.createdAt)]);
export const koraTestEntries=sqliteTable('kora_test_entries',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),bucket:text('bucket').notNull(),kind:text('kind').notNull(),amount:integer('amount').notNull(),reference:text('reference').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('kora_test_entries_user').on(t.userId,t.createdAt)]);
export const koraTestMemberships=sqliteTable('kora_test_memberships',{
 userId:text('user_id').primaryKey().references(()=>users.id),expiresAt:text('expires_at').notNull(),
});

// Worker premium purchases. Test and live entitlements are separate and every
// grant is owned by an immutable server-created order, never a browser email.
export const koraPremiumOrders=sqliteTable('lh_kora_premium_orders',{
 reference:text('reference').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),mode:text('mode').notNull(),tier:text('tier').notNull(),amount:integer('amount').notNull(),status:text('status').notNull(),claim:text('claim').notNull(),checkoutUrl:text('checkout_url'),createdAt:text('created_at').notNull(),paidAt:text('paid_at'),fees:integer('fees'),applied:integer('applied').notNull().default(0),
},t=>[uniqueIndex('lh_kora_premium_claim').on(t.userId,t.mode,t.claim),index('lh_kora_premium_user').on(t.userId,t.mode),check('lh_kora_premium_amount',sql`${t.amount}>0`)]);
export const premiumGrants=sqliteTable('lh_premium_grants',{
 reference:text('reference').primaryKey().references(()=>koraPremiumOrders.reference),userId:text('user_id').notNull().references(()=>users.id),mode:text('mode').notNull(),tier:text('tier').notNull(),startsAt:text('starts_at').notNull(),expiresAt:text('expires_at').notNull(),revokedAt:text('revoked_at'),
},t=>[index('lh_premium_grants_user').on(t.userId,t.mode,t.expiresAt)]);
export const jobAlertPreferences=sqliteTable('lh_job_alert_preferences',{
 userId:text('user_id').primaryKey().references(()=>users.id),enabled:integer('enabled').notNull().default(0),city:text('city').notNull(),area:text('area').notNull().default(''),category:text('category').notNull().default(''),
});
export const jobAlerts=sqliteTable('lh_job_alerts',{
 notificationId:text('notification_id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),openingId:text('opening_id').notNull().references(()=>liveOpenings.id),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('lh_job_alert_user_opening').on(t.userId,t.openingId)]);
export const jobAlertOutbox=sqliteTable('lh_job_alert_outbox',{
 openingId:text('opening_id').primaryKey().references(()=>liveOpenings.id,{onDelete:'cascade'}),processedAt:text('processed_at'),
});

// Store the age declaration outcome, not a person's full date of birth.
export const accountAgeChecks=sqliteTable('account_age_checks',{
 userId:text('user_id').primaryKey().references(()=>users.id),confirmedAt:text('confirmed_at').notNull(),minimumAge:integer('minimum_age').notNull().default(18),method:text('method').notNull(),
});

// Account restrictions preserve saved profiles and expire without a scheduled task.
export const accountLocks=sqliteTable('account_locks',{
 userId:text('user_id').primaryKey().references(()=>users.id),kind:text('kind').notNull(),reason:text('reason').notNull(),untilAt:integer('until_at'),updatedAt:text('updated_at').notNull(),actorId:text('actor_id').notNull().references(()=>users.id),
});
export const accountLockEvents=sqliteTable('account_lock_events',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),actorId:text('actor_id').notNull().references(()=>users.id),action:text('action').notNull(),reason:text('reason').notNull(),untilAt:integer('until_at'),createdAt:text('created_at').notNull(),
});

export const messageViews=sqliteTable('message_views',{
 messageId:text('message_id').primaryKey(),engagementId:text('engagement_id').notNull().references(()=>liveEngagements.id),viewerId:text('viewer_id').notNull().references(()=>users.id),viewedAt:integer('viewed_at').notNull(),expiresAt:integer('expires_at').notNull(),purged:integer('purged').notNull().default(0),
},t=>[index('message_views_expiry').on(t.purged,t.expiresAt),index('message_views_engagement').on(t.engagementId)]);

// One compact avatar per account, shared by both profile roles.
export const accountPhotos=sqliteTable('account_photos',{
 userId:text('user_id').primaryKey().references(()=>users.id),dataUri:text('data_uri').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[check('account_photo_size',sql`length(${t.dataUri})<5000`)]);
