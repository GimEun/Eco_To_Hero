import { registerHooks } from 'node:module';
import { transformSharedBuy } from './shared-autobuy-transform.mjs';
const calibration = new URL('../../scripts/calibrate-opponent-strategy.js', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== calibration) return result;
  return { ...result, source: transformSharedBuy(String(result.source).replace(/\r\n/g, '\n')) };
} });
