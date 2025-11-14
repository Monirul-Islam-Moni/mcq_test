import express from "express";
import { extractJsonArray } from "../utils/parseModelOutput.js";
import { openAiDynamicClient } from "../lib/openaiDynamicClient.js";

const router = express.Router();

const DEFAULT_MODEL = process.env.MODEL || "gpt-4o-mini";
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 3000);

// ---------------- System Prompt ----------------
function buildSystemPrompt() {
  return `
You are an expert MCQ generator AI. You MUST follow these rules strictly:
1) Output EXACTLY a JSON array with exactly 10 objects.
2) Each object must have keys: "question", "options", "answer", "explanation". Keys MUST remain in English.
3) "options" must be an array of 4 strings prefixed as "A) ", "B) ", "C) ", "D) ".
4) "answer" must be a single capital letter: "A", "B", "C", or "D".
5) Never include any text outside the JSON array. Do not include additional commentary.
6) All questions, options, explanations MUST be written in the language requested by the user.
7) Prefer content from provided Book/Chapter when available.
`;
}

// ---------------- User Prompt ----------------
function buildUserPrompt({ subject, book, chapter, difficulty, country, language }) {
  return `
Generate 10 high-quality exam-grade MCQs following the exact JSON format specified.
Subject: ${subject || "Not provided"}
Book: ${book || "Not provided"}
Chapter: ${chapter || "Not provided"}
Difficulty: ${difficulty || "Medium"}
Country: ${country || "International"}
Language: ${language || "English"}
Output all questions, options, explanations in: ${language}.
`;
}

// ---------------- POST /generate (NO BEARER TOKEN) ----------------
router.post("/", async (req, res) => {
  try {
    const { subject, book, chapter, difficulty, country, language } = req.body ?? {};
    const userOpenAiToken = req.headers["openai-token"];

    // Check OpenAI key
    if (!userOpenAiToken) {
      return res.status(400).json({ error: "Missing OpenAI API token in header 'openai-token'." });
    }

    // Validate input
    if (!subject && !book && !chapter) {
      return res.status(400).json({
        error: "Provide at least 'subject' or 'book' or 'chapter'."
      });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      subject,
      book,
      chapter,
      difficulty,
      country,
      language
    });

    // Create dynamic OpenAI client using user's token
    const client = openAiDynamicClient(userOpenAiToken);

    // Call OpenAI
    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_output_tokens: MAX_TOKENS
    });

    const text =
      response.output_text ||
      (Array.isArray(response.output)
        ? response.output
            .map(o => (o.content ?? []).map(c => c.text ?? c).join(" "))
            .join("\n")
        : "");

    // Extract JSON
    const parsed = extractJsonArray(text);

    if (!parsed || !Array.isArray(parsed) || parsed.length !== 10) {
      return res.status(502).json({
        error: "Failed to parse model output into a JSON array of 10 items.",
        preview: text.slice(0, 1000)
      });
    }

    // Validate MCQ format
    const validated = parsed.map(item => ({
      question: item.question ?? "",
      options: Array.isArray(item.options) ? item.options : [],
      answer: item.answer ?? "",
      explanation: item.explanation ?? ""
    }));

    return res.json(validated);

  } catch (err) {
    console.error("Generate MCQ error:", err?.message || err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err?.message ?? String(err)
    });
  }
});

export default router;
