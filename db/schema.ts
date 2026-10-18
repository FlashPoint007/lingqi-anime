import {integer,sqliteTable,text,index,primaryKey} from 'drizzle-orm/sqlite-core';
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
 id:text('id').primaryKey(),email:text('email').notNull().unique(),passwordHash:text('password_hash').notNull(),createdAt:integer('created_at').notNull(),
});
export const emailSessions=sqliteTable('email_sessions',{
 tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),expiresAt:integer('expires_at').notNull(),
},table=>[index('email_sessions_expiry').on(table.expiresAt),index('email_sessions_user').on(table.userId)]);
export const emailAttempts=sqliteTable('email_attempts',{
 key:text('key').primaryKey(),expiresAt:integer('expires_at').notNull(),hits:integer('hits').notNull(),
},table=>[index('email_attempts_expiry').on(table.expiresAt)]);
export const siteRuleSets=sqliteTable('site_rule_sets',{
 key:text('key').primaryKey(),valueJson:text('value_json').notNull(),updatedAt:integer('updated_at').notNull(),checkedAt:integer('checked_at').notNull(),
});
