import type { QuipData } from './quips';
import { ruClean } from './quips-ru-clean';
import { ruFoul } from './quips-ru-foul';

/** The Russian lines, both registers (fetched only in Russian: see quipsys.ts). */
export const ruQuips: QuipData = { foul: ruFoul, clean: ruClean };
