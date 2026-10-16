// Test-only fixture, run with `bun` by signup.multi.e2e.ts: makes a migrated database a Multi-user
// Instance whose Registration Mode is already Open, so that a server started on it offers Sign up.
// Nothing in the app imports this file. The app can open registration itself (the admin's toggle on the
// Users page, C34b), but only for a signed-in admin of a running Instance: this writes the rows a finished
// setup and that toggle would leave behind, so a test can start a server that is already open.
import { createDb } from '../../lib/server/db.ts';

const url = process.argv[2];
if (!url) throw new Error('usage: bun seed-open-instance.ts <database url>');

const db = createDb(url);
try {
	await db.instance.create({ data: { mode: 'multi', registrationMode: 'open' } });
} finally {
	await db.$disconnect();
}
