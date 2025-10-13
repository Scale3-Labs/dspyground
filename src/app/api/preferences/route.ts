import { getDataDirectory } from "@/lib/config-loader";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

function getPreferencesFile() {
  return path.join(getDataDirectory(), "preferences.json");
}

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

// GET: Read preferences
export async function GET() {
  try {
    const preferencesFile = getPreferencesFile();
    const data = await fs.readFile(preferencesFile, "utf8");
    const preferences = JSON.parse(data) as Preferences;
    return NextResponse.json(preferences);
  } catch (error) {
    // If file doesn't exist or is invalid, return defaults and create the file
    console.error("Error reading preferences:", error);
    try {
      const preferencesFile = getPreferencesFile();
      await fs.writeFile(
        preferencesFile,
        JSON.stringify(DEFAULT_PREFERENCES, null, 2),
        "utf8"
      );
    } catch (writeError) {
      console.error("Error writing default preferences:", writeError);
    }
    return NextResponse.json(DEFAULT_PREFERENCES);
  }
}

// POST: Update preferences
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Preferences>;

    // Validate selectedModel if provided
    if (
      "selectedModel" in body &&
      (!body.selectedModel || !body.selectedModel.trim())
    ) {
      return NextResponse.json(
        { error: "selectedModel cannot be empty" },
        { status: 400 }
      );
    }

    // Read current preferences
    let currentPreferences: Preferences;
    const preferencesFile = getPreferencesFile();
    try {
      const data = await fs.readFile(preferencesFile, "utf8");
      currentPreferences = JSON.parse(data) as Preferences;
    } catch {
      currentPreferences = DEFAULT_PREFERENCES;
    }

    // Merge with new preferences
    const updatedPreferences: Preferences = {
      ...currentPreferences,
      ...body,
    };

    // Write updated preferences
    await fs.writeFile(
      preferencesFile,
      JSON.stringify(updatedPreferences, null, 2),
      "utf8"
    );

    return NextResponse.json(updatedPreferences);
  } catch (error) {
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
