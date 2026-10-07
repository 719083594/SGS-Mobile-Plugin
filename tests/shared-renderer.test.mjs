import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedNativeCardRenderer } from '../lib/shared-renderer.mjs';
import { NativeCardRenderError } from '../lib/native-card-renderer.mjs';

test('共享渲染桥懒加载AI纯服务并复用SG本地后端，隐私标记原样传递', async () => {
  let imports = 0, factories = 0;
  const cards = [], backend = async () => {}, metrics = () => {};
  const render = createSharedNativeCardRenderer({ loadSharp: backend, onMetrics: metrics, loadService: async () => {
    imports++;
    return { createNativeCardRenderer: options => {
      factories++; assert.equal(options.loadSharp, backend); assert.equal(options.onMetrics, metrics);
      return async card => { cards.push(card); return Buffer.from('synthetic-jpeg'); };
    }};
  }});
  assert.equal(imports, 0);
  const own = { svg: 'synthetic-private', width: 320, height: 100, private: true };
  const pub = { svg: 'synthetic-public', width: 320, height: 100, private: false };
  await Promise.all([render(own), render(pub)]);
  assert.equal(imports, 1); assert.equal(factories, 1);
  assert.deepEqual(cards, [own, pub]);
});

test('缺少共享服务不会启动浏览器或退回不稳定后端，异常不暴露原生数据', async () => {
  for (const service of [null, {}, { createNativeCardRenderer: () => null }]) {
    const render = createSharedNativeCardRenderer({ loadService: async () => service });
    await assert.rejects(render({ private: true }), error => error instanceof NativeCardRenderError && error.code === 'NATIVE_BACKEND_UNAVAILABLE');
  }
  for (const original of [Object.assign(new Error('synthetic-private-svg'), { code: 'UNSAFE_NATIVE_SVG' }), new Error('synthetic-token')]) {
    const render = createSharedNativeCardRenderer({ loadService: async () => ({ createNativeCardRenderer: () => async () => { throw original; } }) });
    await assert.rejects(render({ private: false }), error => {
      assert(error instanceof NativeCardRenderError);
      assert.equal(error.code, original.code || 'NATIVE_RENDER_FAILED');
      assert.doesNotMatch(error.message, /synthetic/); return true;
    });
  }
});
