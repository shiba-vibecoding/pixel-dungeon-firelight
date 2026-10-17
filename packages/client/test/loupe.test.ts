import { addHero, createItem, createMob, createWorld, floorAt, heroById, LENGTH, levelAt, T, WIDTH } from '@pd/core';
import { describe, expect, it } from 'vitest';
import { actionable, describeTap, HOLD_MS, LoupeGesture, type TapContext } from '../src/loupe';
import { planRoute } from '../src/pathpreview';

/*
 * The touch loupe's rules (loupe.ts): what a tap on a cell comes to, as main.ts tapCell decides it, and the hold's small state machine.
 * The level is the real generator's with a room carved into it: x 4..16, y 4..8 open, a chest and a heap and a monster put in.
 */

const at = (x: number, y: number): number => x + y * WIDTH;

function arena(): TapContext {
  const world = createWorld(21);
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  const me = heroById(world, 'p')!;
  const level = levelAt(world, 1);
  for (let y = 2; y < 12; y++) for (let x = 2; x < 20; x++) level.map[at(x, y)] = T.WALL;
  for (let y = 4; y <= 8; y++) for (let x = 4; x <= 16; x++) level.map[at(x, y)] = T.EMPTY;
  const floor = floorAt(world, 1);
  floor.mobs = [];
  floor.heaps = [];
  me.pos = at(4, 6);
  const all = new Array<boolean>(LENGTH).fill(true);
  const context: TapContext = {
    world, me, level, visible: all, explored: all, floating: false, aim: null,
    front: (wall) => {
      for (const side of [WIDTH, -WIDTH, -1, 1]) if (level.map[wall + side] === T.EMPTY) return wall + side;
      return null;
    },
    route: (to) => planRoute(level, me.pos, to, { occupied: new Set(floor.mobs.map((m) => m.pos)), gas: new Set(), explored: all, floating: false, heaps: new Set(), combat: false }),
  };
  return context;
}

describe('what a tap comes to', () => {
  it('a far floor cell is a walk of as many steps as the way', () => {
    const c = arena();
    expect(describeTap(c, at(10, 6))).toMatchObject({ kind: 'walk', steps: 6, cell: at(10, 6) });
  });

  it('the hero\'s own cell searches, or picks up what lies there, or takes the stairs', () => {
    const c = arena();
    expect(describeTap(c, c.me.pos).kind).toBe('search');
    floorAt(c.world, 1).heaps.push({ pos: c.me.pos, kind: 'heap', items: [createItem('potion.healing')] });
    expect(describeTap(c, c.me.pos).kind).toBe('pickup');
    floorAt(c.world, 1).heaps = [];
    c.level.exit = c.me.pos;
    expect(describeTap(c, c.me.pos).kind).toBe('descend');
  });

  it('a monster in sight is attacked by its kind, a passive one is only gone up to', () => {
    const c = arena();
    const floor = floorAt(c.world, 1);
    floor.mobs.push(createMob('#rat', 'rat', at(8, 6), 'hunting', floor.now));
    expect(describeTap(c, at(8, 6))).toMatchObject({ kind: 'attack', mob: 'rat' });
    floor.mobs = [createMob('#sad', 'ghost', at(8, 6), 'passive', floor.now)];
    expect(describeTap(c, at(8, 6)).kind).toBe('approach');
  });

  it('a monster out of sight is only a cell to walk to', () => {
    const c = arena();
    const floor = floorAt(c.world, 1);
    floor.mobs.push(createMob('#rat', 'rat', at(8, 6), 'hunting', floor.now));
    const visible = new Array<boolean>(LENGTH).fill(true);
    visible[at(8, 6)] = false;
    expect(describeTap({ ...c, visible }, at(8, 6)).kind).toBe('walk');
  });

  it('an item on the floor far off is picked up, by its name, with the steps', () => {
    const c = arena();
    floorAt(c.world, 1).heaps.push({ pos: at(12, 6), kind: 'heap', items: [createItem('potion.healing')] });
    const tapped = describeTap(c, at(12, 6));
    expect(tapped).toMatchObject({ kind: 'pickup', steps: 8 });
    expect(tapped.item?.kind).toBe('potion.healing');
  });

  it('a chest is opened, from beside it at once, from afar after the walk', () => {
    const c = arena();
    floorAt(c.world, 1).heaps.push({ pos: at(5, 6), kind: 'chest', items: [createItem('potion.healing')] });
    floorAt(c.world, 1).heaps.push({ pos: at(12, 6), kind: 'chest', items: [createItem('potion.healing')] });
    expect(describeTap(c, at(5, 6))).toMatchObject({ kind: 'open', steps: 0 });
    expect(describeTap(c, at(12, 6))).toMatchObject({ kind: 'open', steps: 7 });
  });

  it('a wall means the floor in front of it, and a wall with no floor to it is only looked at', () => {
    const c = arena();
    const tapped = describeTap(c, at(10, 3));
    expect(tapped).toMatchObject({ kind: 'walk', cell: at(10, 4) });
    expect(describeTap(c, at(10, 1)).kind).toBe('examine');
  });

  it('an unexplored cell is examined; a locked door and a barricade say what they are', () => {
    const c = arena();
    const explored = new Array<boolean>(LENGTH).fill(true);
    explored[at(12, 6)] = false;
    expect(describeTap({ ...c, explored }, at(12, 6)).kind).toBe('examine');
    c.level.map[at(9, 6)] = T.LOCKED_DOOR;
    expect(describeTap(c, at(9, 6)).kind).toBe('locked');
    c.level.map[at(9, 6)] = T.BARRICADE;
    expect(describeTap(c, at(9, 6)).kind).toBe('barricade');
  });

  it('with a shot aimed, every tap is the shot', () => {
    const c = arena();
    expect(describeTap({ ...c, aim: 'throw' }, at(10, 6)).kind).toBe('throw');
    expect(describeTap({ ...c, aim: 'zap' }, at(8, 6)).kind).toBe('zap');
  });

  it('what has a way to be done is actionable; what only says why not, or looks, is not', () => {
    expect(actionable('walk')).toBe(true);
    expect(actionable('attack')).toBe(true);
    expect(actionable('open')).toBe(true);
    expect(actionable('examine')).toBe(false);
    expect(actionable('locked')).toBe(false);
    expect(actionable('noway')).toBe(false);
  });
});

describe('the hold', () => {
  it('a quarter of a second still, and the loupe is up; lifting on a cell in the map does it', () => {
    expect(HOLD_MS).toBe(250);
    const hold = new LoupeGesture();
    hold.down(7);
    expect(hold.active).toBe(false);
    expect(hold.fire(7, true)).toBe(true);
    hold.move(7, 120, false);
    expect(hold.up(7)).toBe('act');
    expect(hold.lastCell).toBe(120);
    expect(hold.active).toBe(false);
  });

  it('a quick tap is not a hold: the timer finds the gesture ended, and lifting does nothing here (the camera makes the tap)', () => {
    const hold = new LoupeGesture();
    hold.down(7);
    expect(hold.up(7)).toBe('none');
    expect(hold.fire(7, true)).toBe(false);
  });

  it('a finger that has become a drag or a pinch never raises it', () => {
    const hold = new LoupeGesture();
    hold.down(7);
    expect(hold.fire(7, false)).toBe(false);
    expect(hold.active).toBe(false);
  });

  it('sliding moves the target, and the last cell inside the map is the one acted on', () => {
    const hold = new LoupeGesture();
    hold.down(1);
    hold.fire(1, true);
    hold.move(1, 100, false);
    hold.move(1, 101, false);
    hold.move(1, 102, false);
    expect(hold.cell).toBe(102);
    expect(hold.up(1)).toBe('act');
    expect(hold.lastCell).toBe(102);
  });

  it('sliding off the map cancels: lifting there does nothing; coming back inside brings the target back', () => {
    const hold = new LoupeGesture();
    hold.down(1);
    hold.fire(1, true);
    hold.move(1, 100, false);
    hold.move(1, -1, true);
    expect(hold.up(1)).toBe('cancel');
    const again = new LoupeGesture();
    again.down(1);
    again.fire(1, true);
    again.move(1, -1, true);
    again.move(1, 100, false);
    expect(again.up(1)).toBe('act');
  });

  it('a second finger cancels it, up or still waiting', () => {
    const hold = new LoupeGesture();
    hold.down(1);
    hold.fire(1, true);
    hold.down(2);
    expect(hold.active).toBe(false);
    expect(hold.up(1)).toBe('none');
    const waiting = new LoupeGesture();
    waiting.down(1);
    waiting.down(2);
    expect(waiting.fire(1, true)).toBe(false);
  });

  it('moves and lifts of another finger are not its own', () => {
    const hold = new LoupeGesture();
    hold.down(1);
    hold.fire(1, true);
    hold.move(2, 99, false);
    expect(hold.cell).toBe(-1);
    expect(hold.up(2)).toBe('none');
    expect(hold.active).toBe(true);
  });

  it('a lifted-then-cancelled hold leaves nothing behind for the next', () => {
    const hold = new LoupeGesture();
    hold.down(1);
    hold.fire(1, true);
    hold.move(1, 50, false);
    hold.cancel();
    hold.down(2);
    expect(hold.lastCell).toBe(-1);
    expect(hold.fire(2, true)).toBe(true);
    expect(hold.cell).toBe(-1);
  });
});
