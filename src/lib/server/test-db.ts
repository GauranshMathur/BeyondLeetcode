import { type Client, createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { onTestFinished } from 'vitest';
import { PrismaClient } from '../../../prisma/generated/client';
import type { Db } from './db';

// Replays the migration SQL directly (no _prisma_migrations table); db.test.ts
// covers the real `prisma migrate deploy` path on a file database.
const migrations = import.meta.glob<string>('/prisma/migrations/*/migration.sql', {
	query: '?raw',
	import: 'default',
	eager: true
});
const schemaSql = Object.keys(migrations)
	.sort()
	.map((path) => migrations[path])
	.join('\n');

// An in-memory database lives only on the connection that opened it, so Prisma
// must reuse the client the migrations ran on instead of opening its own.
// `createClient` is the adapter's public hook for this; test-db.test.ts fails
// with "no such table" if Prisma ever opens a second connection. The one
// connection also means a query outside an open interactive transaction fails
// with TRANSACTION_ACTIVE here where a file database would allow it.
class PrismaLibSqlOnClient extends PrismaLibSql {
	readonly #client: Client;

	constructor(client: Client) {
		super({ url: ':memory:' });
		this.#client = client;
	}

	override createClient(): Client {
		return this.#client;
	}
}

/** A fresh in-memory SQLite database with every migration applied, closed when the test ends. */
export async function createTestDb(): Promise<Db> {
	const client = createClient({ url: ':memory:' });
	const db = new PrismaClient({ adapter: new PrismaLibSqlOnClient(client) });
	onTestFinished(async () => {
		try {
			await db.$disconnect();
		} finally {
			// $disconnect closes the client only if Prisma ever connected.
			if (!client.closed) client.close();
		}
	});
	await client.executeMultiple(schemaSql);
	return db;
}
