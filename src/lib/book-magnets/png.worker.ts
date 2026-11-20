import init, { optimise } from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js';
import wasmUrl from '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url';

self.onmessage = async ({ data: png }: MessageEvent<Blob>) => {
  try {
    await init(wasmUrl);
    const result = optimise(new Uint8Array(await png.arrayBuffer()), 1, false, false);
    self.postMessage(result, { transfer: [result.buffer] });
  } catch {
    // The canvas PNG is still usable if this device cannot run the optimiser.
    self.postMessage(null);
  }
};
