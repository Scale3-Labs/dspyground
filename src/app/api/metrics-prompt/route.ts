import { loadUserConfig } from "@/lib/config-loader";
import { NextResponse } from "next/server";

const DEFAULT_METRICS_PROMPT = {
  evaluation_instructions:
    "You are an expert AI evaluator. Evaluate the generated agent trajectory.",
  dimensions: {},
  positive_feedback_instruction: "",
  negative_feedback_instruction: "",
  comparison_positive: "",
  comparison_negative: "",
};

// GET: Read metrics prompts from config (read-only)
export async function GET() {
  try {
    const config = await loadUserConfig();

    // Return config metrics prompt or defaults
    const metricsPrompt = config.metricsPrompt || DEFAULT_METRICS_PROMPT;

    return NextResponse.json(metricsPrompt);
  } catch (error) {
    console.error("Error reading metrics prompt:", error);
    return NextResponse.json(DEFAULT_METRICS_PROMPT);
  }
}

// POST: Metrics prompt editing disabled
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Metrics prompt must be defined in dspyground.config.ts and cannot be edited through the UI.",
    },
    { status: 400 }
  );
}
