import { Prisma } from '../../../prisma/generated/client';
import type { Db } from './db.ts';

export type InstanceMode = 'local' | 'multi';
export type RegistrationMode = 'open' | 'invite';

export interface Instance {
	/** The stored mode, or null when the Instance is not set up yet. */
	mode(): InstanceMode | null;
	registrationMode(): RegistrationMode;
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

const isUniqueViolation = (error: unknown) =>
	error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Reads the Instance row once and holds it in memory; this module is its only writer. */
export async function createInstance(db: Db): Promise<Instance> {
	const row = await db.instance.findUnique({ where: { id: 'instance' } });
	let mode = (row?.mode as InstanceMode | undefined) ?? null;
	const registration = (row?.registrationMode as RegistrationMode | undefined) ?? 'invite';

	return {
		mode: () => mode,
		registrationMode: () => registration,
		async chooseLocal() {
			if (mode !== null) throw new InstanceAlreadySetUpError();
			try {
				await db.instance.create({ data: { mode: 'local' } });
			} catch (error) {
				// The fixed id is the claim: a unique violation means someone set it up first.
				if (isUniqueViolation(error)) throw new InstanceAlreadySetUpError();
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
					if (isUniqueViolation(error)) throw new InstanceAlreadySetUpError();
					throw error;
				}
			} else {
				// The row's current mode is the claim: only one caller sees it still `local`.
				const { count } = await db.instance.updateMany({
					where: { id: 'instance', mode: 'local' },
					data: { mode: 'multi' }
				});
				if (count !== 1) throw new InstanceAlreadySetUpError();
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
