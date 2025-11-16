import express from "express";
import { extractJsonArray } from "../utils/parseModelOutput.js";
import { openAiDynamicClient } from "../lib/openaiDynamicClient.js";

// Optional fallback token counter
let encodingForModel = null;
try {
  encodingForModel = (await import("tiktoken")).encoding_for_model;
} catch (e) {
  encodingForModel = null;
}

const router = express.Router();

const DEFAULT_MODEL = process.env.MODEL || "gpt-4o-mini";
const MAX_TOKENS = 1500;

// ---------------- STRICT SYSTEM PROMPT ----------------
function buildSystemPrompt() {
  return `
Your ONLY output must be EXACTLY a valid JSON array of 5 objects.
Each object must contain:
{
  "question": string,
  "options": ["A) ...","B) ...","C) ...","D) ..."],
  "answer": "A"|"B"|"C"|"D",
  "explanation": string
}
NO extra text, NO comments, NO description. ONLY JSON array.
`;
}

// ---------------- USER PROMPT ----------------
function buildUserPrompt({ subject, book, chapter, difficulty, country, language }) {
  return `
Generate EXACTLY 5 MCQs in ${language || "English"}.
Subject: ${subject || ""}
Book: ${book || ""}
Chapter: ${chapter || ""}
Difficulty: ${difficulty || "Medium"}
Country: ${country || "International"}

RULES:
→ Output ONLY a JSON array of 5 objects.
→ No explanation outside JSON.
`;
}

// ---------------- TOKEN COUNT FALLBACK ----------------
function countTokens(model, text) {
  if (!encodingForModel) return null;
  try {
    const enc = encodingForModel(model);
    return enc.encode(text).length;
  } catch (err) {
    return null;
  }
}

// ---------------- POST /generate ----------------
router.post("/", async (req, res) => {
  try {
    const { subject, book, chapter, difficulty, country, language } = req.body ?? {};
    const userOpenAiToken = req.headers["openai-token"];

    if (!userOpenAiToken) {
      return res.status(400).json({ error: "Missing OpenAI API token in header 'openai-token'." });
    }

    if (!subject && !book && !chapter) {
      return res.status(400).json({ error: "Provide at least 'subject' or 'book' or 'chapter'." });
    }

    const systemPrompt = buildSystemPrompt().trim();
    const userPrompt = buildUserPrompt({ subject, book, chapter, difficulty, country, language }).trim();

    const client = openAiDynamicClient(userOpenAiToken);

    // ---------------- AI CALL ----------------
    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0,
      max_output_tokens: MAX_TOKENS
    });

    // ---------------- Extract text ----------------
    const text =
      response.output_text?.trim() ||
      (Array.isArray(response.output)
        ? response.output.map(o => (o.content ?? []).map(c => c.text ?? c).join("")).join("").trim()
        : "");

    // ---------------- Extract Usage (Primary) ----------------
    let usage =
      response.usage ??
      response.meta?.usage ??
      response.output?.usage ??
      null;

    // ---------------- Fallback Token Counting ----------------
    let tokenReport = null;

    if (usage) {
      tokenReport = {
        prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
        completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
        total_tokens:
          usage.total_tokens ??
          ((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)),
        raw_usage: usage
      };
    } else {
      // Compute fallback
      const combinedInput = `${systemPrompt}\n${userPrompt}`;
      const promptCount = countTokens(DEFAULT_MODEL, combinedInput);
      const completionCount = countTokens(DEFAULT_MODEL, text);

      tokenReport = {
        prompt_tokens: promptCount,
        completion_tokens: completionCount,
        total_tokens:
          (promptCount || 0) + (completionCount || 0),
        note: "Token count estimated using tiktoken (OpenAI usage not returned)."
      };
    }

    // ---------------- Parse MCQ JSON ----------------
    const parsed = extractJsonArray(text);

    if (!parsed || !Array.isArray(parsed) || parsed.length !== 5) {
      return res.status(502).json({
        error: "Failed to parse JSON array of 5 MCQs.",
        preview: text.slice(0, 800),
        tokenReport
      });
    }

    const validated = parsed.map(item => ({
      question: item.question ?? "",
      options: Array.isArray(item.options) ? item.options : [],
      answer: item.answer ?? "",
      explanation: item.explanation ?? ""
    }));

    return res.json({
      success: true,
      token_usage: tokenReport,
      data: validated
    });

  } catch (err) {
    console.error("Generate MCQ error:", err?.message || err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err?.message ?? String(err)
    });
  }
});

export default router;
