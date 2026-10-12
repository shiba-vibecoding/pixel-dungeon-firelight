import type { HeroClass } from '@pd/core';
import { audio } from './audio';
import { t } from './i18n';

/*
 * DOM windows over the game: title screen, menu, help, death. They use the
 * original window and button frames through CSS border-image (see index.html).
 */

const root = document.getElementById('overlay')!;
const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const click = (): void => {
    audio.play('click');
    onClick();
  };
  return el('button', { className: `pd-button ${className}`.trim(), textContent: label, onclick: click });
}

function show(content: HTMLElement, dim = true): void {
  root.replaceChildren(content);
  root.classList.toggle('dim', dim);
  root.hidden = false;
}

export function hideOverlay(): void {
  root.hidden = true;
  root.replaceChildren();
}

export function overlayOpen(): boolean {
  return !root.hidden;
}

export interface TitleOptions {
  heroClass: HeroClass;
  invitedRoom: string | null;
  hasSave: boolean;
  coopAvailable: boolean;
  /** Shown outside Telegram, where the name is not known. */
  askName: string | null;
  onClass(heroClass: HeroClass): void;
  onName(name: string): void;
  onContinue(): void;
  onSolo(): void;
  onCoop(): void;
  onJoin(): void;
  onDaily(): void;
}

export function showTitle(options: TitleOptions): void {
  let selected = options.heroClass;
  const info = el('p', { className: 'pd-info', textContent: t.classInfo[selected] });
  const classes = el('div', { className: 'pd-classes' });
  const renderClasses = (): void => {
    classes.replaceChildren(
      ...HERO_CLASSES.map((heroClass) =>
        el(
          'button',
          {
            className: `pd-class${heroClass === selected ? ' selected' : ''}`,
            onclick: () => {
              selected = heroClass;
              info.textContent = t.classInfo[heroClass];
              options.onClass(heroClass);
              renderClasses();
            },
          },
          el('span', { className: `pd-class-icon icon-${heroClass}` }),
          el('span', { textContent: t.classes[heroClass] }),
        ),
      ),
    );
  };
  renderClasses();

  const name =
    options.askName !== null &&
    el('input', {
      className: 'pd-input',
      value: options.askName,
      maxLength: 20,
      placeholder: t.yourName,
      oninput: (event: Event) => options.onName((event.target as HTMLInputElement).value),
    });

  show(
    el(
      'div',
      { className: 'pd-title' },
      el('div', { className: 'pd-banner' }),
      el('p', { className: 'pd-subtitle', textContent: t.subtitle }),
      el(
        'div',
        { className: 'pd-window' },
        classes,
        info,
        name,
        options.invitedRoom && button(t.join(options.invitedRoom), options.onJoin, 'primary'),
        options.hasSave && button(t.continueRun, options.onContinue, options.invitedRoom ? '' : 'primary'),
        button(options.hasSave ? t.newRun : t.solo, options.onSolo),
        options.coopAvailable
          ? button(t.coop, options.onCoop)
          : el('p', { className: 'pd-note', textContent: t.coopUnavailable }),
        button(t.daily, options.onDaily),
        el('p', { className: 'pd-note', textContent: t.dailyInfo }),
      ),
    ),
    false,
  );
}

export interface MenuOptions {
  room: string | null;
  onResume(): void;
  onInvite(): void;
  onHelp(): void;
  onExit(): void;
}

export function showMenu(options: MenuOptions): void {
  const sound = button(audio.enabled ? t.soundOn : t.soundOff, () => {
    audio.setEnabled(!audio.enabled);
    sound.textContent = audio.enabled ? t.soundOn : t.soundOff;
  });
  show(
    el(
      'div',
      { className: 'pd-window' },
      options.room && el('p', { className: 'pd-heading', textContent: t.room(options.room) }),
      button(t.resume, options.onResume, 'primary'),
      options.room && button(t.invite, options.onInvite),
      button(t.help, options.onHelp),
      sound,
      button(t.toMenu, options.onExit),
    ),
  );
}

export function showHelp(onClose: () => void): void {
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-heading', textContent: t.help }),
      el('ul', { className: 'pd-help' }, ...t.helpText.map((line) => el('li', { textContent: line }))),
      button('OK', onClose, 'primary'),
    ),
  );
}

export interface EndOptions {
  victory: boolean;
  title: string;
  text: string;
  onRestart: () => void;
  restartLabel: string;
  onExit: () => void;
}

/** The end of a run: the whole party fell, or it won. */
export function showRunEnd(options: EndOptions): void {
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('div', { className: options.victory ? 'pd-victory' : 'pd-gameover' }),
      el('p', { className: 'pd-heading', textContent: options.title }),
      el('p', { className: 'pd-info', textContent: options.text }),
      button(options.restartLabel, options.onRestart, 'primary'),
      button(t.toMenu, options.onExit),
    ),
  );
}

let toastTimer = 0;

export function toast(text: string): void {
  const node = document.getElementById('toast')!;
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, 2500);
}
