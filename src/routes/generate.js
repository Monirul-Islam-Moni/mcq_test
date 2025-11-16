import express from "express";
import { extractJsonArray } from "../utils/parseModelOutput.js";
import { openAiDynamicClient } from "../lib/openaiDynamicClient.js";

const router = express.Router();

const DEFAULT_MODEL = process.env.MODEL || "gpt-4o-mini";
const MAX_TOKENS = 2000; // Reduced for less token cost

// ---------------- STRICT SYSTEM PROMPT ----------------
function buildSystemPrompt() {
  return `
Your ONLY output must be EXACTLY a valid JSON array of 10 objects.
NO text before or after JSON.
NO comments.
NO natural language.
Each object must contain:
- "question": string
- "options": array of exactly 4 strings ("A) ...", "B) ...", "C) ...", "D) ...")
- "answer": one letter ("A" | "B" | "C" | "D")
- "explanation": string
`;
}

// ---------------- USER PROMPT ----------------
function buildUserPrompt({ subject, book, chapter, difficulty, country, language }) {
  return `
Generate EXACTLY 10 MCQs in ${language}.
Subject: ${subject || ""}
Book: ${book || ""}
Chapter: ${chapter || ""}
Difficulty: ${difficulty || "Medium"}
Country: ${country || "International"}

OUTPUT: ONLY a JSON array. NOTHING ELSE.
  `;
}

// ---------------- POST /generate ----------------
router.post("/", async (req, res) => {
  try {
    const { subject, book, chapter, difficulty, country, language } = req.body ?? {};
    const userOpenAiToken = req.headers["openai-token"];

    // Must supply personal OpenAI key
    if (!userOpenAiToken) {
      return res.status(400).json({
        error: "Missing OpenAI API token in header 'openai-token'."
      });
    }

    // At least one info required
    if (!subject && !book && !chapter) {
      return res.status(400).json({
        error: "Provide at least 'subject' or 'book' or 'chapter'."
      });
    }

    const client = openAiDynamicClient(userOpenAiToken);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ subject, book, chapter, difficulty, country, language });

    // OpenAI call: highly optimized for minimum token + pure JSON
    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      input: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: userPrompt.trim() }
      ],
      temperature: 0,
      max_output_tokens: MAX_TOKENS
    });

    // Extract text from response (minimal logic)
    const text =
      response.output_text?.trim() ||
      response.output?.map(o => o.content?.map(c => c.text).join(""))?.join("")?.trim() ||
      "";

    // Must be valid JSON array
    const parsed = extractJsonArray(text);

    if (!parsed || !Array.isArray(parsed) || parsed.length !== 10) {
      return res.status(502).json({
        error: "Model did not return valid JSON array of 10 items.",
        preview: text.slice(0, 500)
      });
    }

    return res.json(parsed);

  } catch (err) {
    console.error("Generate MCQ error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err?.message
    });
  }
});

export default router;
