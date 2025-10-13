import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

const RUNS_PATH = path.join(process.cwd(), "data", "runs.json");
const SAMPLES_PATH = path.join(process.cwd(), "data", "samples.json");
const PROMPT_PATH = path.join(process.cwd(), "data", "prompt.md");
const SCHEMA_PATH = path.join(process.cwd(), "data", "schema.json");

export async function POST() {
  try {
    // Clear runs
    await fs.writeFile(
      RUNS_PATH,
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
      SAMPLES_PATH,
      JSON.stringify(defaultSamples, null, 2),
      "utf-8"
    );

    // Reset prompt to default
    const defaultPrompt = "You are a helpful assistant.";
    await fs.writeFile(PROMPT_PATH, defaultPrompt, "utf-8");

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
      SCHEMA_PATH,
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
