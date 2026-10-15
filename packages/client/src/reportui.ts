import { RULES_VERSION } from '@pd/core';
import { audio } from './audio';
import type { ProblemReport, RunApi } from './checked';
import { recent } from './diag';
import { lang, t } from './i18n';
import { netlog } from './netlog';
import { build } from './report';
import { CURRENT } from './releases';
import { button, el, info, show, toast, windowOf } from './screens';
import { platform } from './telegram';

/*
 * «Сообщить о проблеме» (design system v20, components/ReleaseReport): an optional «What happened» field, «Attach
 * the run's log» (on by default), «Send», then «Sent, thank you». It is reached from the settings and from the error
 * screen. The report carries the game's version and the rules', the run's id, seed and depth, the device and
 * Telegram's platform, and — with the log attached — the last ~200 actions and the console's last errors
 * (diag.ts). It goes to the server in the body of a POST (checked.ts problem: the server's problem log, /report), never in an address.
 */

/** The run being played, as far as a report may say. */
export interface RunFacts {
  id: string;
  seed: number;
  depth: number;
  slot: string;
  seq: number;
}

export interface ReportOptions {
  api: RunApi;
  /** The run on now, if any (absent at the camp and on the error screen before a run). */
  run?: () => RunFacts | null;
  /** The window is done with: sent or cancelled. */
  onClose(): void;
}

/** The phone, shortly: the screen and the browser's own description of itself. */
function device(): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').replace(/\s+/g, ' ');
  return `${innerWidth}x${innerHeight}@${devicePixelRatio} ${agent}`.slice(0, 120);
}

/** A report as the server takes it. */
export function buildReport(text: string, attach: boolean, run: RunFacts | null): ProblemReport {
  const kept = attach ? recent() : null;
  return {
    text: text.trim().slice(0, 1000),
    attach,
    info: { version: CURRENT.version, rules: RULES_VERSION, build, ...(run ? { run } : {}), device: device(), platform, lang },
    ...(kept ? { actions: kept.actions, errors: kept.errors } : {}),
  };
}

/** The window after a report went. */
function showSent(options: ReportOptions): void {
  const done = el(
    'div',
    { className: 'pd-report-done' },
    el('i', { className: 'pd-report-check' }),
    el('h2', { className: 'pd-heading center', textContent: t.report.sentTitle }),
    info(t.report.sentText, 'pd-info center'),
  );
  const box = el('section', { className: 'pd-window narrow pd-report', role: 'dialog', ariaLabel: t.report.sentTitle }, done, button(t.report.close, options.onClose));
  show(box, options.onClose);
}

/** The form. */
export function showReport(options: ReportOptions): void {
  const text = el('textarea', { className: 'pd-textarea', rows: 4, placeholder: t.report.placeholder, maxLength: 1000 });
  text.setAttribute('aria-label', t.report.label);
  let attach = true;
  const check = el(
    'button',
    { className: 'pd-check', type: 'button' },
    el('i'),
    el('span', {}, el('b', { textContent: t.report.attach }), el('small', { textContent: t.report.attachNote })),
  );
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', 'true');
  check.onclick = () => {
    audio.play('click');
    attach = !attach;
    check.setAttribute('aria-checked', String(attach));
  };
  const send = button(t.report.send, () => void submit(), 'primary');
  const cancel = button(t.report.cancel, options.onClose, 'quiet');
  let busy = false;
  const submit = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    send.disabled = true;
    send.replaceChildren(el('span', { className: 'pd-dots' }, el('i'), el('i'), el('i')), ` ${t.report.sending}`);
    netlog('-- the player reports a problem');
    const answer = await options.api.problem(buildReport(text.value, attach, options.run?.() ?? null));
    if (!answer) {
      busy = false;
      send.disabled = false;
      send.textContent = t.report.send;
      toast(t.report.failed, { tone: 'warn' });
      return;
    }
    audio.play('gold', 1.1, 0.4);
    showSent(options);
  };
  const icon = el('i', { className: 'pd-icon' });
  icon.style.cssText = 'width:32px;height:32px;background-image:var(--spr-report)';
  const field = el(
    'label',
    { className: 'pd-field' },
    el('span', { className: 'pd-field-label' }, `${t.report.label} `, el('small', { textContent: t.report.optional })),
    text,
  );
  show(windowOf({ title: t.report.title, icon, onClose: options.onClose, className: 'pd-report' }, field, check, el('div', { className: 'pd-actions' }, send, cancel)), options.onClose);
}

/** The error screen: «Something went wrong», «Restart» and, where the server can be reached, «Report a problem» under it. */
export function showErrorScreen(options: { api: RunApi | null; run?: () => RunFacts | null; restart(): void }): void {
  const again = (): void => showErrorScreen(options);
  const icon = el('i', { className: 'pd-error-icon' });
  const report = options.api
    ? (() => {
        const node = button(t.report.title, () => showReport({ api: options.api!, ...(options.run ? { run: options.run } : {}), onClose: again }), '');
        const sprite = el('i', { className: 'pd-icon' });
        sprite.style.cssText = 'width:24px;height:24px;background-image:var(--spr-report);margin-right:6px;vertical-align:middle';
        node.prepend(sprite);
        return node;
      })()
    : null;
  show(
    windowOf(
      { narrow: true, className: 'pd-error' },
      icon,
      el('h2', { className: 'pd-heading center', textContent: t.report.errorTitle }),
      info(t.report.errorText, 'pd-info center'),
      el('div', { className: 'pd-actions' }, button(t.report.restart, options.restart, 'primary'), report),
    ),
    null,
  );
}
