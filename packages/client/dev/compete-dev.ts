import '../src/ui.css';
import '../src/game.css';
import '../src/fl-mart.css';
import '../src/fl-mart-ext.css';
import '../src/fl-compete.css';
import { showBoards } from '../src/boardsui';
import { showProfile } from '../src/profileui';
import { chatPicture, storyPicture } from '../src/sharecards';
import { myLook } from '../src/herocard';
import type { RunApi } from '../src/checked';
import { lang } from '../src/i18n';
import { board, hall, MY_NAME, profile, seasonBoard } from './fake';
import { showHall } from '../src/hallui';
import { showSeason } from '../src/seasonui';

/*
 * A page of the competitions' screens over a made-up server (no Telegram, no Cloudflare): `?s=boards&tab=day|week|all&metric=&cls=&lang=ru`.
 * It is what the screenshots in docs/compete are taken from. `window.__ready` is true once the screen is drawn.
 */

const q = new URLSearchParams(location.search);
const ru = lang === 'ru';
const api = {
  board: async (kind: string, slice?: { metric: 'score' | 'speed' | 'depth'; cls: null | 'warrior' | 'mage' | 'rogue' | 'huntress' }) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return kind === 'season' ? seasonBoard(ru) : board(kind, slice, ru, kind === 'week' ? 5732 : kind === 'all' ? 11406 : 1284);
  },
  hall: async (season?: string) => hall(ru, season),
} as unknown as RunApi;

declare global {
  interface Window {
    __ready?: boolean;
  }
}

const screen = q.get('s') ?? 'boards';
const runs = [
  { key: 'a', score: 10500, name: MY_NAME[ru ? 'ru' : 'en'], heroClass: 'mage', lvl: 19, depth: 17, gold: 1200, won: false, cause: '', mode: 'daily', checked: true, date: Date.parse('2026-10-15') },
  { key: 'b', score: 7210, name: MY_NAME[ru ? 'ru' : 'en'], heroClass: 'warrior', lvl: 14, depth: 12, gold: 800, won: false, cause: '', mode: 'solo', checked: true, date: Date.parse('2026-10-14') },
  { key: 'c', score: 2300, name: MY_NAME[ru ? 'ru' : 'en'], heroClass: 'rogue', lvl: 8, depth: 6, gold: 200, won: false, cause: '', mode: 'solo', checked: false, date: Date.parse('2026-10-10') },
] as never[];
if (screen === 'boards' || screen === 'runs') {
  const metric = q.get('metric') as 'score' | 'speed' | 'depth' | null;
  const cls = q.get('cls') as 'warrior' | 'mage' | 'rogue' | 'huntress' | null;
  showBoards({
    api, device: runs, trophies: profile(ru).trophies, profile: profile(ru), heroClass: 'mage', tab: screen === 'runs' ? 'device' : (q.get('tab') ?? 'day'),
    ...(metric || cls ? { slice: { metric: metric ?? 'score', cls } } : {}),
    onProfile: () => undefined, onSeason: () => undefined, onHall: () => undefined,
    rules: { hardship: ru ? 'Без лечения' : 'No healing', boon: ru ? 'Кошелёк' : 'Purse', info: ru ? '+150 золота на траты' : '+150 gold to spend' },
    onClose: () => undefined,
  });
}
if (screen === 'season') showSeason({ api, profile: profile(ru), onBack: () => undefined, onClose: () => undefined, onHall: () => undefined });
if (screen === 'hall') showHall({ api, onBack: () => undefined, onClose: () => undefined });
const me = (): Parameters<typeof storyPicture>[0] => ({
  name: MY_NAME[ru ? 'ru' : 'en'], heroClass: 'mage', place: q.get('place') === 'none' ? null : 4, depth: 17, streak: 12,
  look: { ...myLook('mage'), l: 'skin.mage.frost', h: 'hat.wizard', p: 'pet.firefly', f: 'fire.blue', fr: 'frame.runes' },
});
if (screen === 'profile') {
  showProfile({
    profile: profile(ru), name: MY_NAME[ru ? 'ru' : 'en'], heroClass: 'mage',
    share: [{ label: ru ? 'В сторис' : 'To a story', run: () => undefined }, { label: ru ? 'В чат' : 'To a chat', run: () => undefined }, { label: ru ? 'Сохранить картинку' : 'Save the picture', run: () => undefined }],
    preview: () => chatPicture(me()), onBack: () => undefined, onClose: () => undefined,
  });
}
if (screen === 'story' || screen === 'chat') {
  void (screen === 'story' ? storyPicture(me()) : chatPicture(me())).then((blob) => {
    document.body.style.background = '#000';
    const img = Object.assign(document.createElement('img'), { src: URL.createObjectURL(blob!) });
    img.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;object-fit:contain;z-index:99';
    document.body.append(img);
  });
}
// A frame later: the board's rows are made once its data has come.
setTimeout(() => {
  window.__ready = true;
}, 1500);
