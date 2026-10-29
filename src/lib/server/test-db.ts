import { rmSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Client, createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { onTestFinished } from 'vitest';
import { PrismaClient } from '../../../prisma/generated/client';
import { BUSY_TIMEOUT_MS, type Db } from './db';

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

// Replaying 11 migrations into a fresh file costs more than most tests spend, so the schema is
// applied once per worker, into a template file, and each database is a copy of that file. The
// template lives in its own temp directory, removed when the worker exits.
let template: Promise<string> | undefined;

function templateDatabase(): Promise<string> {
	template ??= (async () => {
		const dir = await mkdtemp(join(tmpdir(), 'beyondleetcode-template-'));
		process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
		const file = join(dir, 'template.db');
		const client = createClient({ url: `file:${file}` });
		try {
			// Durability is pointless for a file that is copied and thrown away.
			await client.execute('PRAGMA synchronous = OFF');
			await client.executeMultiple(schemaSql);
		} finally {
			client.close();
		}
		return file;
	})();
	return template;
}

// Prisma's adapter opens one libSQL client per connect and one per in-flight transaction.
// Keeping every client lets teardown close them all, so none can reopen the file once its directory
// is gone (the SQLITE_CANTOPEN seen on CI).
class PrismaLibSqlTracked extends PrismaLibSql {
	readonly clients: Client[] = [];

	constructor(url: string) {
		super({ url, timeout: BUSY_TIMEOUT_MS });
	}

	override createClient(config: Parameters<PrismaLibSql['createClient']>[0]): Client {
		const client = super.createClient(config);
		// The pragma belongs to a connection, not to the file, so each client sets its own. libSQL's
		// file client runs a statement synchronously when it is called, so this lands before any
		// query that follows; test-db.test.ts reads it back inside a transaction.
		void client.execute('PRAGMA synchronous = OFF');
		this.clients.push(client);
		return client;
	}
}

/**
 * A fresh SQLite database in a temp file with every migration applied, deleted when the test
 * ends. For tests of concurrency: unlike the in-memory database above it gives each Prisma
 * transaction its own connection, as production does. The adapter still runs one client's
 * transactions one at a time, so SQLite's lock is contended only by another process or client.
 */
export async function createFileTestDb(): Promise<Db> {
	const source = await templateDatabase();
	const dir = await mkdtemp(join(tmpdir(), 'beyondleetcode-test-'));
	const file = join(dir, 'test.db');
	const adapter = new PrismaLibSqlTracked(`file:${file}`);
	const db = new PrismaClient({ adapter });
	onTestFinished(async () => {
		try {
			await db.$disconnect();
		} finally {
			try {
				for (const client of adapter.clients) if (!client.closed) client.close();
			} finally {
				await rm(dir, { recursive: true, force: true, maxRetries: 3 });
			}
		}
	});
	await copyFile(source, file);
	return db;
}
