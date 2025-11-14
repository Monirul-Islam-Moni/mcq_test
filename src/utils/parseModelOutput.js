// ---------------- Clean Markdown / Backticks ----------------
export function cleanModelOutput(text) {
  if (!text) return "";
  return text.replace(/^```(\w+)?\n/, '').replace(/```$/,'').trim();
}

// ---------------- Extract JSON Array Safely ----------------
export function extractJsonArray(text) {
  if (!text) return null;
  const cleaned = cleanModelOutput(text);
  const match = cleaned.match(/\[.*\]/s); // match first JSON array
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
