import { t } from './i18n';
import { button, el, hideOverlay, info, overlayOpen, show } from './screens';

/*
 * «Игра открыта в другом окне» (instance.ts, session.ts `superseded`): another copy of the game has taken the run, on this device
 * or on another. This copy stands aside: it does not play and writes nothing, so neither copy overwrites the other's moves. The
 * window cannot be closed; its one button takes the run back (reading what the other copy kept), and the other copy then stands
 * aside in its turn.
 */

let shownFor: 'window' | 'device' | null = null;

/** The window is up for this kind. */
export const supersededShown = (): boolean => shownFor !== null && overlayOpen();

export function showSuperseded(kind: 'window' | 'device', takeBack: () => void): void {
  shownFor = kind;
  const text = t.meta.otherWindow;
  const take = button(text.take, () => {
    closeSuperseded();
    takeBack();
  }, 'primary');
  const box = el(
    'section',
    { className: 'pd-window narrow pd-offline', role: 'alertdialog', ariaLabel: text.title },
    el('h2', { className: 'pd-heading center', textContent: text.title }),
    info(kind === 'window' ? text.window : text.device, 'pd-info center'),
    el('div', { className: 'pd-actions' }, take),
  );
  show(box, null);
}

export function closeSuperseded(): void {
  if (shownFor === null) return;
  shownFor = null;
  hideOverlay();
}
