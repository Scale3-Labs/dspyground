import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

function getPromptPath() {
  return path.join(process.cwd(), "data", "prompt.md");
}

async function ensureFile(): Promise<void> {
  const filePath = getPromptPath();
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
  try {
    await fs.access(filePath);
  } catch {
    // Create empty prompt file if it doesn't exist
    await fs.writeFile(filePath, "", "utf-8");
  }
}

export async function GET() {
  try {
    await ensureFile();
    const content = await fs.readFile(getPromptPath(), "utf-8");
    return new Response(JSON.stringify({ prompt: content }), {
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

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const prompt = json.prompt;

    if (typeof prompt !== "string") {
      throw new Error("Invalid prompt: must be a string");
    }

    await ensureFile();
    await fs.writeFile(getPromptPath(), prompt, "utf-8");

    return new Response(JSON.stringify({ success: true, prompt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error saving prompt:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
