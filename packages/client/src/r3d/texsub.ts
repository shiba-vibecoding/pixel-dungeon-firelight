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

const verdicts = new WeakMap<WebGLRenderer, boolean>();

/**
 * Whether a rectangle can be sent by `subImage` on this card, found once by trying it: a 2 x 2 block is sent into a 4 x 4 texture (flipped, as a
 * canvas texture is) and read back, and it must have landed where it should, with no error raised. Anything unexpected (a context that is not
 * WebGL 2, a driver that ignores the unpack settings or the flip for an array, an error, an exception) is "no", and the callers send whole
 * textures, as before the rectangles, which every card does. The check is a few microseconds and leaves the renderer's state as it found it.
 */
export function subImageSupported(renderer: WebGLRenderer): boolean {
  let known = verdicts.get(renderer);
  if (known !== undefined) return known;
  known = false;
  try {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.texStorage2D === 'function' && typeof gl.readPixels === 'function') {
      while (gl.getError() !== gl.NO_ERROR) { /* clear what was there */ }
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (tex && fbo) {
        renderer.state.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4 * 4 * 4));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        // Rows of the block, top first: (10, 20, 30, 255) (40, 50, 60, 255) over (70, 80, 90, 255) (100, 110, 120, 255).
        const block = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 1, 1, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, block);
        const was = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const px = new Uint8Array(4);
        let ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        const at = (x: number, y: number): number[] => {
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return [px[0]!, px[1]!, px[2]!, px[3]!];
        };
        // Flipped, the block's last row is the lower one: (1, 1) is (70, 80, 90), (2, 2) is (40, 50, 60); outside it nothing was written.
        if (ok) ok = at(1, 1).join() === '70,80,90,255' && at(2, 2).join() === '40,50,60,255' && at(1, 2).join() === '10,20,30,255' && at(0, 0).join() === '0,0,0,0' && at(3, 3).join() === '0,0,0,0';
        gl.bindFramebuffer(gl.FRAMEBUFFER, was);
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex);
        renderer.state.unbindTexture();
        known = ok && gl.getError() === gl.NO_ERROR;
      }
    }
  } catch {
    known = false;
  }
  verdicts.set(renderer, known);
  return known;
}
