import { getDataDirectory } from "@/lib/config-loader";
import type { UIMessage } from "ai";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

export const runtime = "nodejs";

// Part schemas matching AI SDK structure
const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
});

const ToolResultPartSchema = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown(),
  isError: z.boolean().optional(),
});

// Message format matching AI SDK structure
const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.union([
    z.string(),
    z.array(
      z.union([TextPartSchema, ToolCallPartSchema, ToolResultPartSchema])
    ),
  ]),
});

// Feedback schema
const FeedbackSchema = z.object({
  rating: z.enum(["positive", "negative"]),
  comment: z.string().optional(),
});

// Schema for samples with messages (including tool calls)
const SessionSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  messages: z.array(MessageSchema),
  feedback: FeedbackSchema.optional(),
});

const SamplesSchema = z.object({
  samples: z.array(SessionSchema),
});

// Transform UIMessage to AI SDK native message format
// This splits messages with mixed parts into separate messages
function transformMessages(messages: UIMessage[]) {
  const result: z.infer<typeof MessageSchema>[] = [];

  for (const msg of messages) {
    if (!msg.parts || msg.parts.length === 0) {
      continue;
    }

    // Separate parts by type
    const textParts: Array<{ type: string; text: string }> = [];
    const toolUIParts: Array<{ type: string; [key: string]: unknown }> = [];

    for (const part of msg.parts) {
      if (part.type === "text") {
        textParts.push(part);
      } else if (part.type.startsWith("tool-")) {
        toolUIParts.push(part);
      }
    }

    // Process tool calls first (from ToolUIPart)
    for (const toolPart of toolUIParts) {
      // 1. Create assistant message with tool-call
      result.push({
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: (toolPart.toolCallId as string) || "",
            toolName: toolPart.type.replace("tool-", ""),
            args: (toolPart.input as Record<string, unknown>) || {},
          },
        ],
      });

      // 2. Create tool message with tool-result (if output is available)
      if (
        toolPart.state === "output-available" &&
        (toolPart.output !== undefined || toolPart.errorText)
      ) {
        result.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: (toolPart.toolCallId as string) || "",
              toolName: toolPart.type.replace("tool-", ""),
              result: toolPart.errorText || toolPart.output,
              isError: !!toolPart.errorText,
            },
          ],
        });
      }
    }

    // Then add text parts as a separate assistant message
    if (textParts.length > 0) {
      const textContent = textParts
        .map((p) => (p as { text?: string }).text || "")
        .filter(Boolean)
        .join("\n");

      if (textContent) {
        result.push({
          role: msg.role,
          content: textContent,
        });
      }
    }
  }

  return result;
}

function getSamplesPath() {
  return path.join(getDataDirectory(), "samples.json");
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

  // Handle new groups structure
  if (parsed.groups && Array.isArray(parsed.groups)) {
    // Return all samples from all groups for backward compatibility
    const allSamples = parsed.groups.flatMap((g: any) => g.samples || []);
    return { samples: allSamples };
  }

  // Handle old structure
  const result = SamplesSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  // Reset on invalid file
  return { samples: [] };
}

async function writeSamples(samples: z.infer<typeof SamplesSchema>) {
  await ensureFile();
  const data = await fs.readFile(getSamplesPath(), "utf-8");
  const parsed = JSON.parse(data);

  // If groups structure exists, write samples to all groups (backward compat)
  if (parsed.groups && Array.isArray(parsed.groups)) {
    // This is deprecated - samples should be added via POST which uses current group
    parsed.groups[0].samples = samples.samples;
    await fs.writeFile(
      getSamplesPath(),
      JSON.stringify(parsed, null, 2),
      "utf-8"
    );
  } else {
    // Old structure
    await fs.writeFile(
      getSamplesPath(),
      JSON.stringify(samples, null, 2),
      "utf-8"
    );
  }
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

    await ensureFile();
    const data = await fs.readFile(getSamplesPath(), "utf-8");
    const parsed = JSON.parse(data);

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

    // Handle new groups structure
    if (parsed.groups && Array.isArray(parsed.groups)) {
      const currentGroupId = parsed.currentGroupId || "default";
      const currentGroup = parsed.groups.find(
        (g: any) => g.id === currentGroupId
      );

      if (currentGroup) {
        currentGroup.samples.push(session);
      } else {
        // Fallback to first group
        if (parsed.groups.length > 0) {
          parsed.groups[0].samples.push(session);
        }
      }

      await fs.writeFile(
        getSamplesPath(),
        JSON.stringify(parsed, null, 2),
        "utf-8"
      );

      return new Response(
        JSON.stringify({ samples: currentGroup?.samples || [] }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      // Handle old structure
      const samples = await readSamples();
      samples.samples.push(session);
      await writeSamples(samples);

      return new Response(JSON.stringify(samples), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
