import { splitToolResult, type ToolImage } from '../tool-results.js';
import { Store } from '../store.js';
import { Secrets } from '../secrets.js';
import { definitions } from '../tools.js';
import { Blocked, Unavailable, type Worker, type WorkerContext, type Health } from '../types.js';
import { requestBudget } from '../request-budget.js';
import { brand } from '../../shared/brand.js';
import { workerEffort } from '../effort.js';
export class OpenRouterWorker implements Worker {
  constructor(
    public store: Store,
    public secrets: Secrets,
    public transport: typeof fetch = fetch,
  ) {}
  async health(signal?: AbortSignal): Promise<Health> {
    signal?.throwIfAborted();
    const key = await this.secrets.get('openrouter');
    signal?.throwIfAborted();
    if (!key)
      return { provider: 'openrouter', ready: false, message: 'Add your OpenRouter API key.' };
    try {
      const r = await this.transport('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]),
      });
      if (!r.ok) throw new Error(`OpenRouter returned ${r.status}`);
      return {
        provider: 'openrouter',
        ready: true,
        message: 'API key connected',
        quota: (await r.json()).data,
      };
    } catch (e) {
      signal?.throwIfAborted();
      return {
        provider: 'openrouter',
        ready: false,
        message: (e as Error).message,
      };
    }
  }
  async models() {
    const r = await this.transport('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error('Model catalog unavailable');
    return (await r.json()).data;
  }
  async endpoints(model: string) {
    const parts = model.split('/');
    if (parts.length !== 2 || parts.some((p) => !p || p === '..'))
      throw new Blocked('Invalid model ID');
    const key = await this.secrets.get('openrouter');
    const r = await this.transport(
      `https://openrouter.ai/api/v1/models/${parts.map(encodeURIComponent).join('/')}/endpoints`,
      {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!r.ok) throw new Unavailable('Provider endpoint catalog unavailable.');
    return (await r.json()).data.endpoints;
  }
  async run(ctx: WorkerContext) {
    const effort = workerEffort(ctx.model);
    const key = await this.secrets.get('openrouter');
    if (!key) throw new Unavailable('OpenRouter API key is missing.');
    const profile = ctx.model;
    if (profile.inputPrice === undefined || profile.outputPrice === undefined)
      throw new Unavailable('Refresh the model catalog to get current API prices.');
    const endpoints = await this.endpoints(profile.model);
    const endpoint = profile.providerSlug
      ? endpoints.find((e: any) => e.tag === profile.providerSlug)
      : endpoints
          .filter(
            (e: any) =>
              e.tag &&
              e.supported_parameters?.includes('tools') &&
              Number(e.pricing?.prompt) * 1e6 <= profile.inputPrice! &&
              Number(e.pricing?.completion) * 1e6 <= profile.outputPrice! &&
              Number(e.pricing?.request ?? 0) <= profile.requestPrice,
          )
          .sort(
            (a: any, b: any) =>
              Number(a.pricing.prompt) +
              Number(a.pricing.completion) -
              Number(b.pricing.prompt) -
              Number(b.pricing.completion),
          )[0];
    if (!endpoint?.supported_parameters?.includes('tools'))
      throw new Unavailable('The approved provider endpoint is unavailable or lacks tool calling.');
    const model = {
      ...profile,
      providerSlug: endpoint.tag,
      inputPrice: profile.inputPrice,
      outputPrice: profile.outputPrice,
    };
    const promptPrice = Number(endpoint.pricing?.prompt) * 1e6,
      completionPrice = Number(endpoint.pricing?.completion) * 1e6,
      requestPrice = Number(endpoint.pricing?.request ?? 0);
    if (
      !Number.isFinite(promptPrice) ||
      !Number.isFinite(completionPrice) ||
      !Number.isFinite(requestPrice) ||
      promptPrice > model.inputPrice ||
      completionPrice > model.outputPrice ||
      requestPrice > (model.requestPrice ?? 0)
    )
      throw new Unavailable(
        'Provider prices changed or are unknown. Refresh the endpoint in Setup before spending.',
      );
    const tools = definitions(ctx.task.required).map((d) => ({ type: 'function', function: d }));
    const messages: any[] = [
      { role: 'system', content: ctx.prompt },
      { role: 'user', content: ctx.task.prompt },
    ];
    let imageSupport: boolean | undefined;
    for (let step = 0; step < this.store.settings().maxSteps; step++) {
      ctx.signal.throwIfAborted();
      const estimate = requestBudget(model, messages, tools);
      const reservation = this.store.reserve(ctx.task.id, 'openrouter', estimate);
      ctx.emit('api_request_started', { reservation });
      const response = await this.transport('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(120000)]),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Title': brand.name,
        },
        body: JSON.stringify({
          model: model.model,
          ...(effort === undefined ? {} : { reasoning: { effort } }),
          messages,
          tools,
          tool_choice: 'auto',
          max_tokens: model.maxOutput,
          stream: false,
          provider: {
            only: [model.providerSlug],
            allow_fallbacks: false,
            require_parameters: true,
            data_collection: 'deny',
            max_price: { prompt: model.inputPrice, completion: model.outputPrice },
          },
          usage: { include: true },
        }),
      });
      if (!response.ok) {
        if ([400, 401, 402, 403, 404, 422, 429].includes(response.status))
          this.store.settle(reservation, 0);
        throw new Error(`OpenRouter request failed (${response.status}).`);
      }
      const body = await response.json(),
        usage = body.usage;
      if (typeof usage?.cost === 'number')
        this.store.settle(reservation, usage.cost, body.id ?? '');
      else if (Number.isFinite(usage?.prompt_tokens) && Number.isFinite(usage?.completion_tokens))
        this.store.settle(
          reservation,
          (usage.prompt_tokens * model.inputPrice + usage.completion_tokens * model.outputPrice) /
            1e6 +
            (model.requestPrice ?? 0),
          body.id ?? '',
        );
      ctx.emit('api_usage', { reservation, usage: usage ?? null, reference: body.id });
      const message = body.choices?.[0]?.message;
      if (!message) throw new Error('OpenRouter response did not include a message.');
      messages.push(message);
      if (message.content) ctx.emit('message', { text: message.content });
      if (!message.tool_calls?.length) {
        if (body.choices[0].finish_reason === 'length')
          throw new Error('Worker exhausted its output allowance.');
        return message.content ?? '';
      }
      const images: ToolImage[] = [];
      for (const call of message.tool_calls) {
        ctx.signal.throwIfAborted();
        let value;
        try {
          value = await ctx.tool(call.function.name, JSON.parse(call.function.arguments));
        } catch (e) {
          if (e instanceof Blocked) throw e;
          value = { error: (e as Error).message };
        }
        const parts = splitToolResult(value);
        messages.push({ role: 'tool', tool_call_id: call.id, content: parts.text });
        images.push(...parts.images);
      }
      // Image inputs follow the complete tool-result group; interleaving them
      // would leave unmatched tool calls on multi-tool turns.
      if (images.length && imageSupport === undefined) {
        const raw = (await this.models()).find((m: any) => m.id === model.model);
        // Image rates can differ from text rates. Only transmit when the fresh
        // endpoint explicitly fits the approved prompt-price ceiling. The next
        // request reserves a full context window rather than guessing image tokens.
        const perImage = endpoint.pricing?.image;
        const perToken = endpoint.pricing?.image_token;
        imageSupport =
          raw?.architecture?.input_modalities?.includes('image') === true &&
          perImage != null &&
          Number(perImage) === 0 &&
          perToken != null &&
          Number.isFinite(Number(perToken)) &&
          Number(perToken) >= 0 &&
          Number(perToken) * 1e6 <= model.inputPrice;
      }
      if (images.length && !imageSupport)
        messages.push({
          role: 'user',
          content:
            'Preview images were generated but NOT delivered to this worker: image input or its pricing is not verified for this endpoint. Do not claim to have visually inspected them. Use text checks and report the visual limitation.',
        });
      if (images.length && imageSupport)
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Images returned by your tools, in the same order. Inspect only the stated coverage.',
            },
            ...images.map((image) => ({
              type: 'image_url',
              image_url: { url: `data:${image.mimeType};base64,${image.data}` },
            })),
          ],
        });
    }
    throw new Blocked(
      'Worker reached its tool-step limit. Review the checkpoint before continuing.',
    );
  }
}
