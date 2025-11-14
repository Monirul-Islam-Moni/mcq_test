import OpenAI from "openai";

export function openAiDynamicClient(key) {
  return new OpenAI({
    apiKey: key,
  });
}
