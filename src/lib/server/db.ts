import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../../../prisma/generated/client';

export type Db = PrismaClient;

/** Opens the Instance's SQLite database through libSQL (ADR 0003), e.g. `file:/data/app.db`. */
export function createDb(url: string): Db {
	return new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}
