import { loadUserConfig } from "@/lib/config-loader";
import { NextResponse } from "next/server";

// GET: Schema info (read-only)
export async function GET() {
  try {
    const config = await loadUserConfig();
    if (config.schema) {
      return NextResponse.json({
        hasSchema: true,
        message: "Schema is defined in dspyground.config.ts",
      });
    }

    return NextResponse.json(
      {
        hasSchema: false,
        error:
          "No schema defined. Please define a Zod schema in dspyground.config.ts to use structured output.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error reading schema:", error);
    return NextResponse.json(
      { error: "Failed to read schema" },
      { status: 500 }
    );
  }
}

// POST: Schema editing disabled
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Schema must be defined as a Zod schema in dspyground.config.ts and cannot be edited through the UI.",
    },
    { status: 400 }
  );
}
