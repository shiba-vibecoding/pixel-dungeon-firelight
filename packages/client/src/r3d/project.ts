/*
 * The geometry of the new renderer's camera, with no Three.js and no DOM: one fixed pitch, no yaw, an orthographic lens.
 *
 * The ground plane then maps onto the screen by a plain affine map: x as it is, y squeezed by sin(pitch). So the 2D game's
 * camera (camcontrol.ts: x, y, zoom in art pixels) keeps working unchanged in a «virtual» screen whose y is stretched by
 * 1 / sin(pitch); a point of that virtual screen is a point of the ground, and the real screen is one multiplication away.
 * Everything that needs a cell from a touch (taps, the mouse, long presses) goes through the virtual screen and so needs no
 * ray at all: the ray to the floor plane IS this map (the tests check it against Three's own unprojection).
 */
import { HEIGHT, LENGTH, WIDTH } from '@pd/core';

export const TILE_PX = 16;
/** The camera's pitch above the horizon, degrees: fixed. */
export const PITCH_DEG = 70;
export const PITCH = (PITCH_DEG * Math.PI) / 180;
/** How much the ground is squeezed up and down on the screen. */
export const YS = Math.sin(PITCH);
/** How far a figure standing up is leaned back toward the camera, degrees: the sprite faces the viewer without lying down. */
export const LEAN_DEG = 20;
export const LEAN = (LEAN_DEG * Math.PI) / 180;
/**
 * A leaned sprite is shortened on screen by cos(pitch - lean); drawn this much taller it keeps the proportions of its art
 * (a rat is as wide and tall on screen as it is in 2D).
 */
export const LEAN_STRETCH = 1 / Math.cos(PITCH - LEAN);
/** A wall's height, in tiles: low enough that a walker beside it is never buried (the far edge of its top reaches about a third of a tile). */
export const WALL_H = 0.8;
/** Where a walker's feet are in its cell, art pixels from the cell's top: a little south of the middle, so a wall to its south never buries them. */
export const FEET_PX = 9;

export interface View2 {
  /** The world pixel at the virtual screen's top-left corner, and device pixels per art pixel. */
  x: number;
  y: number;
  zoom: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** A real screen's y (device pixels) on the virtual screen the camera works in. */
export const toVirtualY = (screenY: number): number => screenY / YS;

/** Where a ground point (world pixels) is on the real screen (device pixels). */
export function groundToScreen(cam: View2, wx: number, wy: number, out: Pt): Pt {
  out.x = (wx - cam.x) * cam.zoom;
  out.y = (wy - cam.y) * cam.zoom * YS;
  return out;
}

/** The ground point (world pixels) under a point of the real screen: the ray to the floor plane. */
export function screenToGround(cam: View2, sx: number, sy: number, out: Pt): Pt {
  out.x = cam.x + sx / cam.zoom;
  out.y = cam.y + sy / (cam.zoom * YS);
  return out;
}

const scratch: Pt = { x: 0, y: 0 };

/** The cell under a point of the real screen, or -1 off the map. */
export function pickCell(cam: View2, sx: number, sy: number): number {
  screenToGround(cam, sx, sy, scratch);
  const x = Math.floor(scratch.x / TILE_PX);
  const y = Math.floor(scratch.y / TILE_PX);
  return x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT ? -1 : x + y * WIDTH;
}

/** How many cells a level has (re-exported so tests need one import). */
export const CELLS = LENGTH;
