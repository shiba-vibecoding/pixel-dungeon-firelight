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
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(callback: () => void): void };
  onEvent?(event: string, callback: () => void): void;
}

const webApp = (globalThis as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;

/** True when running inside Telegram (the script is loaded in browsers too). */
export const inTelegram = Boolean(webApp?.initData);

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

/** Shares an invitation to a room; resolves to 'copied' when it went to the clipboard instead. */
export async function shareInvite(room: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (inTelegram && webApp!.openTelegramLink) {
    const link = `${APP_LINK}?startapp=room_${encodeURIComponent(room)}`;
    webApp!.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    return 'shared';
  }
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('room', room);
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

export function haptic(kind: 'hit' | 'hurt' | 'success' | 'error'): void {
  const feedback = webApp?.HapticFeedback;
  if (!feedback || !inTelegram) return;
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
