import { getDataDirectory } from "@/lib/config-loader";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

function getDataPaths() {
  const dataDir = getDataDirectory();
  return {
    RUNS_PATH: path.join(dataDir, "runs.json"),
    SAMPLES_PATH: path.join(dataDir, "samples.json"),
  };
}

export async function POST() {
  try {
    const paths = getDataPaths();

    // Clear runs
    await fs.writeFile(
      paths.RUNS_PATH,
      JSON.stringify({ runs: [] }, null, 2),
      "utf-8"
    );

    // Reset samples to default structure with a single default group
    const defaultSamples = {
      groups: [
        {
          id: "default",
          name: "Default",
          samples: [],
          createdAt: new Date().toISOString(),
        },
      ],
      currentGroupId: "default",
    };
    await fs.writeFile(
      paths.SAMPLES_PATH,
      JSON.stringify(defaultSamples, null, 2),
      "utf-8"
    );

    // Note: Prompt and schema are now defined in dspyground.config.ts
    // and cannot be reset through the UI

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error during factory reset:", error);
    return NextResponse.json(
      { error: "Failed to factory reset" },
      { status: 500 }
    );
  }
}
