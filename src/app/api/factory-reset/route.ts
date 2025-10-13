import { getDataDirectory } from "@/lib/config-loader";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

function getDataPaths() {
  const dataDir = getDataDirectory();
  return {
    RUNS_PATH: path.join(dataDir, "runs.json"),
    SAMPLES_PATH: path.join(dataDir, "samples.json"),
    PROMPT_PATH: path.join(dataDir, "prompt.md"),
    SCHEMA_PATH: path.join(dataDir, "schema.json"),
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

    // Reset prompt to default
    const defaultPrompt = "You are a helpful assistant.";
    await fs.writeFile(paths.PROMPT_PATH, defaultPrompt, "utf-8");

    // Reset schema to simple example
    const defaultSchema = {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the person",
        },
        age: {
          type: "number",
          description: "The age of the person",
        },
        email: {
          type: "string",
          description: "The email address",
        },
      },
      required: ["name"],
      additionalProperties: false,
    };
    await fs.writeFile(
      paths.SCHEMA_PATH,
      JSON.stringify(defaultSchema, null, 2),
      "utf-8"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error during factory reset:", error);
    return NextResponse.json(
      { error: "Failed to factory reset" },
      { status: 500 }
    );
  }
}
