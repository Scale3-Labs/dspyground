import { getDataDirectory } from "@/lib/config-loader";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

function getMetricsPromptFile() {
  return path.join(getDataDirectory(), "metrics-prompt.json");
}

// GET: Read metrics prompts
export async function GET() {
  try {
    const metricsPromptFile = getMetricsPromptFile();
    const data = await fs.readFile(metricsPromptFile, "utf-8");
    const metricsPrompt = JSON.parse(data);
    return NextResponse.json(metricsPrompt);
  } catch (error) {
    console.error("Error reading metrics prompt:", error);
    // Return default structure if file doesn't exist
    return NextResponse.json({
      evaluation_instructions:
        "You are an expert AI evaluator. Evaluate the generated agent trajectory.",
      dimensions: {},
      positive_feedback_instruction: "",
      negative_feedback_instruction: "",
      comparison_positive: "",
      comparison_negative: "",
    });
  }
}

// POST: Write metrics prompts
export async function POST(request: Request) {
  try {
    const metricsPrompt = await request.json();
    const metricsPromptFile = getMetricsPromptFile();

    await fs.writeFile(
      metricsPromptFile,
      JSON.stringify(metricsPrompt, null, 2),
      "utf-8"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error writing metrics prompt:", error);
    return NextResponse.json(
      { error: "Failed to save metrics prompts" },
      { status: 500 }
    );
  }
}
