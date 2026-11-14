import type { MapTopic, MapView } from '../server/learning/rules.ts';
import { fillWidth } from './layout.ts';

/** One Topic as the Map's figure and its phone column draw it; both read this, so they never differ. */
export interface MapEntry {
	readonly id: string;
	readonly title: string;
	readonly state: MapTopic['state'];
	/** Where the Topic opens; absent for a Locked Topic, which cannot be opened. */
	readonly href: string | undefined;
	readonly current: boolean;
	/** The accessible name of the figure's node. */
	readonly label: string;
	/** Core Problems solved out of the Core total, as "n/m". */
	readonly count: string;
	/** The line under the title in the phone column. */
	readonly stateText: string;
	/** "after A, B" when the Topic has Prerequisites. */
	readonly after: string | undefined;
	/** Width in px of the filled part of the progress bar. */
	readonly fill: number;
}

export function mapEntries(map: MapView): MapEntry[] {
	const titleById = new Map(map.topics.map((t) => [t.id, t.title]));
	return map.topics.map((t): MapEntry => {
		const count = `${t.coreSolved}/${t.coreTotal}`;
		const open = t.state !== 'locked';
		// The current Topic is always open, so a Locked Topic is never worded as current.
		const current = t.id === map.currentTopicId;
		return {
			id: t.id,
			title: t.title,
			state: t.state,
			href: open ? `/topics/${t.id}` : undefined,
			current,
			label: `${t.title}, ${t.state}, ${t.coreSolved} of ${t.coreTotal} core problems solved`,
			count,
			stateText: !open
				? 'locked'
				: current
					? `current · ${count}`
					: t.state === 'complete'
						? `done · ${count}`
						: `${count} solved`,
			after:
				t.prerequisites.length > 0
					? `after ${t.prerequisites.map((id) => titleById.get(id) ?? id).join(', ')}`
					: undefined,
			fill: fillWidth(t)
		};
	});
}
