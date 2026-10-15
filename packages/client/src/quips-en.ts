import type { QuipData } from './quips';
import { enClean } from './quips-en-clean';
import { enFoul } from './quips-en-foul';

/** The English lines, both registers (fetched only in English: see quipsys.ts). */
export const enQuips: QuipData = { foul: enFoul, clean: enClean };
