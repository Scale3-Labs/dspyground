import { generateText, tool } from "ai";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

export const humanAgentWaitTime = tool({
  description: "Estimate the current wait time to speak with a human agent.",
  inputSchema: z.object({
    topic: z
      .string()
      .optional()
      .describe("Optional topic to route to the right queue"),
  }),
  execute: async () => {
    const minutes = Math.floor(Math.random() * 61); // 0..60
    return `Estimated wait time: ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  },
});

export const routeToHumanAgent = tool({
  description: "Route the conversation to a human agent.",
  inputSchema: z.object({
    urgency: z
      .enum(["low", "medium", "high"])
      .default("low")
      .describe("Optional urgency level"),
  }),
  execute: async () => {
    return "Successfully routed to a human agent. Someone will be with you shortly.";
  },
});

export const lookupInternalKnowledgeBase = tool({
  description: "Look up an internal knowledge base for an answer.",
  inputSchema: z.object({
    query: z.string().min(1).describe("User question to search for"),
  }),
  execute: async ({ query }: { query: string }) => {
    try {
      const kbPath = path.join(process.cwd(), "src/lib/kb.md");
      const kb = await fs.readFile(kbPath, "utf-8");

      const prompt = [
        "You are an internal support assistant.",
        "Answer the user's question using ONLY the provided knowledge base context.",
        "If the information is not present or not relevant, reply EXACTLY:",
        '"No information found. Would you like me to find a human to respond to your query?"',
        "\n--- Knowledge Base Context ---\n",
        kb,
        "\n--- Question ---\n",
        query,
        "\n--- Answer ---",
      ].join("\n");

      const { text } = await generateText({
        model: "openai/gpt-4.1-mini",
        prompt,
      });

      return text.trim();
    } catch {
      return "No information found. Would you like me to find a human to respond to your query?";
    }
  },
});
