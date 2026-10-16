import { describe, expect, it } from 'vitest';
import { type Contact, EDGE_PX, PALM_PX, RESUME_MS, type Screen, TouchGuard } from '../src/touchguard';

/** A phone, 375 x 812 CSS pixels, with no safe areas to speak of. */
const PHONE: Screen = { width: 375, height: 812, left: 0, right: 0, bottom: 0 };

const finger = (id: number, x = 180, y = 400, over: Partial<Contact> = {}): Contact => ({ id, x, y, width: 24, height: 24, kind: 'touch', time: 1000, ...over });

describe('palm and large contacts', () => {
  it('a fingertip passes', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1), PHONE)).toBeNull();
    expect(guard.release(1)).toBe(true);
  });

  it('a contact beyond the threshold is held back, and its lift is no tap', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 180, 400, { width: PALM_PX + 1, height: 30 }), PHONE)).toBe('palm');
    expect(guard.blocked(1)).toBe(true);
    expect(guard.release(1)).toBe(false);
    expect(guard.held.palm).toBe(1);
  });

  it('is judged on the larger side, and a platform that does not say (0 or 1) is believed', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 180, 400, { width: 30, height: PALM_PX + 5 }), PHONE)).toBe('palm');
    expect(guard.press(finger(2, 180, 400, { width: 1, height: 1 }), PHONE)).toBeNull();
    expect(guard.press(finger(3, 180, 400, { width: 0, height: 0 }), PHONE)).toBeNull();
  });

  it('a finger that taps while the palm still rests on the screen is not a tap', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 100, 700, { width: 160, height: 160 }), PHONE)).toBe('palm');
    expect(guard.press(finger(2), PHONE)).toBeNull();
    expect(guard.release(2)).toBe(false);
    // The palm lifts; the next tap is a tap again.
    guard.release(1);
    expect(guard.press(finger(3), PHONE)).toBeNull();
    expect(guard.release(3)).toBe(true);
  });

  it('a mouse is never taken for a palm', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 180, 400, { kind: 'mouse', width: 500, height: 500 }), PHONE)).toBeNull();
    expect(guard.release(1)).toBe(true);
  });
});

describe('the edges and the gesture bar', () => {
  it('a touch within 12 px of the left, the right or the bottom edge is held back', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, EDGE_PX - 1, 400), PHONE)).toBe('edge');
    expect(guard.press(finger(2, PHONE.width - EDGE_PX + 1, 400), PHONE)).toBe('edge');
    expect(guard.press(finger(3, 180, PHONE.height - EDGE_PX + 1), PHONE)).toBe('edge');
    expect(guard.held.edge).toBe(3);
  });

  it('just inside the margin is a tap', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, EDGE_PX, 400), PHONE)).toBeNull();
    expect(guard.press(finger(2, PHONE.width - EDGE_PX, 400), PHONE)).toBeNull();
    expect(guard.press(finger(3, 180, PHONE.height - EDGE_PX), PHONE)).toBeNull();
  });

  it('the top edge is no margin: the HUD lives there, and nothing swipes from it onto the map', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 180, 2), PHONE)).toBeNull();
  });

  it('the safe areas widen the margins where the phone or Telegram claims more', () => {
    const guard = new TouchGuard();
    const notched: Screen = { ...PHONE, bottom: 34, left: 20 };
    expect(guard.press(finger(1, 180, PHONE.height - 30), notched)).toBe('edge');
    expect(guard.press(finger(2, 18, 400), notched)).toBe('edge');
    expect(guard.press(finger(3, 180, PHONE.height - 40), notched)).toBeNull();
    // A small safe area never makes the margin smaller than 12 px.
    expect(guard.press(finger(4, 5, 400), { ...PHONE, left: 2 })).toBe('edge');
  });

  it('a thumb gripping the edge does not count as a second finger: taps still work', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 3, 500), PHONE)).toBe('edge');
    expect(guard.press(finger(2), PHONE)).toBeNull();
    expect(guard.release(2)).toBe(true);
  });

  it('a mouse at the edge of the window clicks', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 1, 1, { kind: 'mouse' }), PHONE)).toBeNull();
  });
});

describe('coming back from the background', () => {
  it('drops the first touch within 400 ms, and only that one', () => {
    const guard = new TouchGuard();
    guard.resumed(5000);
    expect(guard.press(finger(1, 180, 400, { time: 5000 + RESUME_MS - 1 }), PHONE)).toBe('resume');
    expect(guard.release(1)).toBe(false);
    expect(guard.press(finger(2, 180, 400, { time: 5000 + RESUME_MS }), PHONE)).toBeNull();
    expect(guard.release(2)).toBe(true);
    expect(guard.held.resume).toBe(1);
  });

  it('a touch after the window is a tap, and the window does not linger for the next return', () => {
    const guard = new TouchGuard();
    guard.resumed(5000);
    expect(guard.press(finger(1, 180, 400, { time: 5000 + RESUME_MS + 1 }), PHONE)).toBeNull();
    guard.release(1);
    // Nothing is armed now, even for a touch that comes at a time the old window would have caught.
    expect(guard.press(finger(2, 180, 400, { time: 5000 + 10 }), PHONE)).toBeNull();
  });

  it('a second return arms it again', () => {
    const guard = new TouchGuard();
    guard.resumed(1000);
    guard.press(finger(1, 180, 400, { time: 1100 }), PHONE);
    guard.release(1);
    guard.resumed(9000);
    expect(guard.press(finger(2, 180, 400, { time: 9100 }), PHONE)).toBe('resume');
  });
});

describe('a second finger', () => {
  it('two fingers are let through for the camera (a pinch), but neither makes a tap', () => {
    const guard = new TouchGuard();
    expect(guard.press(finger(1, 100, 400), PHONE)).toBeNull();
    expect(guard.press(finger(2, 250, 400), PHONE)).toBeNull();
    expect(guard.release(2)).toBe(false);
    expect(guard.release(1)).toBe(false);
  });

  it('the tap of the finger that stayed after the first lifted is no tap either', () => {
    const guard = new TouchGuard();
    guard.press(finger(1, 100, 400), PHONE);
    guard.press(finger(2, 250, 400), PHONE);
    guard.release(1);
    expect(guard.release(2)).toBe(false);
  });

  it('a finger that comes down after the other has lifted is a tap', () => {
    const guard = new TouchGuard();
    guard.press(finger(1), PHONE);
    expect(guard.release(1)).toBe(true);
    guard.press(finger(2), PHONE);
    expect(guard.release(2)).toBe(true);
  });

  it('the app going to the background forgets the fingers that were down', () => {
    const guard = new TouchGuard();
    guard.press(finger(1), PHONE);
    guard.reset();
    guard.press(finger(2), PHONE);
    expect(guard.release(2)).toBe(true);
  });
});

describe('the switch', () => {
  it('off, nothing is held back: a palm, an edge and the first touch after a return all tap', () => {
    const guard = new TouchGuard();
    guard.enabled = false;
    guard.resumed(1000);
    expect(guard.press(finger(1, 2, 400, { time: 1100, width: 300, height: 300 }), PHONE)).toBeNull();
    expect(guard.release(1)).toBe(true);
  });

  it('is on by default', () => {
    expect(new TouchGuard().enabled).toBe(true);
  });
});
