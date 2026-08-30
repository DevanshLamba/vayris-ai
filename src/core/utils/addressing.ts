export function normalizeAddressing(input: string): { normalized: string; isNameOnly: boolean } {
  let trimmed = input.trim();
  
  // Case-insensitive regex to match "Vayris", "Hey Vayris", "Hi Vayris", "Hello Vayris" at the beginning
  // Optionally followed by punctuation like comma, and any whitespace.
  const namePattern = /^(?:hey\s+|hi\s+|hello\s+)?vayris[,\.!\?]*\s*/i;
  
  const match = trimmed.match(namePattern);
  if (match) {
    const normalized = trimmed.substring(match[0].length).trim();
    if (normalized.length === 0) {
      // Input was just the name/greeting
      return { normalized: '', isNameOnly: true };
    }
    return { normalized, isNameOnly: false };
  }
  
  return { normalized: trimmed, isNameOnly: false };
}
