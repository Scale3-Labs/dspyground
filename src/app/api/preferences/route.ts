import { loadUserConfig } from "@/lib/config-loader";
import { NextResponse } from "next/server";

type Preferences = {
  selectedModel: string;
  isTeachingMode: boolean;
  useStructuredOutput: boolean;
  // Optimizer settings
  optimizationModel?: string;
  reflectionModel?: string;
  batchSize?: number;
  numRollouts?: number;
  selectedMetrics?: string[];
  optimizeStructuredOutput?: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  selectedModel: "openai/gpt-4.1-mini",
  isTeachingMode: false,
  useStructuredOutput: false,
  // Optimizer defaults
  optimizationModel: "openai/gpt-4.1-mini",
  reflectionModel: "openai/gpt-4.1",
  batchSize: 3,
  numRollouts: 10,
  selectedMetrics: ["accuracy"],
  optimizeStructuredOutput: false,
};

// GET: Read preferences from config (read-only)
export async function GET() {
  try {
    const config = await loadUserConfig();

    // Merge config preferences with defaults
    const preferences: Preferences = {
      ...DEFAULT_PREFERENCES,
      ...config.preferences,
    };

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error reading preferences:", error);
    return NextResponse.json(DEFAULT_PREFERENCES);
  }
}

// POST: Preferences editing disabled
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Preferences must be defined in dspyground.config.ts and cannot be edited through the UI.",
    },
    { status: 400 }
  );
}
