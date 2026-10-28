import {integer,sqliteTable,text,index,primaryKey,uniqueIndex} from 'drizzle-orm/sqlite-core';
// Shared public metadata and source directories. No user history or video bytes.
export const sharedCache=sqliteTable('shared_cache',{
 key:text('key').primaryKey(),kind:text('kind').notNull(),valueJson:text('value_json').notNull(),
 updatedAt:integer('updated_at').notNull(),expiresAt:integer('expires_at').notNull(),staleUntil:integer('stale_until').notNull(),
},table=>[index('shared_cache_stale').on(table.staleUntil),index('shared_cache_updated').on(table.updatedAt)]);
// Short lived reservations; the client identifier is an HMAC, never a raw IP.
export const requestBuckets=sqliteTable('request_buckets',{
 key:text('key').primaryKey(),windowStart:integer('window_start').notNull(),hits:integer('hits').notNull(),
},table=>[index('request_buckets_window').on(table.windowStart)]);
// Private records are keyed only by the platform-authenticated account ID.
export const personalItems=sqliteTable('personal_items',{
 userId:text('user_id').notNull(),kind:text('kind').notNull(),subjectId:integer('subject_id').notNull(),
 valueJson:text('value_json'),version:integer('version').notNull(),updatedAt:integer('updated_at').notNull(),sortAt:integer('sort_at').notNull(),mutationId:text('mutation_id').notNull(),
},table=>[primaryKey({columns:[table.userId,table.kind,table.subjectId]}),index('personal_items_owner_sort').on(table.userId,table.kind,table.sortAt)]);
export const emailAccounts=sqliteTable('email_accounts',{
 id:text('id').primaryKey(),email:text('email').notNull().unique(),passwordHash:text('password_hash').notNull(),createdAt:integer('created_at').notNull(),emailVerifiedAt:integer('email_verified_at'),
});
// Only hashes of single-use mail links are stored; account creation waits for mailbox proof.
export const emailActionTokens=sqliteTable('email_action_tokens',{
 tokenHash:text('token_hash').primaryKey(),email:text('email').notNull(),purpose:text('purpose').notNull(),userId:text('user_id'),credentialHash:text('credential_hash'),
 createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),usedAt:integer('used_at'),claimId:text('claim_id'),
},table=>[index('email_action_expiry').on(table.expiresAt),index('email_action_owner').on(table.email,table.purpose)]);
export const emailSessions=sqliteTable('email_sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),expiresAt:integer('expires_at').notNull(),
},table=>[index('email_sessions_expiry').on(table.expiresAt),index('email_sessions_user').on(table.userId)]);
export const emailAttempts=sqliteTable('email_attempts',{
 key:text('key').primaryKey(),expiresAt:integer('expires_at').notNull(),hits:integer('hits').notNull(),
},table=>[index('email_attempts_expiry').on(table.expiresAt)]);
export const siteRuleSets=sqliteTable('site_rule_sets',{
 key:text('key').primaryKey(),valueJson:text('value_json').notNull(),updatedAt:integer('updated_at').notNull(),checkedAt:integer('checked_at').notNull(),
});
export const discussionPosts=sqliteTable('discussion_posts',{
 id:text('id').primaryKey(),subjectId:integer('subject_id').notNull(),scope:text('scope').notNull(),parentId:text('parent_id'),
 userId:text('user_id').notNull(),alias:text('alias').notNull(),body:text('body').notNull(),
 createdAt:integer('created_at').notNull(),deletedAt:integer('deleted_at'),mutationId:text('mutation_id').notNull(),
},table=>[index('discussion_scope_created').on(table.subjectId,table.scope,table.createdAt),index('discussion_user_created').on(table.userId,table.createdAt),index('discussion_parent').on(table.parentId),uniqueIndex('discussion_mutation').on(table.userId,table.mutationId)]);
export const siteDanmaku=sqliteTable('site_danmaku',{
 id:text('id').primaryKey(),subjectId:integer('subject_id').notNull(),episode:text('episode').notNull(),
 userId:text('user_id').notNull(),timeMs:integer('time_ms').notNull(),mode:integer('mode').notNull(),color:integer('color').notNull(),body:text('body').notNull(),
 createdAt:integer('created_at').notNull(),deletedAt:integer('deleted_at'),mutationId:text('mutation_id').notNull(),
},table=>[index('site_danmaku_timeline').on(table.subjectId,table.episode,table.deletedAt,table.timeMs),index('site_danmaku_user_created').on(table.userId,table.createdAt),index('site_danmaku_own_episode').on(table.userId,table.subjectId,table.episode,table.createdAt),uniqueIndex('site_danmaku_mutation').on(table.userId,table.mutationId)]);
