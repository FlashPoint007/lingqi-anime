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
