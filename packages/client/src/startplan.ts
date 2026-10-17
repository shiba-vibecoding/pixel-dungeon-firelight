/*
 * How a run is started or carried on (main.ts startRun), decided from what the device holds and what it can reach. Kept apart
 * from the screens so that the reconcile rules are one place and testable:
 *
 *  - a kept run is carried on, whatever the server says first: a checked one (the server's id and the moves it has not taken)
 *    is checked against the server's copy by the session at once, and the server is the word on a ranked run (its copy comes back
 *    if the device's parted from it); a run played on the device alone has only the device's copy, and the newer valid one wins;
 *  - a kept checked run with no way to the server just now (no init data this time: Telegram being slow, or the page opened
 *    outside it) is NOT thrown away: it is carried on as a checked run whose server cannot be reached, which keeps its moves for
 *    the next time;
 *  - nothing usable kept (none, or damaged beyond the backup): the server's run in the slot if it has one, else a new one.
 */

export type StartPlan =
  /** The kept run, checked against the server's. */
  | 'resume-checked'
  /** The kept run, played on the device alone. */
  | 'resume-local'
  /** The kept checked run, the server out of reach by lack of a way to it: its moves are kept for later. */
  | 'resume-offline'
  /** The server's run in the slot, or a new one from the server. */
  | 'server'
  /** A new run on the device alone. */
  | 'local-new';

export function planStart(facts: { kept: boolean; check: boolean; stale: boolean; api: boolean }): StartPlan {
  if (facts.kept && !facts.stale) {
    if (!facts.check) return 'resume-local';
    return facts.api ? 'resume-checked' : 'resume-offline';
  }
  return facts.api ? 'server' : 'local-new';
}
