import { afterEach, describe, expect, it, vi } from 'vitest';

/** A Telegram Web App of the given platform, the module loaded fresh against it. */
async function inside(platform: string, extra: Record<string, unknown> = {}, stored: Record<string, string> = {}) {
  vi.resetModules();
  const calls: string[] = [];
  const listeners = new Map<string, () => void>();
  const style = new Map<string, string>();
  const note = (name: string) => () => void calls.push(name);
  const app = {
    initData: 'query_id=1', initDataUnsafe: {}, platform, isVersionAtLeast: () => true, isFullscreen: false,
    ready: note('ready'), expand: note('expand'), requestFullscreen: note('requestFullscreen'), exitFullscreen: note('exitFullscreen'),
    disableVerticalSwipes: note('disableVerticalSwipes'), enableVerticalSwipes: note('enableVerticalSwipes'),
    enableClosingConfirmation: note('enableClosingConfirmation'), disableClosingConfirmation: note('disableClosingConfirmation'),
    setHeaderColor: note('setHeaderColor'), setBackgroundColor: note('setBackgroundColor'), setBottomBarColor: note('setBottomBarColor'),
    onEvent: (event: string, callback: () => void) => void listeners.set(event, callback),
    openTelegramLink: (url: string) => void calls.push(`link ${url}`),
    ...extra,
  };
  vi.stubGlobal('Telegram', { WebApp: app });
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored[key] ?? null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: (key: string, value: string) => void style.set(key, value) } } });
  const telegram = await import('../src/telegram');
  return { telegram, calls, listeners, style, app };
}

afterEach(() => vi.unstubAllGlobals());

describe('Telegram: the whole screen is the player’s choice', () => {
  it('stays off on a phone until the player turns it on', async () => {
    const off = await inside('android');
    off.telegram.initTelegram('#1f1d1d');
    expect(off.calls).not.toContain('requestFullscreen');
    const on = await inside('android', {}, { 'pd-fullscreen': 'on' });
    on.telegram.initTelegram('#1f1d1d');
    expect(on.calls).toContain('requestFullscreen');
  });

  it('is left at once on a computer, however it was opened', async () => {
    const desktop = await inside('tdesktop', { isFullscreen: true }, { 'pd-fullscreen': 'on' });
    desktop.telegram.initTelegram('#1f1d1d');
    expect(desktop.calls).toContain('exitFullscreen');
    expect(desktop.calls).not.toContain('requestFullscreen');
  });
});

describe('Telegram: the room at the top', () => {
  it('is the safe area and the content safe area together', async () => {
    const { style } = await inside('ios', { safeAreaInset: { top: 47 }, contentSafeAreaInset: { top: 44 } });
    expect(style.get('--pd-tg-top')).toBe('91px');
  });

  it('keeps 56 px for Telegram’s buttons in full screen on a phone when it gives none, and follows its events', async () => {
    const { style, listeners, app } = await inside('android', { isFullscreen: true, safeAreaInset: { top: 24 }, contentSafeAreaInset: { top: 0 } });
    expect(style.get('--pd-tg-top')).toBe('80px');
    Object.assign(app, { isFullscreen: false, contentSafeAreaInset: { top: 0 }, safeAreaInset: { top: 0 } });
    listeners.get('fullscreenChanged')!();
    expect(style.get('--pd-tg-top')).toBe('0px');
  });
});

describe('Telegram: a run is guarded', () => {
  it('keeps swipes off and asks before closing while it lasts, and undoes both after', async () => {
    const { telegram, calls } = await inside('android');
    telegram.guardRun(true);
    telegram.guardRun(true);
    expect(calls).toEqual(['disableVerticalSwipes', 'enableClosingConfirmation']);
    telegram.guardRun(false);
    expect(calls.slice(2)).toEqual(['enableVerticalSwipes', 'disableClosingConfirmation']);
  });

  it('puts no mode=fullscreen into the game’s links', async () => {
    const { telegram, calls } = await inside('android');
    expect(telegram.appLink()).not.toContain('mode=fullscreen');
    expect(telegram.appLink('daily')).not.toContain('mode=fullscreen');
    await telegram.shareDaily('result');
    expect(calls.find((call) => call.startsWith('link '))).not.toContain('fullscreen');
  });
});
