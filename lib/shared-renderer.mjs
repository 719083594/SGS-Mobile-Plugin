/** Lazy, side-effect-free bridge to AI-Plugin's reusable native service.
 * Importing this module never starts AI, reads an account, or opens a browser. */
import { NativeCardRenderError } from './native-card-renderer.mjs';

const CODES = new Set(['INVALID_NATIVE_CARD', 'UNSAFE_NATIVE_SVG', 'INVALID_NATIVE_IMAGE',
  'NATIVE_IMAGE_LIMIT', 'NATIVE_RENDER_BUSY', 'NATIVE_BACKEND_UNAVAILABLE', 'NATIVE_RENDER_FAILED']);

export function createSharedNativeCardRenderer({
  loadService = () => import('../../AI-Plugin/src/rendering/index.mjs'),
  loadSharp = () => import('sharp'), onMetrics = null
} = {}) {
  if (typeof loadService !== 'function' || typeof loadSharp !== 'function' ||
    onMetrics !== null && typeof onMetrics !== 'function') throw new TypeError('INVALID_SHARED_RENDERER_OPTIONS');
  let pending;
  async function renderer() {
    if (!pending) pending = Promise.resolve().then(loadService).then(service => {
      if (typeof service?.createNativeCardRenderer !== 'function') throw new NativeCardRenderError('NATIVE_BACKEND_UNAVAILABLE');
      const render = service.createNativeCardRenderer({ loadSharp, onMetrics });
      if (typeof render !== 'function') throw new NativeCardRenderError('NATIVE_BACKEND_UNAVAILABLE');
      return render;
    }).catch(() => { throw new NativeCardRenderError('NATIVE_BACKEND_UNAVAILABLE'); });
    return pending;
  }
  return async card => {
    try { return await (await renderer())(card); }
    catch (error) { throw new NativeCardRenderError(CODES.has(error?.code) ? error.code : 'NATIVE_RENDER_FAILED'); }
  };
}
