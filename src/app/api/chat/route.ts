import * as availableTools from "@/lib/tools";
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

  // Read system prompt from data/prompt.md
  let systemPrompt: string | undefined;
  try {
    const promptPath = path.join(process.cwd(), "data", "prompt.md");
    const promptContent = await fs.readFile(promptPath, "utf8");
    systemPrompt = promptContent?.trim() ? promptContent : undefined;
  } catch {
    systemPrompt = undefined;
  }

  // If structured output is requested, use streamObject
  if (useStructuredOutput) {
    // Get the prompt from the request body
    const prompt =
      typeof body === "string" ? body : body.prompt || body.input || "";
    // Load schema from data/schema.json
    let schema;
    try {
      const schemaPath = path.join(process.cwd(), "data", "schema.json");
      const schemaContent = await fs.readFile(schemaPath, "utf8");
      schema = JSON.parse(schemaContent);
      console.log("📋 Loaded schema from data/schema.json");
    } catch (error) {
      console.error("Failed to load schema:", error);
      return new Response(
        JSON.stringify({
          error:
            "Schema not found. Please create a schema.json file in the data folder.",
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
    tools: availableTools,
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
