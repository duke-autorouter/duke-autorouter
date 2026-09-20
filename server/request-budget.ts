import { Blocked, type Model } from './types.js';

// Shared with the worker so route eligibility uses the same first-request bound.
export function requestBudget(model: Model, messages: unknown[], tools: unknown[]) {
  if (
    model.inputPrice === undefined ||
    model.outputPrice === undefined ||
    (!model.providerSlug && !model.catalog)
  )
    throw new Blocked('Select a provider endpoint and verified prices before using this model.');
  let hasImages = false;
  const serialized = JSON.stringify({ messages, tools }, (key, value) => {
    if (key === 'image_url' && value?.url?.startsWith('data:image/')) {
      hasImages = true;
      return { url: '[image input reserved at full context capacity]' };
    }
    return value;
  });
  const inputBound = Buffer.byteLength(serialized, 'utf8') + 1024;
  if (inputBound + model.maxOutput > model.contextLimit)
    throw new Blocked('Context limit reached. Resume from a concise checkpoint.');
  return (
    ((hasImages ? model.contextLimit : inputBound) * model.inputPrice +
      model.maxOutput * model.outputPrice) /
      1e6 +
    (model.requestPrice ?? 0)
  );
}
