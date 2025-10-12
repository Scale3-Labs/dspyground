import type { UIMessage } from "ai";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

export const runtime = "nodejs";

// Simple message format: just role and content
const SimpleMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

// Feedback schema
const FeedbackSchema = z.object({
  rating: z.enum(["positive", "negative"]),
  comment: z.string().optional(),
});

// Schema for samples with simple messages
const SessionSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  messages: z.array(SimpleMessageSchema),
  feedback: FeedbackSchema.optional(),
});

const SamplesSchema = z.object({
  samples: z.array(SessionSchema),
});

// Helper function to extract text content from UIMessage parts
function extractContent(message: UIMessage): string {
  if (!message.parts || message.parts.length === 0) {
    return "";
  }

  // Extract all text parts and join them
  const textParts = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text?: string }).text || "")
    .filter(Boolean);

  return textParts.join("\n");
}

// Transform UIMessage array to simple role/content format
function transformMessages(messages: UIMessage[]) {
  return messages.map((msg) => ({
    role: msg.role,
    content: extractContent(msg),
  }));
}

function getSamplesPath() {
  return path.join(process.cwd(), "data", "samples.json");
}

async function ensureFile(): Promise<void> {
  const filePath = getSamplesPath();
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
  try {
    await fs.access(filePath);
  } catch {
    const initial: z.infer<typeof SamplesSchema> = { samples: [] };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readSamples() {
  await ensureFile();
  const data = await fs.readFile(getSamplesPath(), "utf-8");
  const parsed = JSON.parse(data);
  const result = SamplesSchema.safeParse(parsed);

  if (result.success) {
    return result.data;
  }

  // Reset on invalid file
  return { samples: [] };
}

async function writeSamples(samples: z.infer<typeof SamplesSchema>) {
  await ensureFile();
  await fs.writeFile(
    getSamplesPath(),
    JSON.stringify(samples, null, 2),
    "utf-8"
  );
}

export async function GET() {
  try {
    const samples = await readSamples();
    return new Response(JSON.stringify(samples), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to load samples" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();

    if (!json.messages || !Array.isArray(json.messages)) {
      throw new Error("Invalid request: messages array required");
    }

    const samples = await readSamples();

    // Transform UIMessages to simple role/content format
    const transformedMessages = transformMessages(json.messages as UIMessage[]);

    const session: z.infer<typeof SessionSchema> = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      messages: transformedMessages,
      feedback: json.feedback
        ? {
            rating: json.feedback.rating,
            comment: json.feedback.comment,
          }
        : undefined,
    };
    samples.samples.push(session);

    await writeSamples(samples);
    return new Response(JSON.stringify(samples), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
