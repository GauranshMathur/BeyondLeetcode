// Test-only fixture, run with `bun` by signup.multi.e2e.ts: makes a migrated database a Multi-user
// Instance whose Registration Mode is already Open, so that a server started on it offers Sign up.
// Nothing in the app imports this file, and the app has no code path that opens registration: this
// writes the rows a finished setup and the Users toggle (C34b) would leave behind.
import { createDb } from '../../lib/server/db.ts';

const url = process.argv[2];
if (!url) throw new Error('usage: bun seed-open-instance.ts <database url>');

const db = createDb(url);
try {
	await db.instance.create({ data: { mode: 'multi', registrationMode: 'open' } });
} finally {
	await db.$disconnect();
}
