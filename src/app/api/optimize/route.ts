/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDataDirectory, loadUserConfig } from "@/lib/config-loader";
import { generateObject, generateText } from "ai";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import * as path from "path";
import type { Trajectory } from "../../../lib/metrics";
import { judgeAndScoreSample } from "../../../lib/metrics";
import type {
  MetricScores,
  MetricType,
  PromptCandidate,
  Sample,
} from "../../../lib/optimizer-types";
import type { OptimizationRun, RunPrompt } from "../runs/route";

export const maxDuration = 300; // 5 minutes for optimization

interface OptimizeRequest {
  optimizationModel: string;
  reflectionModel: string;
  batchSize: number;
  numRollouts: number;
  selectedMetrics: MetricType[];
  useStructuredOutput?: boolean;
  sampleGroupId?: string;
}

// Helper to load samples from .dspyground/data/samples.json
async function loadSamples(groupId?: string): Promise<Sample[]> {
  const dataDir = getDataDirectory();
  const samplesPath = path.join(dataDir, "samples.json");
  try {
    const data = await fs.readFile(samplesPath, "utf-8");
    const parsed = JSON.parse(data);

    // Handle new groups structure
    if (parsed.groups && Array.isArray(parsed.groups)) {
      const targetGroupId = groupId || parsed.currentGroupId || "default";
      const group = parsed.groups.find((g: any) => g.id === targetGroupId);
      return group ? group.samples : [];
    }

    // Handle old structure
    return parsed.samples || [];
  } catch {
    return [];
  }
}

// Helper to load prompt from config
async function loadPrompt(): Promise<string> {
  const config = await loadUserConfig();
  return config.systemPrompt || "You are a helpful assistant.";
}

// Helper to load schema from config (Zod schema)
async function loadSchema(): Promise<any> {
  const config = await loadUserConfig();
  return config.schema || null;
}

// Generate a trajectory for a sample using the current prompt
async function generateTrajectoryForSample(
  sample: Sample,
  prompt: string,
  model: string,
  useStructuredOutput: boolean,
  schema?: any,
  sendProgress?: (data: any) => Promise<void>,
  iteration?: number
): Promise<Trajectory> {
  const userMessage = sample.messages.find((m) => m.role === "user");
  const userInput =
    typeof userMessage?.content === "string"
      ? userMessage.content
      : userMessage?.content?.[0]?.text || "";

  let predictedMessages: Trajectory["messages"] = [];

  try {
    if (useStructuredOutput && schema) {
      // Start progress notification
      if (sendProgress && iteration !== undefined) {
        await sendProgress({
          type: "sample_output",
          iteration,
          sampleId: sample.id,
          content: `Generating structured output for sample ${sample.id}...`,
          accepted: false,
          collectionSize: 0,
          bestScore: 0,
        });
      }

      // Use generateObject for structured output (non-streaming for optimizer)
      // Convert message content to string format
      const messages: any[] = sample.messages.map((msg) => {
        let content = msg.content;
        if (typeof content !== "string") {
          // Convert complex content to string
          content = Array.isArray(content)
            ? content.map((c) => c.text || JSON.stringify(c)).join(" ")
            : JSON.stringify(content);
        }
        return { role: msg.role, content };
      });

      const { object: result } = await generateObject({
        model,
        system: prompt,
        messages: messages as any,
        schema: schema,
      });

      const outputStr = JSON.stringify(result, null, 2);

      // Send final result
      if (sendProgress && iteration !== undefined) {
        await sendProgress({
          type: "sample_output",
          iteration,
          sampleId: sample.id,
          content: outputStr,
          accepted: false,
          collectionSize: 0,
          bestScore: 0,
        });
      }

      // Include all sample messages + the generated JSON response
      predictedMessages = [
        ...sample.messages,
        { role: "assistant", content: outputStr },
      ];
    } else {
      // Start progress notification
      if (sendProgress && iteration !== undefined) {
        await sendProgress({
          type: "sample_output",
          iteration,
          sampleId: sample.id,
          content: `Generating response for sample ${sample.id}...`,
          accepted: false,
          collectionSize: 0,
          bestScore: 0,
        });
      }

      const config = await loadUserConfig();
      const result = await generateText({
        model,
        system: prompt,
        prompt: userInput,
        tools: config.tools || {},
      });

      // Send final text result
      if (sendProgress && iteration !== undefined) {
        await sendProgress({
          type: "sample_output",
          iteration,
          sampleId: sample.id,
          content: result.text,
          accepted: false,
          collectionSize: 0,
          bestScore: 0,
        });
      }

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
  schema?: any,
  sendProgress?: (data: any) => Promise<void>,
  iteration?: number
): Promise<{
  metrics: MetricScores;
  overallScore: number;
  detailedFeedback: string;
  suggestedImprovements: string;
}> {
  console.log(`[Judge] Evaluating sample ${sample.id}...`);

  // Generate trajectory using current prompt with streaming
  const generatedTrajectory = await generateTrajectoryForSample(
    sample,
    currentPrompt,
    model,
    useStructuredOutput,
    schema,
    sendProgress,
    iteration
  );

  // Use the imported judgeAndScoreSample function from metrics.ts
  const result = await judgeAndScoreSample(
    sample,
    generatedTrajectory,
    reflectionModel,
    selectedMetrics
  );

  // Stream the evaluation result
  if (sendProgress && iteration !== undefined) {
    await sendProgress({
      type: "evaluation_output",
      iteration,
      content: `Sample ${sample.id}: Score ${result.overallScore.toFixed(2)}\n${
        result.detailedFeedback
      }`,
      accepted: false,
      collectionSize: 0,
      bestScore: 0,
    });
  }

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
  schema?: any,
  sendProgress?: (data: any) => Promise<void>,
  iteration?: number
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

  // Evaluate samples sequentially to stream properly (not in parallel)
  const results = [];
  for (const s of samples) {
    const result = await evaluateSampleWithPrompt(
      s,
      prompt,
      model,
      reflectionModel,
      selectedMetrics,
      useStructuredOutput,
      schema,
      sendProgress,
      iteration
    );
    results.push(result);
  }

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

// Save run data to runs.json
async function saveRun(run: OptimizationRun): Promise<void> {
  try {
    const dataDir = getDataDirectory();
    const runsPath = path.join(dataDir, "runs.json");
    let data: { runs: OptimizationRun[] } = { runs: [] };

    try {
      const fileContent = await fs.readFile(runsPath, "utf-8");
      data = JSON.parse(fileContent);
    } catch {
      // File doesn't exist yet, use default
    }

    // Find and update existing run or add new one
    const existingIndex = data.runs.findIndex((r) => r.id === run.id);
    if (existingIndex >= 0) {
      data.runs[existingIndex] = run;
    } else {
      data.runs.push(run);
    }

    await fs.writeFile(runsPath, JSON.stringify(data, null, 2));
    console.log(`[Save Run] Saved run ${run.id}`);
  } catch (error) {
    console.error("[Save Run] Error saving run:", error);
  }
}

// Main GEPA optimization loop
async function runGEPA(
  config: OptimizeRequest,
  sendProgress: (data: any) => Promise<void>
) {
  console.log("[GEPA] Starting optimization...");

  // Create run ID and tracking
  const runId = nanoid();
  const runPrompts: RunPrompt[] = [];
  const samplesUsed: string[] = [];

  // Load data
  const allSamples = await loadSamples(config.sampleGroupId);
  const seedPrompt = await loadPrompt();
  const schema = config.useStructuredOutput ? await loadSchema() : null;

  console.log(
    `[GEPA] Loaded ${allSamples.length} samples from group ${
      config.sampleGroupId || "default"
    }`
  );

  // Validate schema is defined when structured output is enabled
  if (config.useStructuredOutput && !schema) {
    await sendProgress({
      type: "error",
      iteration: 0,
      accepted: false,
      collectionSize: 0,
      bestScore: 0,
      error:
        "Structured output is enabled but no schema is defined. Please define a Zod schema in dspyground.config.ts",
    });
    return;
  }

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

  // Initialize run data
  const run: OptimizationRun = {
    id: runId,
    timestamp: new Date().toISOString(),
    config: {
      optimizationModel: config.optimizationModel,
      reflectionModel: config.reflectionModel,
      batchSize: config.batchSize,
      numRollouts: config.numRollouts,
      selectedMetrics: config.selectedMetrics,
      useStructuredOutput: config.useStructuredOutput || false,
      sampleGroupId: config.sampleGroupId,
    },
    prompts: [],
    finalPrompt: seedPrompt,
    bestScore: 0,
    samplesUsed: [],
    collectionSize: 1,
    status: "running",
  };

  // Save run immediately so it shows up in the Runs page
  await saveRun(run);
  console.log(`[GEPA] Run ${runId} saved to runs.json`);

  await sendProgress({
    type: "start",
    iteration: 0,
    message: `Starting GEPA optimization with ${allSamples.length} samples, ${config.numRollouts} iterations (Run ID: ${runId})`,
    collectionSize: 1,
    bestScore: 0,
    accepted: false,
  });

  // Initialize collection with seed prompt
  console.log("[GEPA] Evaluating seed prompt...");
  const initialBatch = [];
  for (let i = 0; i < config.batchSize; i++) {
    const randomIndex = Math.floor(Math.random() * allSamples.length);
    const sample = allSamples[randomIndex];
    initialBatch.push(sample);
    if (!samplesUsed.includes(sample.id)) {
      samplesUsed.push(sample.id);
    }
  }

  const initialEval = await evaluateBatch(
    initialBatch,
    seedPrompt,
    config.optimizationModel,
    config.reflectionModel,
    config.selectedMetrics,
    config.useStructuredOutput || false,
    schema,
    sendProgress,
    0
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

  // Save seed prompt to run
  runPrompts.push({
    iteration: 0,
    prompt: seedPrompt,
    accepted: true,
    score: initialEval.overallScore,
    metrics: initialEval.metrics,
  });

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
      const sample = allSamples[randomIndex];
      batch.push(sample);
      if (!samplesUsed.includes(sample.id)) {
        samplesUsed.push(sample.id);
      }
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
      schema,
      sendProgress,
      iteration
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
      schema,
      sendProgress,
      iteration
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

      // Save accepted prompt to run
      runPrompts.push({
        iteration,
        prompt: improvedPrompt,
        accepted: true,
        score: improvedEval.overallScore,
        metrics: improvedEval.metrics,
      });

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
      // Save rejected prompt to run
      runPrompts.push({
        iteration,
        prompt: improvedPrompt,
        accepted: false,
        score: improvedEval.overallScore,
        metrics: improvedEval.metrics,
      });

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

    // Update and save run data periodically
    run.prompts = runPrompts;
    run.bestScore = bestScore;
    run.samplesUsed = samplesUsed;
    run.collectionSize = collection.length;
    run.finalPrompt = selectPrompt(collection).prompt;
    await saveRun(run);
  }

  // Final result
  const bestCandidate = selectPrompt(collection);

  console.log("\n[GEPA] === Optimization Complete ===");
  console.log(`[GEPA] Best score: ${bestScore.toFixed(2)}`);
  console.log(`[GEPA] Collection size: ${collection.length}`);
  console.log(
    `[GEPA] Best prompt: "${bestCandidate.prompt.substring(0, 100)}..."`
  );

  // Save final run data
  run.status = "completed";
  run.finalPrompt = bestCandidate.prompt;
  run.bestScore = bestScore;
  run.prompts = runPrompts;
  run.samplesUsed = samplesUsed;
  run.collectionSize = collection.length;
  await saveRun(run);

  await sendProgress({
    type: "complete",
    iteration: config.numRollouts,
    finalPrompt: bestCandidate.prompt,
    bestScore,
    collectionSize: collection.length,
    collection,
    accepted: true,
    message: `Optimization complete! Final score: ${bestScore.toFixed(
      2
    )} (Run ID: ${runId})`,
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

        // Try to save error status to run
        try {
          const dataDir = getDataDirectory();
          const runsPath = path.join(dataDir, "runs.json");
          const data = await fs.readFile(runsPath, "utf-8");
          const runsData = JSON.parse(data);
          const lastRun = runsData.runs[runsData.runs.length - 1];
          if (lastRun && lastRun.status === "running") {
            lastRun.status = "error";
            await fs.writeFile(runsPath, JSON.stringify(runsData, null, 2));
          }
        } catch {
          // Ignore errors in error handling
        }

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
