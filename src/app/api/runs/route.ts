import { getDataDirectory } from "@/lib/config-loader";
import { promises as fs } from "fs";
import * as path from "path";

function getRunsFile() {
  return path.join(getDataDirectory(), "runs.json");
}

export interface RunPrompt {
  iteration: number;
  prompt: string;
  accepted: boolean;
  score: number;
  metrics: Record<string, number | undefined>;
}

export interface OptimizationRun {
  id: string;
  timestamp: string;
  config: {
    optimizationModel: string;
    reflectionModel: string;
    batchSize: number;
    numRollouts: number;
    selectedMetrics: string[];
    useStructuredOutput: boolean;
    sampleGroupId?: string;
  };
  prompts: RunPrompt[];
  finalPrompt: string;
  bestScore: number;
  samplesUsed: string[];
  collectionSize: number;
  status: "running" | "completed" | "error";
}

async function loadRuns(): Promise<{ runs: OptimizationRun[] }> {
  try {
    const runsFile = getRunsFile();
    const data = await fs.readFile(runsFile, "utf-8");
    const parsed = JSON.parse(data);
    // Handle case where file contains just an array instead of { runs: [] }
    if (Array.isArray(parsed)) {
      return { runs: parsed };
    }
    // Ensure runs property exists
    return { runs: parsed.runs || [] };
  } catch {
    return { runs: [] };
  }
}

async function saveRuns(data: { runs: OptimizationRun[] }): Promise<void> {
  const runsFile = getRunsFile();
  await fs.writeFile(runsFile, JSON.stringify(data, null, 2));
}

// GET /api/runs - List all runs
export async function GET() {
  try {
    const data = await loadRuns();
    // Ensure runs is an array before sorting
    const runs = data.runs || [];
    // Sort by timestamp descending (newest first)
    const sortedRuns = runs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return Response.json({ runs: sortedRuns });
  } catch (error) {
    console.error("Error loading runs:", error);
    return Response.json({ error: "Failed to load runs" }, { status: 500 });
  }
}

// POST /api/runs - Create or update a run
export async function POST(request: Request) {
  try {
    const run: OptimizationRun = await request.json();
    const data = await loadRuns();

    // Find and update existing run or add new one
    const existingIndex = data.runs.findIndex((r) => r.id === run.id);
    if (existingIndex >= 0) {
      data.runs[existingIndex] = run;
    } else {
      data.runs.push(run);
    }

    await saveRuns(data);
    return Response.json({ success: true, run });
  } catch (error) {
    console.error("Error saving run:", error);
    return Response.json({ error: "Failed to save run" }, { status: 500 });
  }
}

// DELETE /api/runs?id=<runId> - Delete a run
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("id");

    if (!runId) {
      return Response.json({ error: "Run ID required" }, { status: 400 });
    }

    const data = await loadRuns();
    data.runs = data.runs.filter((r) => r.id !== runId);
    await saveRuns(data);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting run:", error);
    return Response.json({ error: "Failed to delete run" }, { status: 500 });
  }
}
