import { isTaskType, summarizeLocal, type Summary } from './parse';
import { toISODate } from './dates';
import { TASK_TYPES } from './types';

// Groq (OpenAI-compatible, free tier). Set XAI_API_KEY instead to use xAI Grok.
const PROVIDER = process.env.GROQ_API_KEY
  ? { url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile' }
  : process.env.XAI_API_KEY
    ? { url: 'https://api.x.ai/v1/chat/completions', key: process.env.XAI_API_KEY, model: process.env.LLM_MODEL || 'grok-3-mini' }
    : null;

/** Summarize free-form assignment text with an LLM; falls back to local rules on any failure. */
export async function summarize(text: string, now: Date = new Date()): Promise<Summary> {
  if (!PROVIDER) return summarizeLocal(text, now);
  try {
    const res = await fetch(PROVIDER.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${PROVIDER.key}` },
      body: JSON.stringify({
        model: PROVIDER.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Turn a student's assignment description into JSON: {"title": string (max 80 chars, imperative, include course/subject), ` +
              `"type": one of ${TASK_TYPES.join('|')}, "due": "YYYY-MM-DD" or null}. ` +
              `Today is ${toISODate(now)}. Resolve relative dates like "friday" to the next such date. Output JSON only.`,
          },
          { role: 'user', content: text.slice(0, 6000) },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const local = summarizeLocal(text, now);
    return {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 100) : local.title,
      type: isTaskType(parsed.type) ? parsed.type : local.type,
      due: /^\d{4}-\d{2}-\d{2}$/.test(parsed.due ?? '') ? parsed.due : local.due,
    };
  } catch (err) {
    console.error('LLM summarize failed, using fallback:', err);
    return summarizeLocal(text, now);
  }
}
