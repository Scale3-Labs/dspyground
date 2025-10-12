import { judgeAndScoreSample, type Trajectory } from "@/lib/metrics";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

// Request schemas
const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.enum(["text", "tool-call", "tool-result"]),
        text: z.string().optional(),
        toolCallId: z.string().optional(),
        toolName: z.string().optional(),
        args: z.any().optional(),
        result: z.any().optional(),
        isError: z.boolean().optional(),
      })
    ),
  ]),
});

const TrajectorySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  messages: z.array(MessageSchema),
  feedback: z
    .object({
      rating: z.enum(["positive", "negative"]),
      comment: z.string().optional(),
    })
    .optional(),
});

const EvaluateRequestSchema = z.object({
  sampleTrajectory: TrajectorySchema,
  generatedTrajectory: TrajectorySchema,
  reflectionModel: z.string().default("openai/gpt-4o"),
  selectedMetrics: z
    .array(z.string())
    .default(["tone", "accuracy", "efficiency", "tool_accuracy", "guardrails"]),
});

const BatchRequestSchema = z.object({
  evaluations: z.array(
    EvaluateRequestSchema.extend({
      id: z.string().optional(),
    })
  ),
});

const MetricRequestSchema = z.union([
  EvaluateRequestSchema,
  BatchRequestSchema,
]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = MetricRequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request format",
          details: parsed.error.format(),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const request = parsed.data;

    // Handle batch evaluations
    if ("evaluations" in request) {
      const results = await Promise.all(
        request.evaluations.map(async (evaluation) => {
          try {
            const result = await judgeAndScoreSample(
              evaluation.sampleTrajectory as Trajectory,
              evaluation.generatedTrajectory as Trajectory,
              evaluation.reflectionModel,
              evaluation.selectedMetrics
            );
            return {
              id: evaluation.id,
              result,
              error: null,
            };
          } catch (error) {
            return {
              id: evaluation.id,
              result: null,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        })
      );

      return new Response(
        JSON.stringify({
          results,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Handle single evaluation
    const result = await judgeAndScoreSample(
      request.sampleTrajectory as Trajectory,
      request.generatedTrajectory as Trajectory,
      request.reflectionModel,
      request.selectedMetrics
    );

    return new Response(
      JSON.stringify({
        result,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in metrics API:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
