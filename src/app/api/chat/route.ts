import { getDataDirectory, loadUserConfig } from "@/lib/config-loader";
import {
  convertToModelMessages,
  jsonSchema,
  stepCountIs,
  streamObject,
  streamText,
} from "ai";
import "dotenv/config";
import fs from "fs/promises";
import path from "path";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json();

  // Check for parameters in URL
  const url = new URL(req.url);
  const useStructuredOutput = url.searchParams.get("structured") === "true";
  const modelId = url.searchParams.get("model") || "openai/gpt-4o-mini";

  console.log("📊 Structured output:", useStructuredOutput ? "ACTIVE" : "OFF");
  console.log("🤖 Model:", modelId);

  // Load user config
  const config = await loadUserConfig();

  // Read system prompt from config or data/prompt.md
  let systemPrompt: string | undefined;
  try {
    const dataDir = getDataDirectory();
    const promptPath = path.join(dataDir, "prompt.md");
    const promptContent = await fs.readFile(promptPath, "utf8");
    systemPrompt = promptContent?.trim() ? promptContent : config.systemPrompt;
  } catch {
    systemPrompt = config.systemPrompt;
  }

  // If structured output is requested, use streamObject
  if (useStructuredOutput) {
    // Get the prompt from the request body
    const prompt =
      typeof body === "string" ? body : body.prompt || body.input || "";
    // Load schema from .dspyground/data/schema.json
    let schema;
    try {
      const dataDir = getDataDirectory();
      const schemaPath = path.join(dataDir, "schema.json");
      const schemaContent = await fs.readFile(schemaPath, "utf8");
      schema = JSON.parse(schemaContent);
      console.log("📋 Loaded schema from schema.json");
    } catch (error) {
      console.error("Failed to load schema:", error);
      return new Response(
        JSON.stringify({
          error:
            "Schema not found. Please create a schema.json file in the .dspyground/data folder.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("🚀 Starting streamObject...");

    try {
      const objectResult = streamObject({
        model: modelId,
        schema: jsonSchema(schema),
        system: systemPrompt,
        prompt: prompt,
      });

      return objectResult.toTextStreamResponse();
    } catch (error) {
      console.error("❌ Error in structured output:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to generate structured output",
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // Otherwise use regular streamText with messages array
  const messages = body.messages || [];
  const result = streamText({
    model: modelId,
    tools: config.tools || {},
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
