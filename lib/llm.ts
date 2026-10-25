// Groq (OpenAI-compatible, free tier). Set XAI_API_KEY instead to use xAI Grok.
const PROVIDER = process.env.GROQ_API_KEY
  ? { base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: process.env.LLM_MODEL || '' }
  : process.env.XAI_API_KEY
    ? { base: 'https://api.x.ai/v1', key: process.env.XAI_API_KEY, model: process.env.LLM_MODEL || 'grok-3-mini' }
    : null;

export const hasLLM = PROVIDER !== null;

// Model names change often, so when none is configured ask the provider which ones this key can use.
const NOT_CHAT = /whisper|guard|tts|embed|vision|audio|moderation|prompt/i;
const PREFERRED = [/llama-3\.3-70b/i, /llama-3\.1-8b/i, /gpt-oss-20b/i, /gpt-oss/i, /llama/i, /qwen/i];
let discovered: string | null = null;

async function pickModel(p: NonNullable<typeof PROVIDER>): Promise<string> {
  if (p.model) return p.model;
  if (discovered) return discovered;
  const res = await fetch(`${p.base}/models`, { headers: { authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`LLM models ${res.status}`);
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id).filter((id: string) => !NOT_CHAT.test(id));
  const pick = PREFERRED.map((re) => ids.find((id) => re.test(id))).find(Boolean) ?? ids[0];
  if (!pick) throw new Error('LLM: no chat models available');
  return (discovered = pick);
}

/** Ask the model for a JSON object. Returns null when no provider is configured; throws on provider errors. */
export async function completeJSON(system: string, user: string, timeoutMs = 15000): Promise<Record<string, unknown> | null> {
  if (!PROVIDER) return null;
  const model = await pickModel(PROVIDER);
  const res = await fetch(`${PROVIDER.base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${PROVIDER.key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`LLM ${res.status} (model ${model})`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}
