import type { HeroClass } from '@pd/core';
import { chatPicture, type HeroPicture, storyPicture } from './sharecards';

/*
 * The result as a picture to send: the hero by his own fire, as the hero card dresses him, in the armour he wore at the end (sharecards.ts).
 * The card that used to be drawn here from the class's old portrait (avatars.png) is gone: every caller tells the hero's look.
 */

export interface ShareCard {
  name: string;
  heroClass: HeroClass;
  level: number;
  depth: number;
  score: number;
  /** Place on today's board, if known. */
  place: number | null;
  won: boolean;
  /** What ended the run, for a fall. */
  cause: string;
  /** The card's heading: the daily dungeon's (with the day) by default. */
  title?: string;
  /** The hero as he is dressed, for the hero pictures (sharecards.ts): the story and the card for a chat are those. */
  hero: HeroPicture;
}

/** The card for a chat (1280 x 640): the hero by his fire. */
export function shareCard(data: ShareCard): Promise<Blob | null> {
  return chatPicture(data.hero);
}

/** The card on a phone's whole screen (1080 x 1920) for a story. */
export function storyCard(data: ShareCard): Promise<Blob | null> {
  return storyPicture(data.hero);
}

/**
 * Shares the picture where the phone can share files (the Web Share API);
 * false where it cannot, for the caller to share text instead.
 */
export async function sharePicture(data: ShareCard, text: string): Promise<boolean> {
  try {
    const blob = await shareCard(data);
    if (!blob) return false;
    const file = new File([blob], 'pixel-dungeon-daily.png', { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], text });
    return true;
  } catch (error) {
    // Cancelled by the player: shared nothing, but nothing else to offer either.
    return error instanceof DOMException && error.name === 'AbortError';
  }
}
