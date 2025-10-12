/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateObject, generateText, jsonSchema } from "ai";
import { promises as fs } from "fs";
import * as path from "path";
import * as availableTools from "../../../../data/tools";
import type { Trajectory } from "../../../lib/metrics";
import { judgeAndScoreSample } from "../../../lib/metrics";
import type {
  MetricScores,
  MetricType,
  PromptCandidate,
  Sample,
} from "../../../lib/optimizer-types";

export const maxDuration = 300; // 5 minutes for optimization

interface OptimizeRequest {
  optimizationModel: string;
  reflectionModel: string;
  batchSize: number;
  numRollouts: number;
  selectedMetrics: MetricType[];
  useStructuredOutput?: boolean;
}

// Helper to load samples from data/samples.json
async function loadSamples(): Promise<Sample[]> {
  const samplesPath = path.join(process.cwd(), "data", "samples.json");
  try {
    const data = await fs.readFile(samplesPath, "utf-8");
    const parsed = JSON.parse(data);
    return parsed.samples || [];
  } catch {
    return [];
  }
}

// Helper to load prompt from data/prompt.md
async function loadPrompt(): Promise<string> {
  const promptPath = path.join(process.cwd(), "data", "prompt.md");
  try {
    const data = await fs.readFile(promptPath, "utf-8");
    return data.trim();
  } catch {
    return "You are a helpful assistant.";
  }
}

// Helper to load schema from data/schema.json
async function loadSchema(): Promise<any> {
  const schemaPath = path.join(process.cwd(), "data", "schema.json");
  try {
    const data = await fs.readFile(schemaPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Generate a trajectory for a sample using the current prompt
async function generateTrajectoryForSample(
  sample: Sample,
  prompt: string,
  model: string,
  useStructuredOutput: boolean,
  schema?: any
): Promise<Trajectory> {
  const userMessage = sample.messages.find((m) => m.role === "user");
  const userInput =
    typeof userMessage?.content === "string"
      ? userMessage.content
      : userMessage?.content?.[0]?.text || "";

  let predictedMessages: Trajectory["messages"] = [];

  try {
    if (useStructuredOutput && schema) {
      const result = await generateObject({
        model,
        system: prompt,
        prompt: userInput,
        schema: jsonSchema(schema),
      });

      predictedMessages = [
        { role: "user", content: userInput },
        { role: "assistant", content: JSON.stringify(result.object, null, 2) },
      ];
    } else {
      const result = await generateText({
        model,
        system: prompt,
        prompt: userInput,
        tools: availableTools,
      });

      predictedMessages = [{ role: "user", content: userInput }];

      for (const step of result.steps) {
        if (step.toolCalls && step.toolCalls.length > 0) {
          predictedMessages.push({
            role: "assistant",
            content: step.toolCalls.map((tc: any) => ({
              type: "tool-call" as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args,
            })),
          });

          if (step.toolResults && step.toolResults.length > 0) {
            for (const tr of step.toolResults) {
              predictedMessages.push({
                role: "tool",
                content: [
                  {
                    type: "tool-result" as const,
                    toolCallId: tr.toolCallId,
                    toolName: tr.toolName,
                    result: (tr as any).result,
                    isError: false,
                  },
                ],
              });
            }
          }
        }

        if (step.text) {
          predictedMessages.push({
            role: "assistant",
            content: step.text,
          });
        }
      }

      if (predictedMessages.length === 1) {
        predictedMessages.push({
          role: "assistant",
          content: result.text,
        });
      }
    }
  } catch (error) {
    console.error("[Generate] Error generating trajectory:", error);
    predictedMessages = [
      { role: "user", content: userInput },
      { role: "assistant", content: "[Error generating response]" },
    ];
  }

  return {
    id: `predicted-${sample.id}`,
    timestamp: new Date().toISOString(),
    messages: predictedMessages,
  };
}

// Wrapper to evaluate a sample with the current prompt
async function evaluateSampleWithPrompt(
  sample: Sample,
  currentPrompt: string,
  model: string,
  reflectionModel: string,
  selectedMetrics: string[],
  useStructuredOutput: boolean,
  schema?: any
): Promise<{
  metrics: MetricScores;
  overallScore: number;
  detailedFeedback: string;
  suggestedImprovements: string;
}> {
  console.log(`[Judge] Evaluating sample ${sample.id}...`);

  // Generate trajectory using current prompt
  const generatedTrajectory = await generateTrajectoryForSample(
    sample,
    currentPrompt,
    model,
    useStructuredOutput,
    schema
  );

  // Use the imported judgeAndScoreSample function from metrics.ts
  const result = await judgeAndScoreSample(
    sample,
    generatedTrajectory,
    reflectionModel,
    selectedMetrics
  );

  console.log(
    `[Judge] Sample ${sample.id} - Overall: ${result.overallScore.toFixed(2)}`
  );

  return result;
}

// Evaluate a batch of samples
async function evaluateBatch(
  samples: Sample[],
  prompt: string,
  model: string,
  reflectionModel: string,
  selectedMetrics: string[],
  useStructuredOutput: boolean,
  schema?: any
): Promise<{
  metrics: MetricScores;
  overallScore: number;
  suggestions: string[];
  feedbacks: string[];
}> {
  console.log(`[Batch] Evaluating ${samples.length} samples...`);

  if (samples.length === 0) {
    console.warn("[Batch] ⚠️ Empty batch - returning zero scores");
    return {
      metrics: {},
      overallScore: 0,
      suggestions: [],
      feedbacks: [],
    };
  }

  const results = await Promise.all(
    samples.map((s) =>
      evaluateSampleWithPrompt(
        s,
        prompt,
        model,
        reflectionModel,
        selectedMetrics,
        useStructuredOutput,
        schema
      )
    )
  );

  // Aggregate metrics
  const aggregatedMetrics: MetricScores = {};
  for (const metric of selectedMetrics) {
    const values = results
      .map((r) => r.metrics[metric])
      .filter((v) => v !== undefined) as number[];
    if (values.length > 0) {
      aggregatedMetrics[metric] =
        values.reduce((sum, v) => sum + v, 0) / values.length;
    }
  }

  const overallScore =
    results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;

  const suggestions = results.map((r) => r.suggestedImprovements);
  const feedbacks = results.map((r) => r.detailedFeedback);

  console.log(`[Batch] Overall score: ${overallScore.toFixed(2)}`);

  return {
    metrics: aggregatedMetrics,
    overallScore,
    suggestions,
    feedbacks,
  };
}

// Improve prompt based on suggestions from batch evaluation
async function improvePrompt(
  currentPrompt: string,
  suggestions: string[],
  feedbacks: string[],
  reflectionModel: string
): Promise<string> {
  console.log(`[Reflection] Synthesizing ${suggestions.length} suggestions...`);

  const consolidatedSuggestions = suggestions.join("\n\n---\n\n");
  const consolidatedFeedbacks = feedbacks.join("\n\n---\n\n");

  const improvementPrompt = `You are an expert prompt engineer. Improve the following prompt based on evaluation feedback.

CURRENT PROMPT:
"""
${currentPrompt}
"""

EVALUATION FEEDBACKS FROM BATCH:
${consolidatedFeedbacks}

SUGGESTED IMPROVEMENTS FROM BATCH:
${consolidatedSuggestions}

Analyze all the feedback and suggestions above. Then write an IMPROVED version of the prompt that:
1. Addresses the most critical issues identified across all samples
2. Incorporates the suggested improvements where they make sense
3. Maintains clarity and specificity
4. Keeps what's working well

Return ONLY the improved prompt text, nothing else.`;

  try {
    const result = await generateText({
      model: reflectionModel,
      prompt: improvementPrompt,
    });

    const improvedPrompt = result.text.trim();
    console.log(
      `[Reflection] ✓ Improved prompt: "${improvedPrompt.substring(0, 100)}..."`
    );
    return improvedPrompt;
  } catch (error) {
    console.error("[Reflection] ❌ Error improving prompt:", error);
    return currentPrompt;
  }
}

// Check if candidate A dominates candidate B (Pareto optimality)
function dominates(
  a: MetricScores,
  b: MetricScores,
  selectedMetrics: string[]
): boolean {
  let strictlyBetterInOne = false;

  for (const metric of selectedMetrics) {
    const aValue = a[metric] ?? 0;
    const bValue = b[metric] ?? 0;

    if (aValue < bValue) {
      return false; // A is worse in this dimension
    }
    if (aValue > bValue) {
      strictlyBetterInOne = true;
    }
  }

  return strictlyBetterInOne;
}

// Update Pareto frontier with new candidate
function updateParetoFrontier(
  collection: PromptCandidate[],
  newCandidate: PromptCandidate,
  selectedMetrics: string[]
): PromptCandidate[] {
  const nonDominated: PromptCandidate[] = [];
  let newCandidateIsNonDominated = true;

  for (const existing of collection) {
    if (dominates(existing.metrics, newCandidate.metrics, selectedMetrics)) {
      newCandidateIsNonDominated = false;
    }

    if (!dominates(newCandidate.metrics, existing.metrics, selectedMetrics)) {
      nonDominated.push(existing);
    }
  }

  if (newCandidateIsNonDominated) {
    nonDominated.push(newCandidate);
  }

  return nonDominated;
}

// Select a prompt from the collection (currently just picks best overall)
function selectPrompt(collection: PromptCandidate[]): PromptCandidate {
  return collection.reduce((best, current) =>
    current.overallScore > best.overallScore ? current : best
  );
}

// Main GEPA optimization loop
async function runGEPA(
  config: OptimizeRequest,
  sendProgress: (data: any) => Promise<void>
) {
  console.log("[GEPA] Starting optimization...");

  // Load data
  const allSamples = await loadSamples();
  const seedPrompt = await loadPrompt();
  const schema = config.useStructuredOutput ? await loadSchema() : null;

  console.log(`[GEPA] Loaded ${allSamples.length} samples`);

  if (allSamples.length === 0) {
    await sendProgress({
      type: "error",
      iteration: 0,
      accepted: false,
      collectionSize: 0,
      bestScore: 0,
      error: "No samples found. Please add samples with feedback first.",
    });
    return;
  }

  await sendProgress({
    type: "start",
    iteration: 0,
    message: `Starting GEPA optimization with ${allSamples.length} samples, ${config.numRollouts} iterations`,
    collectionSize: 1,
    bestScore: 0,
    accepted: false,
  });

  // Initialize collection with seed prompt
  console.log("[GEPA] Evaluating seed prompt...");
  const initialBatch = [];
  for (let i = 0; i < config.batchSize; i++) {
    const randomIndex = Math.floor(Math.random() * allSamples.length);
    initialBatch.push(allSamples[randomIndex]);
  }

  const initialEval = await evaluateBatch(
    initialBatch,
    seedPrompt,
    config.optimizationModel,
    config.reflectionModel,
    config.selectedMetrics,
    config.useStructuredOutput || false,
    schema
  );

  const collection: PromptCandidate[] = [
    {
      id: "seed",
      prompt: seedPrompt,
      metrics: initialEval.metrics,
      overallScore: initialEval.overallScore,
      bestForExamples: [],
    },
  ];

  let bestScore = initialEval.overallScore;

  console.log(`[GEPA] Seed prompt score: ${bestScore.toFixed(2)}`);

  // Main GEPA loop
  for (let iteration = 1; iteration <= config.numRollouts; iteration++) {
    console.log(
      `\n[GEPA] === Iteration ${iteration}/${config.numRollouts} ===`
    );

    // Select prompt from collection
    const selectedCandidate = selectPrompt(collection);
    console.log(
      `[GEPA] Selected candidate: ${
        selectedCandidate.id
      } (score: ${selectedCandidate.overallScore.toFixed(2)})`
    );

    // Random batch sampling with replacement
    const batch: Sample[] = [];
    for (let i = 0; i < config.batchSize; i++) {
      const randomIndex = Math.floor(Math.random() * allSamples.length);
      batch.push(allSamples[randomIndex]);
    }

    console.log(
      `[GEPA] Sampled batch of ${batch.length} (IDs: ${batch
        .map((s) => s.id.substring(0, 8))
        .join(", ")})`
    );

    // Evaluate current prompt on batch
    const batchEval = await evaluateBatch(
      batch,
      selectedCandidate.prompt,
      config.optimizationModel,
      config.reflectionModel,
      config.selectedMetrics,
      config.useStructuredOutput || false,
      schema
    );

    console.log(
      `[GEPA] Current prompt batch score: ${batchEval.overallScore.toFixed(2)}`
    );

    // Improve prompt based on evaluation
    const improvedPrompt = await improvePrompt(
      selectedCandidate.prompt,
      batchEval.suggestions,
      batchEval.feedbacks,
      config.reflectionModel
    );

    // Test improved prompt on same batch
    const improvedEval = await evaluateBatch(
      batch,
      improvedPrompt,
      config.optimizationModel,
      config.reflectionModel,
      config.selectedMetrics,
      config.useStructuredOutput || false,
      schema
    );

    console.log(
      `[GEPA] Improved prompt batch score: ${improvedEval.overallScore.toFixed(
        2
      )}`
    );

    // Accept if better
    if (improvedEval.overallScore > batchEval.overallScore) {
      const newCandidate: PromptCandidate = {
        id: `candidate-${iteration}`,
        prompt: improvedPrompt,
        metrics: improvedEval.metrics,
        overallScore: improvedEval.overallScore,
        bestForExamples: [],
      };

      // Update Pareto frontier
      const updatedCollection = updateParetoFrontier(
        collection,
        newCandidate,
        config.selectedMetrics
      );
      collection.length = 0;
      collection.push(...updatedCollection);

      if (improvedEval.overallScore > bestScore) {
        bestScore = improvedEval.overallScore;
      }

      console.log(
        `[GEPA] ✓ Accepted! Collection size: ${
          collection.length
        }, Best score: ${bestScore.toFixed(2)}`
      );

      await sendProgress({
        type: "iteration",
        iteration,
        candidatePrompt: improvedPrompt,
        batchScore: improvedEval.overallScore,
        accepted: true,
        collectionSize: collection.length,
        bestScore,
        metrics: improvedEval.metrics,
        message: `Iteration ${iteration}: Improved! Score ${batchEval.overallScore.toFixed(
          2
        )} → ${improvedEval.overallScore.toFixed(2)}`,
      });
    } else {
      console.log(
        `[GEPA] ✗ Rejected (no improvement: ${batchEval.overallScore.toFixed(
          2
        )} vs ${improvedEval.overallScore.toFixed(2)})`
      );

      await sendProgress({
        type: "iteration",
        iteration,
        batchScore: batchEval.overallScore,
        accepted: false,
        collectionSize: collection.length,
        bestScore,
        message: `Iteration ${iteration}: No improvement`,
      });
    }
  }

  // Final result
  const bestCandidate = selectPrompt(collection);

  console.log("\n[GEPA] === Optimization Complete ===");
  console.log(`[GEPA] Best score: ${bestScore.toFixed(2)}`);
  console.log(`[GEPA] Collection size: ${collection.length}`);
  console.log(
    `[GEPA] Best prompt: "${bestCandidate.prompt.substring(0, 100)}..."`
  );

  await sendProgress({
    type: "complete",
    iteration: config.numRollouts,
    finalPrompt: bestCandidate.prompt,
    bestScore,
    collectionSize: collection.length,
    collection,
    accepted: true,
    message: `Optimization complete! Final score: ${bestScore.toFixed(2)}`,
  });
}

// API Route Handler
export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const config: OptimizeRequest = await request.json();

  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = async (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await runGEPA(config, sendProgress);
      } catch (error) {
        console.error("[GEPA] Fatal error:", error);
        await sendProgress({
          type: "error",
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
          iteration: 0,
          accepted: false,
          collectionSize: 0,
          bestScore: 0,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
