// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
function chunkText(text, options) {
    const maxTokens = options?.maxTokens || 250; // ~1000 chars
    const overlapTokens = options?.overlapTokens || 50; // ~200 chars
    const maxChars = maxTokens * 4;
    const overlapChars = overlapTokens * 4;
    const chunks = [];
    let startIndex = 0;
    while (startIndex < text.length) {
        let endIndex = startIndex + maxChars;
        if (endIndex < text.length) {
            // Try to find a natural break (newline or space) near the end index
            const naturalBreak = text.lastIndexOf('\n', endIndex);
            if (naturalBreak > startIndex + maxChars * 0.5) {
                endIndex = naturalBreak;
            }
            else {
                const spaceBreak = text.lastIndexOf(' ', endIndex);
                if (spaceBreak > startIndex + maxChars * 0.5) {
                    endIndex = spaceBreak;
                }
            }
        }
        else {
            endIndex = text.length;
        }
        chunks.push(text.substring(startIndex, endIndex).trim());
        startIndex = endIndex - overlapChars;
        if (startIndex < 0)
            break; // Avoid infinite loop if overlap is larger than step
        if (endIndex >= text.length)
            break;
    }
    return chunks;
}
