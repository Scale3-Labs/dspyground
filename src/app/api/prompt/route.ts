import { loadUserConfig } from "@/lib/config-loader";

export const runtime = "nodejs";

// GET: Read the prompt from config (read-only)
export async function GET() {
  try {
    const config = await loadUserConfig();
    const prompt = config.systemPrompt || "You are a helpful AI assistant.";

    return new Response(JSON.stringify({ prompt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error reading prompt:", error);
    return new Response(JSON.stringify({ error: "Failed to load prompt" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// POST: Prompt editing disabled - must edit config file
export async function POST() {
  return new Response(
    JSON.stringify({
      error:
        "Prompt is defined in dspyground.config.ts and cannot be edited through the UI. Please edit the config file directly.",
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }
  );
}
