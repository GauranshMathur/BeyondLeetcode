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
}

/** Reads the Instance row once and holds it in memory; this module is its only writer. */
export async function createInstance(db: Db): Promise<Instance> {
	const row = await db.instance.findUnique({ where: { id: 'instance' } });
	let mode = (row?.mode as InstanceMode | undefined) ?? null;
	const registration = (row?.registrationMode as RegistrationMode | undefined) ?? 'invite';

	return {
		mode: () => mode,
		registrationMode: () => registration,
		async chooseLocal() {
			if (mode !== null) throw alreadySetUp();
			try {
				await db.instance.create({ data: { mode: 'local' } });
			} catch (error) {
				// The fixed id is the claim: a unique violation means someone set it up first.
				if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
					throw alreadySetUp();
				}
				throw error;
			}
			mode = 'local';
		}
	};
}

function alreadySetUp(): Error {
	return new Error('The Instance is already set up; its mode cannot be chosen again.');
}
