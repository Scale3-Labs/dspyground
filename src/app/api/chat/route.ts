import { loadUserConfig } from "@/lib/config-loader";
import {
  convertToModelMessages,
  stepCountIs,
  streamObject,
  streamText,
} from "ai";
import "dotenv/config";

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

  // Get system prompt from config
  const systemPrompt = config.systemPrompt;

  // Validate schema is defined when structured output is enabled
  if (useStructuredOutput && !config.schema) {
    return new Response(
      JSON.stringify({
        error:
          "Structured output is enabled but no schema is defined. Please define a Zod schema in dspyground.config.ts",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // If structured output is requested, use streamObject
  if (useStructuredOutput) {
    // Use schema from config (already validated above)
    const schema = config.schema!; // Non-null assertion safe here due to validation above
    console.log("📋 Using Zod schema from config");

    // Get messages array - required for both structured and non-structured
    const messages = body.messages || [];
    console.log(
      `💬 Processing structured output with ${messages.length} messages`
    );

    try {
      const objectResult = streamObject({
        model: modelId,
        schema: schema,
        system: systemPrompt,
        messages: convertToModelMessages(messages),
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
