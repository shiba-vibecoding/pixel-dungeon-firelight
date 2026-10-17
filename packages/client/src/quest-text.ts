import { lang } from './i18n';
import { quipMode } from './quips';
import { type LineId, type QuestWords, type Register, registerOf, say, type Vars } from './quest-words';

/*
 * The quest words in the language shown, and in the register the quip setting asks for: only the foul-mouthed setting swears,
 * the clean one and «off» say the clean line (quest-words.ts). Only the language shown is fetched.
 */
const loaded = lang === 'ru' ? await import('./i18n-quest.ru') : await import('./i18n-quest');
export const Q: QuestWords = 'QUEST_RU' in loaded ? loaded.QUEST_RU : loaded.QUEST_EN;

/** The register now: the setting, asked each time. */
export const registerNow = (): Register => registerOf(quipMode.value);

/** A spoken line in the language and register of now. */
export const lineOf = (id: LineId, vars?: Vars): string => say(Q.lines[id], registerNow(), vars);
