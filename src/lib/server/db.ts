import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../../../prisma/generated/client';

export type Db = PrismaClient;

/**
 * How long a libSQL connection waits for another connection's lock before SQLite fails with
 * SQLITE_BUSY (libSQL's default is 0, so a write that meets a lock fails at once; Prisma reports
 * it as P1008).
 *
 * Within one process the Prisma adapter takes a client's queries and transactions one at a time
 * behind its own mutex, so SQLite's locks matter only between processes: the web server and
 * `reset-admin-password`, which opens its own client through `createDb`. Ten seconds outlasts any
 * write here (all are short) and still fails visibly if a lock is stuck.
 */
export const BUSY_TIMEOUT_MS = 10_000;

/** Opens the Instance's SQLite database through libSQL (ADR 0003), e.g. `file:/data/app.db`. */
export function createDb(url: string): Db {
	return new PrismaClient({ adapter: new PrismaLibSql({ url, timeout: BUSY_TIMEOUT_MS }) });
}
