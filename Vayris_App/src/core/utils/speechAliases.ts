/*
 * Narrow, deterministic repair of known STT distortions of app/site names.
 *
 * Vosk's small model has no vocabulary entry for "YouTube" or "WhatsApp", so it
 * decodes them into ordinary words ("you tube", "you deal", "what's up"). This
 * maps only those known distortions back onto the canonical name.
 *
 * Deliberately narrow:
 *  - It only rewrites the TARGET of an explicit launch verb, so the greeting
 *    "hey, what's up" and the question "what do you do" are never touched.
 *  - It rewrites only the matched name, preserving the rest of the utterance.
 *  - It is a fixed alias table, not a general correction/guessing layer.
 */

interface AppAlias {
  canonical: string;
  /** Matched against the start of the launch target, case-insensitively. */
  patterns: RegExp[];
}

const APP_ALIASES: AppAlias[] = [
  {
    canonical: 'YouTube',
    patterns: [/you\s*tube/, /you\s*deal/, /you\s*do/, /u\s*tube/, /youtube/],
  },
  {
    canonical: 'WhatsApp',
    patterns: [/what'?s\s*app/, /what'?s\s*up/, /whatsapp/],
  },
];

/**
 * Only these verbs put the following words in "name of a thing to launch"
 * position. Without this gate, "what's up" in casual speech would be rewritten.
 */
const LAUNCH_PREFIX = /^(\s*(?:please\s+)?(?:open|launch|start|run|play|go\s+to|goto|switch\s+to)\s+)(.+)$/i;

export function normalizeSpokenCommand(input: string): string {
  if (!input) return input;

  const match = input.match(LAUNCH_PREFIX);
  if (!match) return input;

  const prefix = match[1];
  const target = match[2];

  for (const alias of APP_ALIASES) {
    for (const pattern of alias.patterns) {
      // Anchor to the start of the target and require a word boundary so
      // "open you tube music" matches but "open yourself" does not.
      const anchored = new RegExp('^' + pattern.source + '\\b', 'i');
      if (anchored.test(target)) {
        const rewritten = prefix + target.replace(anchored, alias.canonical);
        if (rewritten !== input) {
          console.log(`[SPEECH_ALIAS] "${input}" -> "${rewritten}"`);
        }
        return rewritten;
      }
    }
  }

  return input;
}
