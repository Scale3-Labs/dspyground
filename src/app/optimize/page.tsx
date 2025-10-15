"use client";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { MetricPromptEditorDialog } from "@/components/ui/metric-prompt-editor-dialog";
import { OptimizeLiveChart } from "@/components/ui/optimize-live-chart";
import { PromptEditorDialog } from "@/components/ui/prompt-editor-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { IterationResult, MetricType } from "@/lib/optimizer-types";
import {
  AVAILABLE_METRICS,
  METRIC_DESCRIPTIONS,
  METRIC_LABELS,
} from "@/lib/optimizer-types";
import { Edit, Info, Loader2, Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type GatewayModel = {
  id: string;
  name: string;
  description: string | null;
  modelType: string;
};

type ChartPoint = {
  iteration: number;
  selected?: number;
  best?: number;
  avg?: number;
  prompt?: string;
};

type StreamLogEntry = {
  type: "iteration_start" | "sample" | "evaluation" | "iteration_end" | "final";
  iteration?: number;
  sampleId?: string;
  content?: string;
  prompt?: string;
  timestamp: number;
};

interface OptimizationState {
  isOptimizing: boolean;
  runId: string | null;
  streamLogs: StreamLogEntry[];
  chartData: ChartPoint[];
  iterations: IterationResult[];
  finalPrompt: string;
}

export default function OptimizePage() {
  // Settings state
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [optimizationModel, setOptimizationModel] = useState<string>("");
  const [reflectionModel, setReflectionModel] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(3);
  const [numRollouts, setNumRollouts] = useState<number>(10);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>([
    "tone",
    "accuracy",
  ]);
  const [optimizeStructuredOutput, setOptimizeStructuredOutput] =
    useState<boolean>(false);
  const [sampleGroups, setSampleGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  // Dialog state
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [metricPromptEditorOpen, setMetricPromptEditorOpen] = useState(false);

  // UI state
  const [textModels, setTextModels] = useState<GatewayModel[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [iterations, setIterations] = useState<IterationResult[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [finalPrompt, setFinalPrompt] = useState<string>("");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [streamLogs, setStreamLogs] = useState<StreamLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string>("settings");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Save optimization state to localStorage
  const saveOptimizationState = useCallback(() => {
    if (typeof window === "undefined") return;

    const state: OptimizationState = {
      isOptimizing,
      runId: currentRunId,
      streamLogs,
      chartData,
      iterations,
      finalPrompt,
    };

    localStorage.setItem("optimizationState", JSON.stringify(state));
  }, [
    isOptimizing,
    currentRunId,
    streamLogs,
    chartData,
    iterations,
    finalPrompt,
  ]);

  // Restore optimization state from localStorage
  const restoreOptimizationState = useCallback(async () => {
    if (typeof window === "undefined") return false;

    try {
      const saved = localStorage.getItem("optimizationState");
      if (!saved) return false;

      const state: OptimizationState = JSON.parse(saved);

      // Check if the run is actually still running by checking runs.json
      if (state.runId) {
        const response = await fetch("/api/runs");
        if (response.ok) {
          const data = await response.json();
          const run = data.runs.find((r: any) => r.id === state.runId);

          if (run && run.status === "running") {
            // Restore the state
            setIsOptimizing(false); // Set to false since we're not actively streaming
            setCurrentRunId(state.runId);
            setStreamLogs(state.streamLogs);
            setChartData(state.chartData);
            setIterations(state.iterations);
            setFinalPrompt(state.finalPrompt);
            setActiveTab("progress");

            toast.info("Previous optimization is still running.");
            return true;
          } else {
            // Run completed or errored, clear the state
            localStorage.removeItem("optimizationState");
          }
        }
      }
    } catch (error) {
      console.error("Failed to restore optimization state:", error);
    }

    return false;
  }, []);

  // Check for running optimizations on mount
  useEffect(() => {
    (async () => {
      await restoreOptimizationState();
    })();
  }, [restoreOptimizationState]);

  // Cleanup: abort fetch when navigating away
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log("[Optimize Page] Unmounting, aborting fetch");
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Poll for running optimization updates when not actively streaming
  useEffect(() => {
    if (isOptimizing || !currentRunId) return;

    console.log("[Optimize Page] Polling for run updates:", currentRunId);

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/runs", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          const run = data.runs.find((r: any) => r.id === currentRunId);

          if (run) {
            console.log(
              `[Optimize Page] Run ${currentRunId} status:`,
              run.status,
              "Best score:",
              run.bestScore
            );

            // Update chart data from run data
            if (run.prompts && run.prompts.length > 0) {
              const newChartData: ChartPoint[] = run.prompts.map((p: any) => ({
                iteration: p.iteration,
                selected: p.score,
                best: run.bestScore,
                prompt: p.prompt,
              }));
              setChartData(newChartData);

              // Update stream logs to show progress
              const newStreamLogs: StreamLogEntry[] = [
                {
                  type: "evaluation",
                  content:
                    "⚠️ Reconnected to running optimization. Showing summary view (detailed sample logs only available during live streaming).",
                  timestamp: Date.now(),
                },
              ];

              run.prompts.forEach((p: any) => {
                newStreamLogs.push({
                  type: "iteration_start",
                  iteration: p.iteration,
                  timestamp: Date.now(),
                });

                // Add summary for each iteration
                const statusEmoji = p.accepted ? "✅" : "❌";
                const status = p.accepted ? "Accepted" : "Rejected";
                newStreamLogs.push({
                  type: "evaluation",
                  iteration: p.iteration,
                  content: `${statusEmoji} ${status} | Score: ${p.score.toFixed(
                    2
                  )} | Metrics: ${Object.entries(p.metrics || {})
                    .map(
                      ([key, val]) =>
                        `${key}=${
                          typeof val === "number" ? val.toFixed(2) : val
                        }`
                    )
                    .join(", ")}`,
                  timestamp: Date.now(),
                });

                if (p.accepted) {
                  newStreamLogs.push({
                    type: "iteration_end",
                    iteration: p.iteration,
                    prompt: p.prompt,
                    timestamp: Date.now(),
                  });
                }
              });

              // Add current status message
              if (run.status === "running") {
                newStreamLogs.push({
                  type: "evaluation",
                  content: `\n📊 Current Progress: Iteration ${
                    run.prompts.length - 1
                  }/${
                    run.config.numRollouts
                  } | Best Score: ${run.bestScore.toFixed(
                    2
                  )} | Collection Size: ${
                    run.collectionSize
                  }\n\n⏳ Optimization running... (refreshing every 2s)`,
                  timestamp: Date.now(),
                });
              }

              setStreamLogs(newStreamLogs);
            }

            if (run.status === "completed") {
              setFinalPrompt(run.finalPrompt);

              // Add completion to stream logs
              setStreamLogs((prev) => [
                ...prev,
                {
                  type: "final",
                  prompt: run.finalPrompt,
                  timestamp: Date.now(),
                },
              ]);

              toast.success("Optimization completed!");
              clearInterval(pollInterval);
              localStorage.removeItem("optimizationState");
              setCurrentRunId(null);
            } else if (run.status === "error") {
              toast.error("Optimization encountered an error");
              clearInterval(pollInterval);
              localStorage.removeItem("optimizationState");
              setCurrentRunId(null);
            }
          }
        }
      } catch (error) {
        console.error("Failed to poll run status:", error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentRunId, isOptimizing]);

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (res.ok) {
          const prefs = await res.json();
          setOptimizationModel(prefs.optimizationModel || "openai/gpt-4o-mini");
          setReflectionModel(prefs.reflectionModel || "openai/gpt-4o");
          setBatchSize(prefs.batchSize || 3);
          setNumRollouts(prefs.numRollouts || 10);
          setSelectedMetrics(prefs.selectedMetrics || ["tone", "accuracy"]);
          setOptimizeStructuredOutput(prefs.optimizeStructuredOutput || false);
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
      } finally {
        setPreferencesLoaded(true);
      }
    })();
  }, []);

  // Load models
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const list =
            data.textModels ||
            (data.models || []).filter(
              (m: GatewayModel) => m.modelType === "language"
            );
          setTextModels(list);
        }
      } catch (error) {
        console.error("Failed to load models:", error);
      }
    })();
  }, []);

  // Load sample groups
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sample-groups", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setSampleGroups(data.groups || []);
          setSelectedGroupId(data.currentGroupId || "");
        }
      } catch (error) {
        console.error("Failed to load sample groups:", error);
      }
    })();
  }, []);

  // Load system prompt function
  const loadSystemPrompt = useCallback(async () => {
    try {
      const res = await fetch("/api/prompt", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSystemPrompt(data.prompt || "");
      }
    } catch (error) {
      console.error("Failed to load prompt:", error);
    }
  }, []);

  // Load system prompt on mount
  useEffect(() => {
    loadSystemPrompt();
  }, [loadSystemPrompt]);

  // Save preferences when settings change
  useEffect(() => {
    if (!preferencesLoaded) return;

    (async () => {
      try {
        await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optimizationModel,
            reflectionModel,
            batchSize,
            numRollouts,
            selectedMetrics,
            optimizeStructuredOutput,
          }),
        });
      } catch (error) {
        console.error("Error saving preferences:", error);
      }
    })();
  }, [
    optimizationModel,
    reflectionModel,
    batchSize,
    numRollouts,
    selectedMetrics,
    optimizeStructuredOutput,
    preferencesLoaded,
  ]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamLogs]);

  // Auto-save state when it changes
  useEffect(() => {
    if (isOptimizing || currentRunId) {
      saveOptimizationState();
    }
  }, [
    isOptimizing,
    currentRunId,
    streamLogs,
    chartData,
    iterations,
    finalPrompt,
    saveOptimizationState,
  ]);

  const handleMetricToggle = (metric: MetricType) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric]
    );
  };

  const handleStartOptimization = useCallback(async () => {
    if (!optimizationModel || !reflectionModel) {
      toast.error("Please select both optimization and reflection models");
      return;
    }

    if (selectedMetrics.length === 0) {
      toast.error("Please select at least one metric");
      return;
    }

    // Check if there's already a running optimization
    try {
      const response = await fetch("/api/runs");
      if (response.ok) {
        const data = await response.json();
        const runningRun = data.runs.find((r: any) => r.status === "running");

        if (runningRun) {
          toast.error(
            "An optimization is already running. Please wait for it to complete or stop it first."
          );
          return;
        }
      }
    } catch (error) {
      console.error("Failed to check for running optimizations:", error);
    }

    setIsOptimizing(true);
    setIterations([]);
    setChartData([]);
    setFinalPrompt("");
    setStreamLogs([]);
    setCurrentRunId(null);
    setActiveTab("progress"); // Switch to progress tab

    // Create abort controller for this run
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optimizationModel,
          reflectionModel,
          batchSize,
          numRollouts,
          selectedMetrics,
          useStructuredOutput: optimizeStructuredOutput,
          sampleGroupId: selectedGroupId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Optimization failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by double newline to separate SSE events
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        for (const event of events) {
          if (!event.trim()) continue;

          // Parse SSE format: each event may have multiple "data: " lines
          const dataLines = event
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.substring(6)); // Remove "data: " prefix

          if (dataLines.length === 0) continue;

          // Join multiple data lines (though we typically have just one)
          const jsonString = dataLines.join("\n");

          try {
            const result: IterationResult = JSON.parse(jsonString);

            setIterations((prev) => [...prev, result]);

            // Extract run ID from the start message
            if (result.type === "start" && result.message) {
              const runIdMatch = result.message.match(
                /Run ID: ([a-zA-Z0-9_-]+)/
              );
              if (runIdMatch && runIdMatch[1]) {
                setCurrentRunId(runIdMatch[1]);
              }
            }

            // Process stream logs
            if (result.type === "iteration") {
              setStreamLogs((prev) => [
                ...prev,
                {
                  type: "iteration_start",
                  iteration: result.iteration,
                  timestamp: Date.now(),
                },
              ]);
            }

            // Handle sample streaming logs (added by API updates)
            if (
              result.type === "sample_output" &&
              "sampleId" in result &&
              "content" in result
            ) {
              setStreamLogs((prev) => [
                ...prev,
                {
                  type: "sample",
                  iteration: result.iteration,
                  sampleId: (result as any).sampleId,
                  content: (result as any).content,
                  timestamp: Date.now(),
                },
              ]);
            }

            // Handle evaluation logs (added by API updates)
            if (result.type === "evaluation_output" && "content" in result) {
              setStreamLogs((prev) => [
                ...prev,
                {
                  type: "evaluation",
                  iteration: result.iteration,
                  content: (result as any).content,
                  timestamp: Date.now(),
                },
              ]);
            }

            // Update chart data
            if (result.type === "iteration" || result.type === "complete") {
              setChartData((prev) => [
                ...prev,
                {
                  iteration: result.iteration,
                  selected: result.batchScore,
                  best: result.bestScore,
                  prompt: result.candidatePrompt,
                },
              ]);

              if (result.candidatePrompt) {
                setStreamLogs((prev) => [
                  ...prev,
                  {
                    type: "iteration_end",
                    iteration: result.iteration,
                    prompt: result.candidatePrompt,
                    timestamp: Date.now(),
                  },
                ]);
              }
            }

            if (result.type === "complete" && result.finalPrompt) {
              setFinalPrompt(result.finalPrompt);
              setStreamLogs((prev) => [
                ...prev,
                {
                  type: "final",
                  prompt: result.finalPrompt,
                  timestamp: Date.now(),
                },
              ]);
              toast.success("Optimization complete!");
              // Clear localStorage state when completed
              localStorage.removeItem("optimizationState");
              setCurrentRunId(null);
            }

            if (result.type === "error") {
              toast.error(result.error || "Optimization error");
              // Clear localStorage state on error
              localStorage.removeItem("optimizationState");
              setCurrentRunId(null);
            }
          } catch (parseError) {
            console.error("Error parsing result:", parseError);
          }
        }
      }
    } catch (error) {
      console.error("Optimization error:", error);
      toast.error(
        error instanceof Error ? error.message : "Optimization failed"
      );
    } finally {
      setIsOptimizing(false);
    }
  }, [
    optimizationModel,
    reflectionModel,
    batchSize,
    numRollouts,
    selectedMetrics,
    optimizeStructuredOutput,
  ]);

  const handleStop = async () => {
    // Abort the fetch request if it's running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsOptimizing(false);
    toast.info("Optimization stopped");

    // Mark the run as error in the backend if we have a run ID
    if (currentRunId) {
      try {
        const response = await fetch("/api/runs");
        if (response.ok) {
          const data = await response.json();
          const run = data.runs.find((r: any) => r.id === currentRunId);

          if (run && run.status === "running") {
            // Update the run status to error (stopped)
            run.status = "error";
            await fetch("/api/runs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(run),
            });
          }
        }
      } catch (error) {
        console.error("Failed to update run status:", error);
      }
    }

    // Clear localStorage state
    localStorage.removeItem("optimizationState");
    setCurrentRunId(null);
  };

  return (
    <div className="font-sans w-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-medium">Prompt Optimizer</h1>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-0">
            {currentRunId && !isOptimizing && (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <Loader2 className="size-4" />
                    <p className="text-sm font-medium">
                      An optimization run is currently in progress. View it in
                      the Progress tab or clear it to start a new one.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      localStorage.removeItem("optimizationState");
                      setCurrentRunId(null);
                      setStreamLogs([]);
                      setChartData([]);
                      setIterations([]);
                      setFinalPrompt("");
                      toast.info("Previous run cleared");
                    }}
                  >
                    Clear Run
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-6">
              <div className="flex-1 space-y-6">
                <div className="border rounded-lg p-6 bg-card">
                  <h2 className="text-lg font-semibold mb-4">Configuration</h2>

                  {/* System Prompt (Read-only) */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">
                        System Prompt (from config)
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPromptEditorOpen(true)}
                        className="h-7 gap-1.5"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                    <Textarea
                      value={systemPrompt}
                      readOnly
                      className="min-h-[100px] font-mono text-xs bg-muted cursor-pointer"
                      placeholder="Loading prompt..."
                      onClick={() => setPromptEditorOpen(true)}
                    />
                  </div>

                  <Separator className="my-4" />

                  {/* Optimization Model */}
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">
                      Optimization Model (Task Model)
                    </label>
                    <Select
                      value={optimizationModel}
                      onValueChange={setOptimizationModel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {textModels.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Reflection Model */}
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">
                      Reflection Model (Improves Prompts)
                    </label>
                    <Select
                      value={reflectionModel}
                      onValueChange={setReflectionModel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {textModels.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="my-4" />

                  {/* Batch Size */}
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">
                      Batch Size (samples per iteration)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                    />
                  </div>

                  {/* Number of Rollouts */}
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">
                      Number of Rollouts (iterations)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={numRollouts}
                      onChange={(e) => setNumRollouts(Number(e.target.value))}
                    />
                  </div>

                  <Separator className="my-4" />

                  {/* Sample Group */}
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">Sample Group</label>
                    <Select
                      value={selectedGroupId}
                      onValueChange={setSelectedGroupId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select sample group" />
                      </SelectTrigger>
                      <SelectContent>
                        {sampleGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name} ({group.samples.length} samples)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="my-4" />

                  {/* Output Mode */}
                  <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium">Output Mode</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={optimizeStructuredOutput}
                        onChange={(e) =>
                          setOptimizeStructuredOutput(e.target.checked)
                        }
                        className="rounded"
                      />
                      <span className="text-sm">
                        Structured Output (uses schema.json)
                      </span>
                    </label>
                  </div>

                  <Separator className="my-4" />

                  {/* Metrics */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Metrics</label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMetricPromptEditorOpen(true)}
                        className="h-7 gap-1.5"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit Prompts
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {AVAILABLE_METRICS.map((metric) => (
                        <div key={metric} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            id={`metric-${metric}`}
                            checked={selectedMetrics.includes(metric)}
                            onChange={() => handleMetricToggle(metric)}
                            className="rounded mt-0.5 cursor-pointer"
                          />
                          <label
                            htmlFor={`metric-${metric}`}
                            className="flex items-center gap-1.5 cursor-pointer flex-1"
                          >
                            <span className="text-sm font-medium">
                              {METRIC_LABELS[metric]}
                            </span>
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80" side="right">
                                <div className="space-y-2">
                                  <h4 className="text-sm font-semibold">
                                    {METRIC_LABELS[metric]}
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    {METRIC_DESCRIPTIONS[metric]}
                                  </p>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side: Optimize Button */}
              <div className="w-64 space-y-4">
                <div className="border rounded-lg p-6 bg-card sticky top-6">
                  <h2 className="text-lg font-semibold mb-4">Actions</h2>
                  {isOptimizing ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={handleStop}
                    >
                      <Square className="size-4 mr-2" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={handleStartOptimization}
                    >
                      <Play className="size-4 mr-2" />
                      Start Optimization
                    </Button>
                  )}
                  {isOptimizing && (
                    <div className="flex items-center gap-2 mt-4 text-blue-600">
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm font-medium">Running...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Progress Tab */}
          <TabsContent value="progress" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Half: Streaming Logs */}
              <div className="border rounded-lg p-6 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Live Stream</h2>
                  {currentRunId && !isOptimizing && (
                    <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                      Viewing current run
                    </span>
                  )}
                </div>
                <div className="h-[calc(100vh-280px)] overflow-y-auto space-y-4 font-mono text-xs">
                  {streamLogs.length === 0 &&
                    !isOptimizing &&
                    !currentRunId && (
                      <p className="text-sm text-muted-foreground">
                        Start optimization to see live logs...
                      </p>
                    )}

                  {streamLogs.length === 0 && !isOptimizing && currentRunId && (
                    <p className="text-sm text-muted-foreground">
                      No logs available for this run. It may have been
                      interrupted.
                    </p>
                  )}

                  {streamLogs.map((log, index) => (
                    <div key={index} className="space-y-2">
                      {log.type === "iteration_start" && (
                        <div className="font-bold text-blue-600 text-sm border-b pb-2">
                          === Iteration {log.iteration} ===
                        </div>
                      )}

                      {log.type === "sample" && (
                        <div className="pl-4 space-y-1">
                          <div className="text-muted-foreground">
                            Sample {log.sampleId}:
                          </div>
                          <div className="bg-muted/50 p-2 rounded whitespace-pre-wrap break-words">
                            {log.content}
                          </div>
                        </div>
                      )}

                      {log.type === "evaluation" && (
                        <div className="pl-4 space-y-1">
                          <div className="text-amber-600 font-semibold">
                            Evaluation:
                          </div>
                          <div className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded whitespace-pre-wrap break-words">
                            {log.content}
                          </div>
                        </div>
                      )}

                      {log.type === "iteration_end" && log.prompt && (
                        <div className="pl-4 space-y-1 border-t pt-2">
                          <div className="text-green-600 font-semibold">
                            Selected Prompt:
                          </div>
                          <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded whitespace-pre-wrap break-words">
                            {log.prompt}
                          </div>
                        </div>
                      )}

                      {log.type === "final" && log.prompt && (
                        <div className="space-y-1 border-t-2 border-green-600 pt-4">
                          <div className="text-green-600 font-bold text-base">
                            🎉 Final Optimized Prompt:
                          </div>
                          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded whitespace-pre-wrap break-words">
                            {log.prompt}
                          </div>
                          <Button
                            className="mt-2"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(log.prompt || "");
                              toast.success("Copied to clipboard!");
                            }}
                          >
                            Copy to Clipboard
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* Right Half: Chart */}
              <div className="border rounded-lg p-6 bg-card">
                <h2 className="text-lg font-semibold mb-4">Score Over Time</h2>
                {chartData.length > 0 ? (
                  <div className="h-[calc(100vh-280px)]">
                    <OptimizeLiveChart data={chartData} />
                  </div>
                ) : (
                  <div className="h-[calc(100vh-280px)] flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      Chart will appear as optimization progresses...
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Prompt Editor Dialog */}
      <PromptEditorDialog
        open={promptEditorOpen}
        onOpenChange={(open) => {
          setPromptEditorOpen(open);
          // Reload system prompt after closing if saved
          if (!open) {
            loadSystemPrompt();
          }
        }}
      />

      {/* Metric Prompt Editor Dialog */}
      <MetricPromptEditorDialog
        open={metricPromptEditorOpen}
        onOpenChange={setMetricPromptEditorOpen}
      />
    </div>
  );
}
