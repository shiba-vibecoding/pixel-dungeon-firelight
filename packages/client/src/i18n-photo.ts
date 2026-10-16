import { lang } from './i18n';

/*
 * The texts of the photo mode (photoui.ts): Russian and English side by side, as the storefront's are (i18n-shop.ts). The frames and
 * the stickers carry their own names (catalog.ts).
 */

interface Words {
  title: string;
  /** The camera button's label (a button has an icon and no words). */
  camera: string;
  cameraTitle: string;
  close: string;
  filters: Record<'none' | 'warm' | 'noir' | 'dream', string>;
  filtersLabel: string;
  frames: string;
  plainFrame: string;
  noFrame: string;
  stickers: string;
  stickerHint: string;
  noStickers: string;
  bigger: string;
  smaller: string;
  save: string;
  story: string;
  preparing: string;
  saved: string;
  savedShare: string;
  saveFailed: string;
  storyFailed: string;
  holdToSave: string;
  shotFailed: string;
  storyText: string;
  campCaption: string;
  shopOpen: string;
  shopOpenHint: string;
  shopMore: string;
  preview: string;
}

const RU: Words = {
  title: 'Фото-режим',
  camera: 'Фото',
  cameraTitle: 'Сделать снимок',
  close: 'Закрыть',
  filters: { none: 'Без', warm: 'Тепло', noir: 'Нуар', dream: 'Сон' },
  filtersLabel: 'Фильтр',
  frames: 'Рамки',
  plainFrame: 'Простая',
  noFrame: 'Без рамки',
  stickers: 'Наклейки',
  stickerHint: 'Тащите наклейку, сводите пальцы, касание — убрать.',
  noStickers: 'Наклейки — в магазине, в наборе «Глубокая ночь».',
  bigger: 'Крупнее',
  smaller: 'Мельче',
  save: 'Сохранить',
  story: 'В сторис',
  preparing: 'Готовим снимок…',
  saved: 'Снимок сохранён',
  savedShare: 'Снимок готов',
  saveFailed: 'Не удалось сохранить снимок',
  storyFailed: 'Не удалось подготовить сторис',
  holdToSave: 'Нажмите на снимок и подержите, чтобы сохранить его',
  shotFailed: 'Не удалось сделать снимок',
  storyText: 'Pixel Dungeon: У костра',
  campCaption: 'Привал',
  shopOpen: 'Открыть фото-режим',
  shopOpenHint: 'Снимок героя у костра: рамка, наклейки и фильтры.',
  shopMore: 'Ещё рамки',
  preview: 'Снимок',
};

const EN: Words = {
  title: 'Photo mode',
  camera: 'Photo',
  cameraTitle: 'Take a photo',
  close: 'Close',
  filters: { none: 'None', warm: 'Warm', noir: 'Noir', dream: 'Dream' },
  filtersLabel: 'Filter',
  frames: 'Frames',
  plainFrame: 'Plain',
  noFrame: 'No frame',
  stickers: 'Stickers',
  stickerHint: 'Drag a sticker, pinch to resize, tap to remove.',
  noStickers: 'Stickers are in the shop, in the Deep Night pack.',
  bigger: 'Bigger',
  smaller: 'Smaller',
  save: 'Save',
  story: 'To story',
  preparing: 'Preparing the photo…',
  saved: 'Photo saved',
  savedShare: 'Photo ready',
  saveFailed: 'Could not save the photo',
  storyFailed: 'Could not prepare the story',
  holdToSave: 'Press and hold the photo to save it',
  shotFailed: 'Could not take the photo',
  storyText: 'Pixel Dungeon: Firelight',
  campCaption: 'Camp',
  shopOpen: 'Open photo mode',
  shopOpenHint: 'A photo of your hero by the fire: a frame, stickers and filters.',
  shopMore: 'More frames',
  preview: 'Photo',
};

export const P: Words = lang === 'ru' ? RU : EN;
