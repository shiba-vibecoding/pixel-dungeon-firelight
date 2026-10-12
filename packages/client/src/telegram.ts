/*
 * Telegram Mini App integration. Everything degrades gracefully in a plain
 * browser: no init data, invites become ordinary links, haptics do nothing.
 */

interface WebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name?: string; username?: string } };
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  openTelegramLink?(url: string): void;
  openLink?(url: string): void;
  openInvoice?(url: string, callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(callback: () => void): void };
  onEvent?(event: string, callback: () => void): void;
  /** Bot API 8.0: the Mini App over the whole screen. */
  isFullscreen?: boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
}

const webApp = (globalThis as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;

/** True when running inside Telegram (the script is loaded in browsers too). */
export const inTelegram = Boolean(webApp?.initData);

/** Telegram's platform (ios, android, tdesktop, weba...), or 'browser' outside it. */
export const platform: string = inTelegram ? webApp!.platform || 'telegram' : 'browser';

/** The Mini App's t.me link, used for invitations. */
const APP_LINK: string = import.meta.env.VITE_TG_APP_LINK ?? 'https://t.me/pixel_dungeon_gamebot/pixel_dungeon';

export function initTelegram(background: string): void {
  if (!webApp || !inTelegram) return;
  webApp.ready();
  webApp.expand();
  const at = (version: string): boolean => webApp.isVersionAtLeast?.(version) ?? false;
  if (at('7.7')) webApp.disableVerticalSwipes?.();
  if (at('6.1')) {
    webApp.setHeaderColor?.(background);
    webApp.setBackgroundColor?.(background);
  }
  if (at('7.10')) webApp.setBottomBarColor?.(background);
}

let onBack: (() => void) | null = null;

/** Shows Telegram's back button with a handler, or hides it with null. */
export function backButton(handler: (() => void) | null): void {
  const button = webApp?.BackButton;
  if (!button || !inTelegram || !(webApp!.isVersionAtLeast?.('6.1') ?? false)) return;
  if (!onBack && handler) button.onClick(() => onBack?.());
  onBack = handler;
  if (handler) button.show();
  else button.hide();
}

/** Calls back when Telegram changes the safe areas or the viewport. */
export function onLayoutChange(callback: () => void): void {
  if (!webApp?.onEvent || !inTelegram) return;
  for (const event of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged']) {
    webApp.onEvent(event, callback);
  }
}

/** Whether the game can go over the whole screen here: Telegram 8.0+, or a browser that allows it. */
export function canFullscreen(): boolean {
  if (inTelegram) return Boolean(webApp!.requestFullscreen && webApp!.isVersionAtLeast?.('8.0'));
  return Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
}

export function isFullscreen(): boolean {
  return inTelegram ? Boolean(webApp!.isFullscreen) : Boolean(document.fullscreenElement);
}

/** Over the whole screen, or back. */
export function setFullscreen(on: boolean): void {
  if (inTelegram) {
    if (on) webApp!.requestFullscreen?.();
    else webApp!.exitFullscreen?.();
    return;
  }
  if (on) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

export function initData(): string | undefined {
  return inTelegram ? webApp!.initData : undefined;
}

export function telegramName(): string | undefined {
  const user = webApp?.initDataUnsafe.user;
  return user ? user.first_name || user.username : undefined;
}

/** A room to join from the launch: `startapp=room_<id>` in Telegram or `?room=<id>` in a browser. */
export function invitedRoom(): string | null {
  const start = webApp?.initDataUnsafe.start_param;
  if (start?.startsWith('room_')) return start.slice('room_'.length);
  return new URLSearchParams(location.search).get('room');
}

/** True when the app was opened to play the daily dungeon (a shared result's link). */
export function launchedForDaily(): boolean {
  return webApp?.initDataUnsafe.start_param === 'daily' || new URLSearchParams(location.search).has('daily');
}

/** Shares an invitation to a room; resolves to 'copied' when it went to the clipboard instead. */
export function shareInvite(room: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  return share(`room_${room}`, { room }, text);
}

/** Shares a daily dungeon result with a link that opens today's dungeon. */
export function shareDaily(text: string): Promise<'shared' | 'copied' | 'failed'> {
  return share('daily', { daily: '' }, text);
}

async function share(
  startParam: string, query: Record<string, string>, text: string,
): Promise<'shared' | 'copied' | 'failed'> {
  if (inTelegram && webApp!.openTelegramLink) {
    const link = `${APP_LINK}?startapp=${encodeURIComponent(startParam)}`;
    webApp!.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    return 'shared';
  }
  const url = new URL(location.href);
  url.search = '';
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const link = url.toString();
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Pixel Dungeon', text, url: link });
      return 'shared';
    }
  } catch {
    // Dismissed or unsupported: fall back to the clipboard.
  }
  try {
    await navigator.clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Vibration on hits and finds, unless turned off in the settings (kept on this device). */
export const haptics = {
  on: ((): boolean => {
    try {
      return localStorage.getItem('pd-haptics') !== 'off';
    } catch {
      return true;
    }
  })(),
  set(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem('pd-haptics', on ? 'on' : 'off');
    } catch {
      // For this session only.
    }
  },
};

export function haptic(kind: 'hit' | 'hurt' | 'success' | 'error'): void {
  const feedback = webApp?.HapticFeedback;
  if (!feedback || !inTelegram || !haptics.on || !(webApp!.isVersionAtLeast?.('6.1') ?? false)) return;
  switch (kind) {
    case 'hit':
      feedback.impactOccurred('light');
      break;
    case 'hurt':
      feedback.impactOccurred('heavy');
      break;
    case 'success':
      feedback.notificationOccurred('success');
      break;
    case 'error':
      feedback.notificationOccurred('error');
      break;
  }
}

/**
 * Opens a Stars invoice (WebApp.openInvoice) and resolves to how it ended:
 * «paid», «cancelled», «failed» or «pending»; «failed» outside Telegram.
 */
export function openInvoice(link: string): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> {
  return new Promise((resolve) => {
    if (!webApp?.openInvoice || !inTelegram || !(webApp.isVersionAtLeast?.('6.1') ?? false)) {
      resolve('failed');
      return;
    }
    webApp.openInvoice(link, (status) => resolve(status));
  });
}

/** Opens a web page outside the game: Telegram's own browser, or a new tab. */
export function openExternal(url: string): void {
  if (webApp?.openLink && inTelegram) webApp.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

/** Opens a t.me link inside Telegram (a subscription's settings, a chat), or in a new tab elsewhere. */
export function openLink(url: string): void {
  if (webApp?.openTelegramLink && inTelegram) webApp.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener');
}
