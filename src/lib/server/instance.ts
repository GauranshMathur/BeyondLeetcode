import { Prisma } from '../../../prisma/generated/client';
import type { Db } from './db.ts';

export type InstanceMode = 'local' | 'multi';
export type RegistrationMode = 'open' | 'invite';

export interface Instance {
	/** The stored mode, or null when the Instance is not set up yet. */
	mode(): InstanceMode | null;
	registrationMode(): RegistrationMode;
	/**
	 * Switches the Registration Mode of a Multi-user Instance. The database is written first and memory
	 * changes only once the write has succeeded, so a failure never leaves memory Open over an Invite-only
	 * database. If a switch fails after all (a driver can fail after it commits), memory is set to what the
	 * database holds, or to invite-only when that cannot be read, and the error is still thrown. Takes effect
	 * on the next sign-up, with no restart. Throws `InvalidRegistrationModeError` for anything but 'open' or
	 * 'invite', and `RegistrationNotAvailableError` in Local mode or before Setup.
	 */
	setRegistrationMode(next: RegistrationMode): Promise<void>;
	/** Sets the Instance up as Local. Throws if it is already set up; never overwrites. */
	chooseLocal(): Promise<void>;
	/**
	 * Makes the Instance multi: creates the row when there is none, or converts a Local one. Throws
	 * if it is already multi. The result's `undo` puts it back as it was, for a setup that fails.
	 */
	chooseMulti(): Promise<{ undo(): Promise<void> }>;
}

export class InstanceAlreadySetUpError extends Error {
	constructor() {
		super('The Instance is already set up; its mode cannot be chosen again.');
		this.name = 'InstanceAlreadySetUpError';
	}
}

export class InvalidRegistrationModeError extends Error {
	constructor() {
		super("The Registration Mode is 'open' or 'invite'.");
		this.name = 'InvalidRegistrationModeError';
	}
}

export class RegistrationNotAvailableError extends Error {
	constructor() {
		super('Only a Multi-user Instance has a Registration Mode to switch.');
		this.name = 'RegistrationNotAvailableError';
	}
}

/** Whether a value read from outside (a form, a row) is one of the two Registration Modes. */
export const isRegistrationMode = (value: unknown): value is RegistrationMode =>
	value === 'open' || value === 'invite';

const isUniqueViolation = (error: unknown) =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Reads the Instance row once and holds it in memory; this module is its only writer. */
export async function createInstance(db: Db): Promise<Instance> {
	const row = await db.instance.findUnique({ where: { id: 'instance' } });
	let mode = (row?.mode as InstanceMode | undefined) ?? null;
	// A stored value that is neither mode (a hand edit, a bad migration) reads as invite-only: unknown is closed.
	let registration: RegistrationMode = isRegistrationMode(row?.registrationMode)
		? row.registrationMode
		: 'invite';
	/** Registration switches run one at a time, so the last one to start is the last to write and the one memory keeps. */
	let switching: Promise<unknown> = Promise.resolve();

	/**
	 * What the database holds, for after a switch that failed: the caller cannot tell whether the write
	 * landed (a driver can fail after it commits), so memory follows the row, not the old value. When the
	 * row cannot be read either, or holds something that is not a mode, invite-only: never fail open.
	 */
	const storedRegistration = async (): Promise<RegistrationMode> => {
		try {
			const stored = await db.instance.findUnique({ where: { id: 'instance' } });
			return isRegistrationMode(stored?.registrationMode) ? stored.registrationMode : 'invite';
		} catch {
			return 'invite';
		}
	};

	/** A refused claim means another writer got there first: adopt the stored mode instead of a stale cache. */
	const refuse = async (): Promise<never> => {
		const stored = await db.instance.findUnique({ where: { id: 'instance' } });
		mode = (stored?.mode as InstanceMode | undefined) ?? null;
		throw new InstanceAlreadySetUpError();
	};

	return {
		mode: () => mode,
		registrationMode: () => registration,
		setRegistrationMode(next) {
			// Before the queue: a refused value must not wait behind, or be hidden by, another switch.
			if (!isRegistrationMode(next)) return Promise.reject(new InvalidRegistrationModeError());
			const run = switching.then(async () => {
				try {
					if (mode !== 'multi') throw new RegistrationNotAvailableError();
					// The row's mode is the claim, as in chooseMulti: nothing is written unless it is still multi.
					const { count } = await db.instance.updateMany({
						where: { id: 'instance', mode: 'multi' },
						data: { registrationMode: next }
					});
					if (count !== 1) {
						const stored = await db.instance.findUnique({ where: { id: 'instance' } });
						mode = (stored?.mode as InstanceMode | undefined) ?? null;
						throw new RegistrationNotAvailableError();
					}
					registration = next;
				} catch (error) {
					// Whatever went wrong, memory ends on what the database holds, and the caller still sees the failure.
					registration = await storedRegistration();
					throw error;
				}
			});
			switching = run.catch(() => {});
			return run;
		},
		async chooseLocal() {
			if (mode !== null) throw new InstanceAlreadySetUpError();
			try {
				await db.instance.create({ data: { mode: 'local' } });
			} catch (error) {
				// The fixed id is the claim: a unique violation means someone set it up first.
				if (isUniqueViolation(error)) return refuse();
				throw error;
			}
			mode = 'local';
		},
		async chooseMulti() {
			const previous = mode;
			if (previous === 'multi') throw new InstanceAlreadySetUpError();
			if (previous === null) {
				try {
					await db.instance.create({ data: { mode: 'multi' } });
				} catch (error) {
					if (isUniqueViolation(error)) return refuse();
					throw error;
				}
			} else {
				// The row's current mode is the claim: only one caller sees it still `local`.
				const { count } = await db.instance.updateMany({
					where: { id: 'instance', mode: 'local' },
					data: { mode: 'multi' }
				});
				if (count !== 1) return refuse();
			}
			mode = 'multi';
			return {
				async undo() {
					if (previous === null) {
						await db.instance.deleteMany({ where: { id: 'instance', mode: 'multi' } });
					} else {
						await db.instance.updateMany({
							where: { id: 'instance', mode: 'multi' },
							data: { mode: previous }
						});
					}
					mode = previous;
				}
			};
		}
	};
}

/**
 * For the `reset-admin-password` command, in its own process (it never touches a running server's cached
 * mode, which only a restart refreshes): clears the stored mode of a multi Instance that has no Account at
 * all, so Setup opens again after a restart. Refuses, returning false and changing nothing, unless the
 * mode is multi and the User table is empty.
 *
 * One DELETE statement holds both conditions: SQLite runs a statement under the database's single write
 * lock, so a sign-up either commits before it (the table is not empty, nothing is deleted) or after it
 * (the row is gone). There is no read-then-write gap for an Account to be orphaned in. A sign-up that a
 * still-running server lets through after the clear is the one case left, which is why the command tells
 * the owner to restart straight away.
 */
export async function clearEmptyMultiInstance(db: Db): Promise<boolean> {
	const deleted =
		await db.$executeRaw`DELETE FROM "Instance" WHERE "id" = 'instance' AND "mode" = 'multi' AND NOT EXISTS (SELECT 1 FROM "User")`;
	return deleted === 1;
}
