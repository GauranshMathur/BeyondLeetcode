import { type Client, createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { onTestFinished } from 'vitest';
import { PrismaClient } from '../../../prisma/generated/client';
import type { Db } from './db';

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
class ExistingClient extends PrismaLibSql {
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
	await client.executeMultiple(schemaSql);
	const db = new PrismaClient({ adapter: new ExistingClient(client) });
	onTestFinished(() => db.$disconnect());
	return db;
}
