/*
 * Detection of structured tool calls that a model emitted as ordinary text
 * instead of through the provider's tool-call channel.
 *
 * Some models answer a normal question by printing
 *   {"name":"search_files","parameters":{...}}
 * as message content. That must never reach the chat transcript: it is a tool
 * call, so it belongs in the orchestrator (guardrails -> confirmation ->
 * execution), and if it cannot be honoured it must at least be suppressed.
 */

export interface ExtractedToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * True when the text so far could still turn out to be a JSON tool call.
 * Used to hold back streaming output before it reaches the UI. Ordinary prose
 * never opens with `{` or a code fence, so normal replies stream unaffected.
 */
export function looksLikeToolCallStart(text: string): boolean {
  const t = text.trimStart();
  if (!t) return false;
  return t.startsWith('{') || t.startsWith('```');
}

function coerceArgs(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return typeof raw === 'object' ? raw : {};
}

/** Recognises the shapes models actually emit for a tool call. */
function fromObject(parsed: any): ExtractedToolCall | null {
  if (!parsed || typeof parsed !== 'object') return null;

  // {"type":"function","function":{"name":...,"arguments":{...}}}
  if (parsed.function && typeof parsed.function === 'object' && parsed.function.name) {
    return {
      name: String(parsed.function.name),
      arguments: coerceArgs(parsed.function.arguments ?? parsed.function.parameters),
    };
  }
  // {"type":"function","function":"tool_name","arguments":{...}}
  if (typeof parsed.function === 'string' && parsed.function) {
    return { name: parsed.function, arguments: coerceArgs(parsed.arguments ?? parsed.parameters) };
  }
  // {"name":"tool_name","parameters":{...}} / {"name":...,"arguments":{...}}
  if (typeof parsed.name === 'string' && parsed.name && (parsed.arguments !== undefined || parsed.parameters !== undefined)) {
    return { name: parsed.name, arguments: coerceArgs(parsed.arguments ?? parsed.parameters) };
  }
  return null;
}

/** Returns every balanced top-level {...} region in the text. */
function balancedObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return out;
}

/**
 * Extracts a tool call from message text. Handles raw JSON, ```json fenced
 * blocks, pretty-printed JSON, and JSON surrounded by prose.
 * Returns null for ordinary text.
 */
export function extractToolCallFromText(content: string): ExtractedToolCall | null {
  if (!content || typeof content !== 'string') return null;
  if (!content.includes('"name"') && !content.includes('"function"')) return null;

  // Strip code fences so ```json { ... } ``` is treated as the object itself.
  const unfenced = content.replace(/```(?:json|tool_code|tool_call)?/gi, '```');

  for (const candidate of balancedObjects(unfenced)) {
    try {
      const call = fromObject(JSON.parse(candidate));
      if (call) return call;
    } catch {
      // Not valid JSON on its own; keep scanning.
    }
  }
  return null;
}

/**
 * True when the text is a tool call that failed to parse but is unmistakably a
 * tool call. Such output must still be kept out of the transcript.
 */
export function looksLikeMalformedToolCall(content: string): boolean {
  if (!content) return false;
  return /"type"\s*:\s*"function"/.test(content);
}
