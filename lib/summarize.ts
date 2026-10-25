import { cleanCourse, isTaskType, summarizeLocal, type Summary } from './parse';
import { toISODate } from './dates';
import { TASK_TYPES } from './types';

// Groq (OpenAI-compatible, free tier). Set XAI_API_KEY instead to use xAI Grok.
const PROVIDER = process.env.GROQ_API_KEY
  ? { base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: process.env.LLM_MODEL || '' }
  : process.env.XAI_API_KEY
    ? { base: 'https://api.x.ai/v1', key: process.env.XAI_API_KEY, model: process.env.LLM_MODEL || 'grok-3-mini' }
    : null;

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

/** Summarize free-form assignment text with an LLM; falls back to local rules on any failure. */
export async function summarize(text: string, now: Date = new Date()): Promise<Summary> {
  if (!PROVIDER) return summarizeLocal(text, now);
  try {
    const model = await pickModel(PROVIDER);
    const res = await fetch(`${PROVIDER.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PROVIDER.key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Turn a student's assignment description into JSON: {"title": string (max 80 chars, imperative, include course/subject), ` +
              `"type": one of ${TASK_TYPES.join('|')}, "course": short class name like Bio, Math or English, or null, "due": "YYYY-MM-DD" or null}. ` +
              `Today is ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${toISODate(now)}. Resolve relative dates like "friday" to the next such date. Output JSON only.`,
          },
          { role: 'user', content: text.slice(0, 6000) },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status} (model ${model})`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const local = summarizeLocal(text, now);
    return {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 100) : local.title,
      type: isTaskType(parsed.type) ? parsed.type : local.type,
      course: cleanCourse(parsed.course) ?? local.course,
      // Models are unreliable at weekday math, so a date the parser found in the text wins.
      due: local.due ?? (/^\d{4}-\d{2}-\d{2}$/.test(parsed.due ?? '') ? parsed.due : null),
    };
  } catch (err) {
    console.error('LLM summarize failed, using fallback:', err);
    return summarizeLocal(text, now);
  }
}
