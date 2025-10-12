import {
  evaluateAccuracy,
  evaluateEfficiency,
  type AccuracyMetricResult,
  type EfficiencyMetricResult,
  type Trajectory,
} from "@/lib/metrics";
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

const AccuracyRequestSchema = z.object({
  metric: z.literal("accuracy"),
  goldTrajectory: TrajectorySchema,
  predictedTrajectory: TrajectorySchema,
});

const EfficiencyRequestSchema = z.object({
  metric: z.literal("efficiency"),
  goldTrajectory: TrajectorySchema,
  predictedTrajectory: TrajectorySchema,
});

const BatchRequestSchema = z.object({
  metric: z.literal("batch"),
  evaluations: z.array(
    z.union([
      AccuracyRequestSchema.omit({ metric: true }).extend({
        type: z.literal("accuracy"),
        id: z.string().optional(),
      }),
      EfficiencyRequestSchema.omit({ metric: true }).extend({
        type: z.literal("efficiency"),
        id: z.string().optional(),
      }),
    ])
  ),
});

const MetricRequestSchema = z.union([
  AccuracyRequestSchema,
  EfficiencyRequestSchema,
  BatchRequestSchema,
]);

type MetricRequest = z.infer<typeof MetricRequestSchema>;

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

    // Handle single metric evaluation
    if (request.metric === "accuracy") {
      const result: AccuracyMetricResult = await evaluateAccuracy(
        request.goldTrajectory as Trajectory,
        request.predictedTrajectory as Trajectory
      );

      return new Response(
        JSON.stringify({
          metric: "accuracy",
          result,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (request.metric === "efficiency") {
      const result: EfficiencyMetricResult = await evaluateEfficiency(
        request.goldTrajectory as Trajectory,
        request.predictedTrajectory as Trajectory
      );

      return new Response(
        JSON.stringify({
          metric: "efficiency",
          result,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Handle batch evaluations
    if (request.metric === "batch") {
      const results = await Promise.all(
        request.evaluations.map(async (evaluation) => {
          try {
            if (evaluation.type === "accuracy") {
              const result = await evaluateAccuracy(
                evaluation.goldTrajectory as Trajectory,
                evaluation.predictedTrajectory as Trajectory
              );
              return {
                id: evaluation.id,
                type: "accuracy" as const,
                result,
                error: null,
              };
            } else {
              const result = await evaluateEfficiency(
                evaluation.goldTrajectory as Trajectory,
                evaluation.predictedTrajectory as Trajectory
              );
              return {
                id: evaluation.id,
                type: "efficiency" as const,
                result,
                error: null,
              };
            }
          } catch (error) {
            return {
              id: evaluation.id,
              type: evaluation.type,
              result: null,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        })
      );

      return new Response(
        JSON.stringify({
          metric: "batch",
          results,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Invalid metric type",
      }),
      {
        status: 400,
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
