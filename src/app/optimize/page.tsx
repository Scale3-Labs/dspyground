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

  // Dialog state
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [metricPromptEditorOpen, setMetricPromptEditorOpen] = useState(false);

  // UI state
  const [textModels, setTextModels] = useState<GatewayModel[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [iterations, setIterations] = useState<IterationResult[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [finalPrompt, setFinalPrompt] = useState<string>("");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [streamLogs, setStreamLogs] = useState<StreamLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string>("settings");
  const logsEndRef = useRef<HTMLDivElement>(null);

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

    setIsOptimizing(true);
    setIterations([]);
    setChartData([]);
    setFinalPrompt("");
    setStreamLogs([]);
    setActiveTab("progress"); // Switch to progress tab

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
            }

            if (result.type === "error") {
              toast.error(result.error || "Optimization error");
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

  const handleStop = () => {
    setIsOptimizing(false);
    toast.info("Stopping optimization...");
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
            <div className="flex gap-6">
              <div className="flex-1 space-y-6">
                <div className="border rounded-lg p-6 bg-card">
                  <h2 className="text-lg font-semibold mb-4">Configuration</h2>

                  {/* System Prompt (Read-only) */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">
                        System Prompt (from prompt.md)
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
                <h2 className="text-lg font-semibold mb-4">Live Stream</h2>
                <div className="h-[calc(100vh-280px)] overflow-y-auto space-y-4 font-mono text-xs">
                  {streamLogs.length === 0 && !isOptimizing && (
                    <p className="text-sm text-muted-foreground">
                      Start optimization to see live logs...
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
