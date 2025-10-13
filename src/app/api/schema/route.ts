import { getDataDirectory } from "@/lib/config-loader";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

function getSchemaPath() {
  return path.join(getDataDirectory(), "schema.json");
}

// GET: Read the schema
export async function GET() {
  try {
    const schemaPath = getSchemaPath();
    const content = await fs.readFile(schemaPath, "utf-8");
    const schema = JSON.parse(content);
    return NextResponse.json(schema);
  } catch (error) {
    console.error("Error reading schema:", error);
    return NextResponse.json(
      { error: "Failed to read schema" },
      { status: 500 }
    );
  }
}

// POST: Update the schema
export async function POST(request: NextRequest) {
  try {
    const schema = await request.json();

    // Validate that it's valid JSON (already done by request.json())
    // Write the schema back to the file
    const schemaPath = getSchemaPath();
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error writing schema:", error);
    return NextResponse.json(
      { error: "Failed to write schema" },
      { status: 500 }
    );
  }
}
