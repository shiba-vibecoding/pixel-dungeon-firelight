/*
 * A rectangle of pixels into a texture that is already on the card. `WebGLRenderer.copyTextureToTexture` does it, but it first asks the card
 * for the four unpack settings it is about to change (`getParameter`, which waits for the card's answer: four round trips a copy, several
 * a frame while blood is falling) and puts them back. The settings here are known (a texture of this renderer is only ever sent by
 * three, which sets them for each of its own sends), so they are set and not read: one bind, three settings and the send.
 */
import type { Texture, WebGLRenderer } from 'three';

interface Properties {
  __webglTexture?: WebGLTexture;
}

/**
 * Sends `data` (RGBA bytes, `w` x `h`, first row the top of the picture) to the texture at (x, y), `y` counted up from the bottom as
 * the texture is stored (a flipped canvas). Returns false, having done nothing, if the texture is not on the card yet.
 */
export function subImage(renderer: WebGLRenderer, texture: Texture, x: number, y: number, w: number, h: number, data: Uint8Array): boolean {
  const props = (renderer as unknown as { properties: { get(t: Texture): Properties } }).properties.get(texture);
  const tex = props.__webglTexture;
  if (!tex) return false;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  renderer.state.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return true;
}
