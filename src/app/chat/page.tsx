"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptimizeLiveChart } from "@/components/ui/optimize-live-chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Circle,
  Info,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ToolCallPart = { type: "tool-call"; toolName: string; args?: unknown };
type ToolResultPart = {
  type: "tool-result";
  toolName: string;
  result?: unknown;
};

type DynamicToolPart = {
  type: `tool-${string}`;
  toolCallId?: string;
  state?: "call-created" | "running" | "output-available" | string;
  input?: unknown;
  output?: unknown;
  callProviderMetadata?: unknown;
};

type StepStartPart = { type: "step-start" };

type UIPair = {
  question: string;
  answer: string;
  tool?: string;
};

type UISession = {
  id: string;
  createdAt: string;
  pairs: UIPair[];
};

type SamplesPayload = { samples: UISession[] };

type OptStats = {
  status: "idle" | "running" | "completed" | "error";
  bestScore?: number | null;
  totalRounds?: number | null;
  converged?: boolean | null;
  optimizerType?: string;
  optimizationTimeMs?: number | null;
  updatedAt?: string;
  instructionLength?: number;
  usedSamples?: { total: number };
};

type TraceEvent =
  | {
      type: "hello";
      runId: string;
    }
  | {
      type: "iteration";
      timestamp: string;
      iteration: number;
      selectedProgramScore?: number;
      bestSoFar?: number;
    }
  | {
      type: "metric";
      timestamp: string;
      iteration: number | null;
      averageMetric: number;
      bestSoFar?: number | null;
    }
  | {
      type: "note";
      timestamp: string;
      iteration: number | null;
      note: string;
      bestSoFar?: number | null;
    }
  | {
      type: "prompt";
      timestamp: string;
      iteration: number | null;
      prompt: string;
    }
  | {
      type: "final";
      runId?: string;
      timestamp: string;
      bestSoFar: number;
    }
  | {
      type: "final_prompt";
      runId?: string;
      timestamp: string;
      prompt: string;
    };

function isToolCallPart(part: unknown): part is ToolCallPart {
  const p = part as { type?: unknown; toolName?: unknown } | null;
  return !!p && p.type === "tool-call" && typeof p.toolName === "string";
}

function isToolResultPart(part: unknown): part is ToolResultPart {
  const p = part as { type?: unknown; toolName?: unknown } | null;
  return !!p && p.type === "tool-result" && typeof p.toolName === "string";
}

function isDynamicToolPart(part: unknown): part is DynamicToolPart {
  const p = part as { type?: unknown } | null;
  return !!p && typeof p.type === "string" && p.type.startsWith("tool-");
}

function isStepStartPart(part: unknown): part is StepStartPart {
  const p = part as { type?: unknown } | null;
  return !!p && p.type === "step-start";
}

function extractTextFromMessageParts(
  parts: ReadonlyArray<{ type: string; text?: string }>
): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join(" ")
    .trim();
}

// Format an ISO timestamp in the user's local timezone; fall back to raw when invalid
function formatLocalTimestamp(ts?: string | null): string | undefined {
  try {
    if (!ts) return undefined;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts || undefined;
    return d.toLocaleString();
  } catch {
    return ts || undefined;
  }
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [teachingPrompt, setTeachingPrompt] = useState("");
  const [isTeachingMode, setIsTeachingMode] = useState(false);
  const [useStructuredOutput, setUseStructuredOutput] = useState(false);
  const [selectedModel, setSelectedModel] = useState("openai/gpt-4o-mini");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Build API URL with current parameters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (useStructuredOutput) params.set("structured", "true");
    if (isTeachingMode && teachingPrompt.trim())
      params.set("teachingPrompt", teachingPrompt.trim());
    if (selectedModel) params.set("model", selectedModel);
    return params.toString() ? `/api/chat?${params.toString()}` : "/api/chat";
  }, [useStructuredOutput, isTeachingMode, teachingPrompt, selectedModel]);

  const { messages, sendMessage, setMessages } = useChat({
    id: `chat-${useStructuredOutput ? "structured" : "text"}`, // Force recreation when mode changes
    transport: new DefaultChatTransport({
      api: apiUrl,
    }),
  });

  // Samples state
  const [samples, setSamples] = useState<SamplesPayload>({ samples: [] });
  const [, setIsLoadingSamples] = useState(false);
  const [savingSample, setSavingSample] = useState(false);

  // Prompt state
  const [prompt, setPrompt] = useState<string>("");
  const [, setIsLoadingPrompt] = useState(false);
  const [isCurrentPromptShown, setIsCurrentPromptShown] = useState(true);
  const [, setActiveVersionId] = useState<string | null>(null);
  const [optStats, setOptStats] = useState<OptStats | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState<string>("prompt");
  const [trace, setTrace] = useState<{
    iterations: Array<{
      i: number;
      selected?: number;
      best?: number;
      avg?: number;
      t?: string;
      prompt?: string;
    }>;
    finalBest?: number;
    finalPrompt?: string;
  }>({ iterations: [] });
  const sseRef = useRef<EventSource | null>(null);

  // Ensure SSE closed on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  // Prompt Versions state
  const [versions, setVersions] = useState<{
    versions: { id: string; timestamp?: string; bestScore?: number | null }[];
  } | null>(null);
  const [versionIndex, setVersionIndex] = useState(0);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Filtered versions for Prompt tab: exclude the latest because "Current" already shows it
  const promptTabVersions = useMemo(() => {
    if (!versions || !Array.isArray(versions.versions))
      return [] as {
        id: string;
        timestamp?: string;
        bestScore?: number | null;
      }[];
    // API returns newest first; drop index 0 so Prompt tab doesn't duplicate Current
    return versions.versions.slice(1);
  }, [versions]);

  // Helper to open SSE stream for a given runId
  function openStream(runId: string) {
    try {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      const es = new EventSource(
        `/api/optimize/stream?runId=${encodeURIComponent(runId)}`
      );
      sseRef.current = es;
      setTrace({ iterations: [] });
      es.onmessage = (evt) => {
        try {
          const ev = JSON.parse(evt.data) as TraceEvent;
          if (ev.type === "hello") return;
          if (ev.type === "iteration") {
            setTrace((prev) => {
              const next = [...prev.iterations];
              const idx = ev.iteration;
              const existingIndex = next.findIndex((d) => d.i === idx);
              const point = {
                i: idx,
                selected: ev.selectedProgramScore,
                best:
                  ev.bestSoFar ?? Math.max(...next.map((x) => x.best || 0), 0),
                t: ev.timestamp,
              };
              if (existingIndex >= 0) {
                next[existingIndex] = { ...next[existingIndex], ...point };
              } else {
                next.push(point);
              }
              next.sort((a, b) => a.i - b.i);
              return { ...prev, iterations: next };
            });
          } else if (ev.type === "metric") {
            setTrace((prev) => {
              if (ev.iteration == null) return prev;
              const next = [...prev.iterations];
              const index = next.findIndex((d) => d.i === ev.iteration);
              const best =
                typeof ev.bestSoFar === "number"
                  ? ev.bestSoFar
                  : next[index]?.best;
              if (index >= 0) {
                next[index] = { ...next[index], avg: ev.averageMetric, best };
              } else {
                next.push({
                  i: ev.iteration,
                  avg: ev.averageMetric,
                  best: best ?? 0,
                  t: ev.timestamp,
                });
                next.sort((a, b) => a.i - b.i);
              }
              return { ...prev, iterations: next };
            });
          } else if (ev.type === "prompt") {
            setTrace((prev) => {
              const next = [...prev.iterations];
              const it =
                ev.iteration ?? (next.length ? next[next.length - 1].i : 0);
              const idx = next.findIndex((d) => d.i === it);
              if (idx >= 0) {
                next[idx] = { ...next[idx], prompt: ev.prompt };
              } else {
                next.push({ i: it, prompt: ev.prompt, t: ev.timestamp });
                next.sort((a, b) => a.i - b.i);
              }
              return { ...prev, iterations: next };
            });
          } else if (ev.type === "final") {
            setTrace((prev) => {
              if (!prev.iterations.length) {
                return {
                  iterations: [
                    {
                      i: 0,
                      best: ev.bestSoFar,
                      selected: ev.bestSoFar,
                      avg: undefined,
                    },
                  ],
                  finalBest: ev.bestSoFar,
                };
              }
              return { ...prev, finalBest: ev.bestSoFar };
            });
            if (sseRef.current) {
              sseRef.current.close();
              sseRef.current = null;
            }
          } else if (ev.type === "final_prompt") {
            setTrace((prev) => ({ ...prev, finalPrompt: ev.prompt }));
          }
        } catch {}
      };
      es.onerror = () => {
        if (sseRef.current) {
          sseRef.current.close();
          sseRef.current = null;
        }
      };
    } catch {}
  }

  // If we know versions and no current run selected, default to latest
  useEffect(() => {
    if (
      !currentRunId &&
      versions &&
      Array.isArray(versions.versions) &&
      versions.versions.length > 0
    ) {
      const latest = versions.versions[0]?.id;
      if (latest) {
        setCurrentRunId(latest);
      }
    }
  }, [versions, currentRunId]);

  // When a runId is set (from fresh run or from versions), open the stream if not already
  useEffect(() => {
    if (currentRunId && !sseRef.current) {
      openStream(currentRunId);
    }
  }, [currentRunId]);

  // Optimizer basic settings (UI-exposed)
  type OptimizerSettings = {
    auto: "off" | "light" | "medium" | "heavy";
    maxMetricCalls?: number;
    candidateSelectionStrategy: "pareto" | "current_best";
    reflectionMinibatchSize: number;
    useMerge: boolean;
    numThreads?: number;
    mainModelId?: string;
    reflectionModelId?: string;
    enableDiskCache: boolean;
    enableMemoryCache: boolean;
  };
  const [optimizerSettings, setOptimizerSettings] = useState<OptimizerSettings>(
    {
      auto: "off",
      maxMetricCalls: 50,
      candidateSelectionStrategy: "pareto",
      reflectionMinibatchSize: 3,
      useMerge: true,
      numThreads: undefined,
      mainModelId: "openai/gpt-4.1-mini",
      reflectionModelId: "openai/gpt-4.1",
      enableDiskCache: false,
      enableMemoryCache: false,
    }
  );

  // Models discovered via Vercel AI Gateway
  type GatewayModel = {
    id: string;
    name: string;
    description: string | null;
    modelType: string;
  };
  const [textModels, setTextModels] = useState<GatewayModel[]>([]);

  // Samples navigation index
  const [sampleIndex, setSampleIndex] = useState(0);

  // Pending session capture
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [pendingPairs, setPendingPairs] = useState<UIPair[]>([]);
  const [showSampleJson, setShowSampleJson] = useState(false);

  async function loadSamples() {
    try {
      setIsLoadingSamples(true);
      const res = await fetch("/api/samples", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load samples");
      const data = await res.json();
      let samplesData: SamplesPayload;

      // Handle legacy format
      if ("good" in data || "bad" in data) {
        const legacyData = data as { good?: UISession[]; bad?: UISession[] };
        samplesData = {
          samples: [...(legacyData.good || []), ...(legacyData.bad || [])],
        };
      } else {
        samplesData = data as SamplesPayload;
      }

      setSamples(samplesData);
      setSampleIndex((idx) =>
        samplesData.samples.length
          ? Math.min(idx, samplesData.samples.length - 1)
          : 0
      );
    } finally {
      setIsLoadingSamples(false);
    }
  }

  useEffect(() => {
    loadSamples();
    (async () => {
      try {
        setIsLoadingPrompt(true);
        const res = await fetch("/api/prompt", { cache: "no-store" });
        const data = (await res.json()) as { prompt?: string };
        setPrompt((data.prompt || "").trim());
        setActiveVersionId(null);
        setIsCurrentPromptShown(true);
      } finally {
        setIsLoadingPrompt(false);
      }
    })();
    (async () => {
      try {
        setIsLoadingVersions(true);
        const res = await fetch("/api/versions", { cache: "no-store" });
        if (res.ok) {
          const v = (await res.json()) as {
            versions: {
              id: string;
              timestamp?: string;
              bestScore?: number | null;
            }[];
          };
          setVersions(v);
          setVersionIndex(0);
        }
      } finally {
        setIsLoadingVersions(false);
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/optimize", { cache: "no-store" });
        const data = await res.json();
        setOptStats(data);
      } catch {}
    })();
    (async () => {
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            textModels?: GatewayModel[];
            models?: GatewayModel[];
          };
          const list = (
            data.textModels && Array.isArray(data.textModels)
              ? data.textModels
              : (data.models || []).filter((m) => m.modelType === "language")
          ) as GatewayModel[];
          setTextModels(list);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (messages.length) {
      const last = messages[messages.length - 1];
      console.log("Last message parts:", last.parts);
    }
  }, [messages]);

  const pendingPairComplete = useMemo(
    () => !!pendingQuestion && !!pendingAnswer,
    [pendingQuestion, pendingAnswer]
  );
  const hasPendingSession = useMemo(
    () => pendingPairs.length > 0 || !!pendingQuestion,
    [pendingPairs.length, pendingQuestion]
  );

  const sessionPreviewPairs = useMemo(() => pendingPairs, [pendingPairs]);

  async function saveSession() {
    const finalPairs: UIPair[] = [
      ...pendingPairs,
      ...(pendingPairComplete
        ? [
            {
              question: pendingQuestion as string,
              answer: pendingAnswer as string,
              tool: pendingTool ?? undefined,
            },
          ]
        : []),
    ];
    if (finalPairs.length === 0) return;
    try {
      setSavingSample(true);
      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairs: finalPairs,
        }),
      });
      if (!res.ok) throw new Error("Failed to save sample");
      const data: SamplesPayload = await res.json();
      setSamples(data);
      setPendingQuestion(null);
      setPendingAnswer(null);
      setPendingTool(null);
      setPendingPairs([]);
    } finally {
      setSavingSample(false);
    }
  }

  function handleAddMessageToSample(message: {
    role: string;
    parts: ReadonlyArray<{ type: string; text?: string }>;
  }) {
    const text = extractTextFromMessageParts(message.parts);
    if (!text) return;

    if (message.role === "user") {
      // Start a new pair selection (user question)
      setPendingQuestion(text);
      setPendingAnswer(null);
      setPendingTool(null);
      return;
    }

    // Assistant message: complete the pair and append to pending session
    if (message.role !== "user") {
      if (!pendingQuestion) return;
      const toolNames = new Set<string>();
      for (const part of message.parts as ReadonlyArray<
        { type: string } & Record<string, unknown>
      >) {
        if (isDynamicToolPart(part)) {
          const toolName = (part.type as string).replace("tool-", "");
          if (toolName) toolNames.add(toolName);
        } else if (isToolCallPart(part)) {
          const toolName = (part as ToolCallPart).toolName;
          if (toolName) toolNames.add(toolName);
        } else if (isToolResultPart(part)) {
          const toolName = (part as ToolResultPart).toolName;
          if (toolName) toolNames.add(toolName);
        }
      }
      const toolValue = Array.from(toolNames).join(", ");
      setPendingPairs((prev) => [
        ...prev,
        {
          question: pendingQuestion as string,
          answer: text,
          tool: toolValue || undefined,
        },
      ]);
      setPendingAnswer(null);
      setPendingTool(null);
      return;
    }
  }

  return (
    <div className="font-sans w-full max-w-none p-6 min-h-[100svh] h-[100svh] overflow-hidden">
      <div className="grid grid-cols-2 gap-6 h-full">
        {/* Left: Chat */}
        <div className="flex flex-col gap-4 h-full min-h-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-xl font-medium">Agent Chat</div>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background">
                <span className="text-xs text-muted-foreground">Text</span>
                <Switch
                  checked={useStructuredOutput}
                  onCheckedChange={setUseStructuredOutput}
                />
                <span className="text-xs text-muted-foreground">
                  Structured
                </span>
              </div>
              <Button
                variant={isTeachingMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsTeachingMode(!isTeachingMode)}
              >
                {isTeachingMode ? "Exit Teaching" : "Teaching Mode"}
              </Button>
              {hasPendingSession && (
                <div className="flex items-center gap-2">
                  <div className="text-xs text-neutral-600">
                    Pending session: {pendingPairs.length} pair
                    {pendingPairs.length === 1 ? "" : "s"}
                    {pendingPairComplete
                      ? " + 1 in progress"
                      : pendingQuestion
                        ? " (select an AI answer)"
                        : ""}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveSession()}
                    disabled={savingSample}
                  >
                    {savingSample ? "Saving…" : "Save Sample"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPendingQuestion(null);
                      setPendingAnswer(null);
                      setPendingTool(null);
                      setPendingPairs([]);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessages([])}
                aria-label="Clear chat"
              >
                Clear
              </Button>
            </div>
          </div>

          {isTeachingMode && (
            <div className="border rounded-md p-4 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900/40">
              <div className="font-medium mb-3">Teaching Mode</div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Scenario + Expected Behavior
                  </label>
                  <Textarea
                    placeholder="Describe the scenario and the expected behavior in one prompt"
                    value={teachingPrompt}
                    onChange={(e) => setTeachingPrompt(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {useStructuredOutput && (
            <div className="border rounded-md p-3 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-900/40">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">
                  Structured Output Mode
                </div>
                <div className="text-xs text-purple-700 dark:text-purple-300">
                  Responses will match the schema defined in data/schema.json
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 border rounded-md p-4 space-y-3 overflow-y-auto dark:border-neutral-800">
            {messages.map((m) =>
              m.role === "system" ? null : (
                <div key={m.id} className="text-sm relative group">
                  <Button
                    aria-label="Add to session sample"
                    variant="outline"
                    size="icon"
                    className="absolute -right-3 -top-3 opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full shadow"
                    onClick={() => handleAddMessageToSample(m)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="font-semibold mr-2">
                    {m.role === "user" ? "You" : "AI"}:
                  </span>
                  {(m.parts || []).map((part, index) => {
                    if (part.type === "text") {
                      const text = (part as { text?: string }).text ?? "";

                      // Debug log for structured mode
                      if (useStructuredOutput && m.role === "assistant") {
                        console.log(
                          "Received text in structured mode:",
                          text.substring(0, 100)
                        );
                      }

                      // Try to parse as JSON if it looks like structured output
                      if (
                        text.trim().startsWith("{") ||
                        text.trim().startsWith("[")
                      ) {
                        try {
                          const parsed = JSON.parse(text);
                          return (
                            <div key={index} className="mt-2">
                              <div className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 inline-block mb-1">
                                Structured Output
                              </div>
                              <pre className="text-xs whitespace-pre-wrap break-words text-neutral-700 bg-neutral-50 border border-neutral-200 rounded p-3 dark:text-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
                                {JSON.stringify(parsed, null, 2)}
                              </pre>
                            </div>
                          );
                        } catch (e) {
                          // Not valid JSON, display as regular text
                          console.log(
                            "Failed to parse JSON:",
                            e,
                            "Text:",
                            text.substring(0, 100)
                          );
                        }
                      }

                      return <span key={index}>{text}</span>;
                    }

                    if (isStepStartPart(part)) {
                      return null;
                    }

                    if (isDynamicToolPart(part)) {
                      const toolName = part.type.replace("tool-", "");
                      return (
                        <div
                          key={index}
                          className="mt-1 text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 rounded p-2"
                        >
                          <div className="font-medium">
                            Tool called: {toolName}
                          </div>
                          <div className="mt-1">
                            <span className="text-neutral-500">Arguments:</span>
                            <pre className="whitespace-pre-wrap break-words text-neutral-600">
                              {JSON.stringify(part.input, null, 2)}
                            </pre>
                          </div>
                          {part.state === "output-available" ? (
                            <div className="mt-1">
                              <span className="text-neutral-500">Output:</span>{" "}
                              <span className="text-neutral-600">
                                {typeof part.output === "string"
                                  ? part.output
                                  : JSON.stringify(part.output)}
                              </span>
                            </div>
                          ) : (
                            <div className="mt-1 text-neutral-500">
                              Running…
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (isToolCallPart(part)) {
                      return (
                        <span key={index} className="text-xs text-neutral-500">
                          Calling {part.toolName} with{" "}
                          {JSON.stringify(part.args)}
                        </span>
                      );
                    }

                    if (isToolResultPart(part)) {
                      return (
                        <span key={index} className="text-xs text-neutral-500">
                          {part.toolName} result: {""}
                          {typeof part.result === "string"
                            ? part.result
                            : JSON.stringify(part.result)}
                        </span>
                      );
                    }

                    return (
                      <span key={index} className="text-xs text-neutral-400">
                        {JSON.stringify(part)}
                      </span>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Save sample controls moved to header next to pending indicator */}

          {hasPendingSession && sessionPreviewPairs.length > 0 && (
            <div className="border rounded-md p-3 text-xs bg-neutral-50">
              <div className="font-medium mb-2">
                Pending session preview ({sessionPreviewPairs.length} pair
                {sessionPreviewPairs.length === 1 ? "" : "s"})
              </div>
              {sessionPreviewPairs.map((p, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <div className="text-neutral-500">
                    Q{sessionPreviewPairs.length > 1 ? `#${i + 1}` : ""}:
                  </div>
                  <div className="mb-1 whitespace-pre-wrap break-words">
                    {p.question}
                  </div>
                  <div className="text-neutral-500">
                    A{sessionPreviewPairs.length > 1 ? `#${i + 1}` : ""}:
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {p.answer}
                  </div>
                  {p.tool ? (
                    <div className="mt-1 text-neutral-500">
                      Tool:
                      <span className="ml-1 text-neutral-700">{p.tool}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isSending) {
                // Cancel generation
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                  abortControllerRef.current = null;
                }
                setIsSending(false);
                return;
              }
              if (!input.trim() && !(isTeachingMode && teachingPrompt.trim()))
                return;
              setIsSending(true);
              abortControllerRef.current = new AbortController();
              try {
                // Ensure a system message when teaching mode is active
                if (isTeachingMode && teachingPrompt.trim()) {
                  const trimmed = teachingPrompt.trim();
                  setMessages((prev) => {
                    const hasSameSystem = prev.some((msg) => {
                      if (msg.role !== "system") return false;
                      const textParts = (msg.parts || []) as ReadonlyArray<{
                        type: string;
                        text?: string;
                      }>;
                      const text = textParts
                        .filter(
                          (p) => p.type === "text" && typeof p.text === "string"
                        )
                        .map((p) => p.text as string)
                        .join(" ")
                        .trim();
                      return text === trimmed;
                    });
                    if (hasSameSystem) return prev;
                    return [
                      {
                        id: `teaching-system-${Date.now()}`,
                        role: "system" as const,
                        parts: [{ type: "text" as const, text: trimmed }],
                      },
                      ...prev,
                    ];
                  });
                }

                // Use useChat for sending in all modes
                await sendMessage({
                  role: "user",
                  parts: [
                    {
                      type: "text",
                      text:
                        input.trim() ||
                        "Please respond according to the teaching scenario.",
                    },
                  ],
                });
              } catch (error) {
                if ((error as Error).name !== "AbortError") {
                  console.error("Send error:", error);
                }
              } finally {
                setIsSending(false);
                abortControllerRef.current = null;
              }
              setInput("");
            }}
            className="flex gap-2 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-t pt-3"
          >
            <div className="relative flex-1">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="pr-12"
              />
              <Button
                type="submit"
                size="icon"
                variant={isSending ? "destructive" : "default"}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md"
                aria-label={isSending ? "Cancel" : "Send"}
              >
                {isSending ? (
                  <Circle className="h-4 w-4" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {textModels.length > 0 ? (
                  textModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="openai/gpt-4o-mini">
                    GPT-4o Mini (loading...)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </form>
        </div>

        {/* Right: Tabs (Prompt | Samples | Optimizer) */}
        <div className="h-full min-h-0 flex flex-col">
          <Tabs
            defaultValue="prompt"
            className="h-full min-h-0 flex flex-col"
            value={(() => {
              return (tabValue ?? "prompt") as string;
            })()}
            onValueChange={(v) => setTabValue(v)}
          >
            <TabsList>
              <TabsTrigger value="prompt">Prompt</TabsTrigger>
              <TabsTrigger value="samples">Samples</TabsTrigger>
              <TabsTrigger value="optimizer">Optimizer</TabsTrigger>
              <TabsTrigger value="hill">History</TabsTrigger>
            </TabsList>

            <TabsContent value="prompt" className="flex-1 min-h-0">
              <div className="border rounded-md p-4 h-full flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Prompt</div>
                </div>
                <div className="mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">
                      Prompt Versions
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Previous version"
                        onClick={async () => {
                          setVersionIndex((i) => Math.max(0, i - 1));
                          try {
                            setIsLoadingPrompt(true);
                            const newIndex = Math.max(0, versionIndex - 1);
                            const id =
                              newIndex === 0
                                ? null
                                : promptTabVersions[newIndex - 1]?.id || null;
                            setActiveVersionId(id);
                            setIsCurrentPromptShown(!id);
                            const res = await fetch(
                              "/api/prompt" +
                                (id
                                  ? `?version=${encodeURIComponent(id)}`
                                  : ""),
                              { cache: "no-store" }
                            );
                            const data = (await res.json()) as {
                              prompt?: string;
                            };
                            setPrompt((data.prompt || "").trim());
                          } finally {
                            setIsLoadingPrompt(false);
                          }
                        }}
                        disabled={isLoadingVersions || versionIndex === 0}
                      >
                        <ChevronLeft />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Next version"
                        onClick={async () => {
                          setVersionIndex((i) => {
                            const total = 1 + (promptTabVersions.length || 0);
                            const next = Math.min(total - 1, i + 1);
                            return next;
                          });
                          try {
                            setIsLoadingPrompt(true);
                            const total = 1 + (promptTabVersions.length || 0);
                            const nextIdx = Math.min(
                              total - 1,
                              versionIndex + 1
                            );
                            const id =
                              nextIdx === 0
                                ? null
                                : promptTabVersions[nextIdx - 1]?.id || null;
                            setActiveVersionId(id);
                            setIsCurrentPromptShown(!id);
                            const res = await fetch(
                              "/api/prompt" +
                                (id
                                  ? `?version=${encodeURIComponent(id)}`
                                  : ""),
                              { cache: "no-store" }
                            );
                            const data = (await res.json()) as {
                              prompt?: string;
                            };
                            setPrompt((data.prompt || "").trim());
                          } finally {
                            setIsLoadingPrompt(false);
                          }
                        }}
                        disabled={
                          isLoadingVersions ||
                          versionIndex >=
                            1 + (promptTabVersions.length || 0) - 1
                        }
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {isLoadingVersions
                      ? "Loading versions…"
                      : (() => {
                          const total = 1 + (promptTabVersions.length || 0);
                          if (!versions || total === 1) {
                            const localTs = formatLocalTimestamp(
                              optStats?.updatedAt
                            );
                            const label = localTs || "Current";
                            return `1 of 1 — ${label}`;
                          }
                          if (versionIndex === 0) {
                            const localTs = formatLocalTimestamp(
                              optStats?.updatedAt
                            );
                            const label = localTs
                              ? `${localTs} — Current`
                              : "Current";
                            return `1 of ${total} — ${label}`;
                          }
                          const rawTs =
                            promptTabVersions[versionIndex - 1]?.timestamp;
                          const localTs = formatLocalTimestamp(rawTs);
                          const label =
                            localTs || promptTabVersions[versionIndex - 1]?.id;
                          return `${versionIndex + 1} of ${total} — ${label}`;
                        })()}
                  </div>
                </div>
                {prompt && isCurrentPromptShown ? (
                  <div className="mb-1">
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">
                      Current
                    </span>
                  </div>
                ) : null}
                {prompt ? (
                  <div className="min-h-0 flex-1">
                    <pre className="text-xs whitespace-pre-wrap break-words text-neutral-700 bg-neutral-50 border border-neutral-200 rounded p-2 h-full overflow-y-auto dark:text-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
                      {prompt}
                    </pre>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500">
                    No prompt configured.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="samples" className="flex-1 min-h-0">
              <div className="border rounded-md p-4 h-full flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Samples</div>
                </div>
                <div className="space-y-2 min-h-0 flex-1 overflow-y-auto">
                  {samples.samples.length === 0 ? (
                    <div className="text-xs text-neutral-500">
                      No samples yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">
                          {sampleIndex + 1} of {samples.samples.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Previous sample"
                            onClick={() =>
                              setSampleIndex((i) => Math.max(0, i - 1))
                            }
                            disabled={sampleIndex === 0}
                          >
                            <ChevronLeft />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Next sample"
                            onClick={() =>
                              setSampleIndex((i) =>
                                Math.min(samples.samples.length - 1, i + 1)
                              )
                            }
                            disabled={sampleIndex >= samples.samples.length - 1}
                          >
                            <ChevronRight />
                          </Button>
                        </div>
                      </div>
                      <div className="border rounded p-2 text-xs">
                        <div className="mb-1 text-neutral-500">
                          Session ID:{" "}
                          <span className="text-neutral-700">
                            {samples.samples[sampleIndex]?.id}
                          </span>
                        </div>
                        <div className="mb-2 text-neutral-500">
                          Created:{" "}
                          <span className="text-neutral-700">
                            {samples.samples[sampleIndex]?.createdAt}
                          </span>
                        </div>
                        {samples.samples[sampleIndex]?.pairs?.map((p, i) => (
                          <div key={i} className="mb-2">
                            <div className="text-neutral-500">
                              Q
                              {samples.samples[sampleIndex]?.pairs.length > 1
                                ? `#${i + 1}`
                                : ""}
                              :
                            </div>
                            <div className="mb-1">{p.question}</div>
                            <div className="text-neutral-500">
                              A
                              {samples.samples[sampleIndex]?.pairs.length > 1
                                ? `#${i + 1}`
                                : ""}
                              :
                            </div>
                            <div>{p.answer}</div>
                            {p.tool ? (
                              <div className="mt-1 text-neutral-500">
                                Tool:{" "}
                                <span className="ml-1 text-neutral-700">
                                  {p.tool}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        ))}
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowSampleJson((v) => !v)}
                          >
                            {showSampleJson ? "Hide JSON" : "Show JSON"}
                          </Button>
                        </div>
                        {showSampleJson && (
                          <pre className="mt-2 p-2 bg-neutral-100 rounded border whitespace-pre-wrap break-words overflow-x-auto dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-200">
                            {JSON.stringify(
                              samples.samples[sampleIndex],
                              null,
                              2
                            )}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="optimizer" className="flex-1 min-h-0">
              <div className="border rounded-md p-4 h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Optimizer Settings</div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        setIsOptimizing(true);
                        const res = await fetch("/api/optimize", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ settings: optimizerSettings }),
                        });
                        if (res.ok) {
                          const { runId } = (await res.json()) as {
                            status: string;
                            runId?: string;
                          };
                          if (runId) {
                            setTabValue("hill");
                            setCurrentRunId(runId);
                            // start streaming
                            if (sseRef.current) {
                              sseRef.current.close();
                              sseRef.current = null;
                            }
                            const es = new EventSource(
                              `/api/optimize/stream?runId=${encodeURIComponent(runId)}`
                            );
                            sseRef.current = es;
                            setTrace({ iterations: [] });
                            es.onmessage = (evt) => {
                              try {
                                const ev = JSON.parse(evt.data) as TraceEvent;
                                if (ev.type === "hello") return;
                                if (ev.type === "iteration") {
                                  setTrace((prev) => {
                                    const next = [...prev.iterations];
                                    const idx = ev.iteration;
                                    const existingIndex = next.findIndex(
                                      (d) => d.i === idx
                                    );
                                    const point = {
                                      i: idx,
                                      selected: ev.selectedProgramScore,
                                      best:
                                        ev.bestSoFar ??
                                        Math.max(
                                          ...next.map((x) => x.best || 0),
                                          0
                                        ),
                                      t: ev.timestamp,
                                    };
                                    if (existingIndex >= 0) {
                                      next[existingIndex] = {
                                        ...next[existingIndex],
                                        ...point,
                                      };
                                    } else {
                                      next.push(point);
                                    }
                                    next.sort((a, b) => a.i - b.i);
                                    return { ...prev, iterations: next };
                                  });
                                } else if (ev.type === "metric") {
                                  setTrace((prev) => {
                                    if (ev.iteration == null) return prev;
                                    const next = [...prev.iterations];
                                    const idx = next.findIndex(
                                      (d) => d.i === ev.iteration
                                    );
                                    const best =
                                      typeof ev.bestSoFar === "number"
                                        ? ev.bestSoFar
                                        : next[idx]?.best;
                                    if (idx >= 0) {
                                      next[idx] = {
                                        ...next[idx],
                                        avg: ev.averageMetric,
                                        best,
                                      };
                                    } else {
                                      next.push({
                                        i: ev.iteration,
                                        avg: ev.averageMetric,
                                        best: best ?? 0,
                                        t: ev.timestamp,
                                      });
                                      next.sort((a, b) => a.i - b.i);
                                    }
                                    return { ...prev, iterations: next };
                                  });
                                } else if (ev.type === "prompt") {
                                  setTrace((prev) => {
                                    const next = [...prev.iterations];
                                    const it =
                                      ev.iteration ??
                                      (next.length
                                        ? next[next.length - 1].i
                                        : 0);
                                    const idx = next.findIndex(
                                      (d) => d.i === it
                                    );
                                    if (idx >= 0) {
                                      next[idx] = {
                                        ...next[idx],
                                        prompt: ev.prompt,
                                      };
                                    } else {
                                      next.push({
                                        i: it,
                                        prompt: ev.prompt,
                                        t: ev.timestamp,
                                      });
                                      next.sort((a, b) => a.i - b.i);
                                    }
                                    return { ...prev, iterations: next };
                                  });
                                } else if (ev.type === "final") {
                                  setTrace((prev) => {
                                    // If we never saw iterations, add a single final point at iteration 0
                                    if (!prev.iterations.length) {
                                      return {
                                        iterations: [
                                          {
                                            i: 0,
                                            best: ev.bestSoFar,
                                            selected: ev.bestSoFar,
                                            avg: undefined,
                                          },
                                        ],
                                        finalBest: ev.bestSoFar,
                                      };
                                    }
                                    return { ...prev, finalBest: ev.bestSoFar };
                                  });
                                  if (sseRef.current) {
                                    sseRef.current.close();
                                    sseRef.current = null;
                                  }
                                } else if (ev.type === "final_prompt") {
                                  setTrace((prev) => ({
                                    ...prev,
                                    finalPrompt: ev.prompt,
                                  }));
                                }
                              } catch {}
                            };
                            es.onerror = () => {
                              if (sseRef.current) {
                                sseRef.current.close();
                                sseRef.current = null;
                              }
                            };
                          }
                          const updateStatus = async () => {
                            try {
                              const s = await fetch("/api/optimize", {
                                cache: "no-store",
                              });
                              const sj = (await s.json()) as OptStats;
                              setOptStats(sj);
                              if (sj?.status === "completed") {
                                try {
                                  // Refresh prompt to show the newly saved instruction
                                  setIsLoadingPrompt(true);
                                  const p = await fetch("/api/prompt", {
                                    cache: "no-store",
                                  });
                                  const pj = (await p.json()) as {
                                    prompt?: string;
                                  };
                                  setPrompt((pj.prompt || "").trim());
                                } finally {
                                  setIsLoadingPrompt(false);
                                }

                                // Reset to show the current prompt version
                                setActiveVersionId(null);
                                setIsCurrentPromptShown(true);
                                setVersionIndex(0);

                                // Refresh versions list so the newly created version appears
                                try {
                                  setIsLoadingVersions(true);
                                  const vres = await fetch("/api/versions", {
                                    cache: "no-store",
                                  });
                                  if (vres.ok) {
                                    const v = (await vres.json()) as {
                                      versions: {
                                        id: string;
                                        timestamp?: string;
                                        bestScore?: number | null;
                                      }[];
                                    };
                                    setVersions(v);
                                  }
                                } finally {
                                  setIsLoadingVersions(false);
                                }

                                return true;
                              }
                            } catch {}
                            return false;
                          };
                          let attempts = 0;
                          const poll = async () => {
                            const done = await updateStatus();
                            if (done) return;
                            attempts += 1;
                            const delay = Math.min(2000 + attempts * 500, 5000);
                            setTimeout(poll, delay);
                          };
                          poll();
                        } else {
                          try {
                            const data = (await res.json()) as {
                              error?: string;
                            };
                            if (data?.error) {
                              toast.error(data.error);
                            } else {
                              toast.error("Failed to start optimization");
                            }
                          } catch {
                            toast.error("Failed to start optimization");
                          }
                        }
                      } catch (e) {
                        const message =
                          e instanceof Error ? e.message : String(e);
                        toast.error(
                          message || "Unexpected error starting optimization"
                        );
                      } finally {
                        setIsOptimizing(false);
                      }
                    }}
                    disabled={isOptimizing || optStats?.status === "running"}
                  >
                    {isOptimizing
                      ? "Started…"
                      : optStats?.status === "running"
                        ? "Running…"
                        : "Optimize Prompt"}
                  </Button>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Main model
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Primary model used during optimization runs. Models discovered via Vercel AI Gateway."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <Select
                      value={optimizerSettings.mainModelId}
                      onValueChange={(value) =>
                        setOptimizerSettings((s) => ({
                          ...s,
                          mainModelId: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {textModels.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Choose the base LM.
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Reflection model
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Model used for GEPA reflection/feedback."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <Select
                      value={optimizerSettings.reflectionModelId}
                      onValueChange={(value) =>
                        setOptimizerSettings((s) => ({
                          ...s,
                          reflectionModelId: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {textModels.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Choose the reflection LM.
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Disk cache
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Enable DSPy disk cache during optimization."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={
                          optimizerSettings.enableDiskCache
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setOptimizerSettings((s) => ({
                            ...s,
                            enableDiskCache: true,
                          }))
                        }
                      >
                        On
                      </Button>
                      <Button
                        variant={
                          !optimizerSettings.enableDiskCache
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setOptimizerSettings((s) => ({
                            ...s,
                            enableDiskCache: false,
                          }))
                        }
                      >
                        Off
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Memory cache
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Enable DSPy in-memory cache during optimization."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={
                          optimizerSettings.enableMemoryCache
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setOptimizerSettings((s) => ({
                            ...s,
                            enableMemoryCache: true,
                          }))
                        }
                      >
                        On
                      </Button>
                      <Button
                        variant={
                          !optimizerSettings.enableMemoryCache
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setOptimizerSettings((s) => ({
                            ...s,
                            enableMemoryCache: false,
                          }))
                        }
                      >
                        Off
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Mode (auto)
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Preset controlling search/budget aggressiveness."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <Select
                      value={optimizerSettings.auto}
                      onValueChange={(value) =>
                        setOptimizerSettings((s) => ({
                          ...s,
                          auto: (value as OptimizerSettings["auto"]) || "off",
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="off" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">off</SelectItem>
                        <SelectItem value="light">light</SelectItem>
                        <SelectItem value="medium">medium</SelectItem>
                        <SelectItem value="heavy">heavy</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Choose overall search intensity.
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600 block mb-1">
                      Max metric calls
                    </label>
                    <Input
                      type="number"
                      placeholder="e.g., 50"
                      value={optimizerSettings.maxMetricCalls ?? ""}
                      onChange={(e) =>
                        setOptimizerSettings((s) => ({
                          ...s,
                          maxMetricCalls:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Candidate selection
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Pareto keeps diverse frontier; current_best exploits the top candidate."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <Select
                      value={optimizerSettings.candidateSelectionStrategy}
                      onValueChange={(value) =>
                        setOptimizerSettings((s) => ({
                          ...s,
                          candidateSelectionStrategy:
                            (value as OptimizerSettings["candidateSelectionStrategy"]) ||
                            "pareto",
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="pareto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pareto">pareto</SelectItem>
                        <SelectItem value="current_best">
                          current_best
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Controls exploration vs. exploitation.
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Reflection minibatch size
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Batch size for each reflection rollout."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <Input
                      type="number"
                      placeholder="e.g., 3"
                      value={optimizerSettings.reflectionMinibatchSize}
                      onChange={(e) =>
                        setOptimizerSettings((s) => ({
                          ...s,
                          reflectionMinibatchSize: Number(e.target.value || 3),
                        }))
                      }
                    />
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Higher = more context per mutation, slower.
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Use merge
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="System-aware merge of strong submodules."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={
                          optimizerSettings.useMerge ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setOptimizerSettings((s) => ({
                            ...s,
                            useMerge: true,
                          }))
                        }
                      >
                        On
                      </Button>
                      <Button
                        variant={
                          !optimizerSettings.useMerge ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setOptimizerSettings((s) => ({
                            ...s,
                            useMerge: false,
                          }))
                        }
                      >
                        Off
                      </Button>
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Try combining best parts across candidates.
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-neutral-600">
                        Num threads
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Parallel candidate evaluations; leave empty for auto."
                      >
                        <Info className="h-3.5 w-3.5 text-neutral-500" />
                      </Button>
                    </div>
                    <Input
                      type="number"
                      placeholder="auto"
                      value={optimizerSettings.numThreads ?? ""}
                      onChange={(e) =>
                        setOptimizerSettings((s) => ({
                          ...s,
                          numThreads:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        }))
                      }
                    />
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Increase to use more CPU cores if available.
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-neutral-700 dark:text-neutral-200">
                  Previous Optimization
                </div>

                <div className="mt-2 text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 rounded p-2 dark:text-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
                  {optStats && optStats.status !== "idle" ? (
                    <div className="space-y-1">
                      {optStats.status === "running" ? (
                        <div className="text-blue-700">
                          Optimization in progress…
                        </div>
                      ) : null}
                      {typeof optStats.bestScore !== "undefined" &&
                      optStats.bestScore !== null ? (
                        <div>
                          <span className="text-neutral-500">Best score:</span>{" "}
                          <span>{(optStats.bestScore * 100).toFixed(1)}%</span>
                        </div>
                      ) : null}
                      {typeof optStats.totalRounds !== "undefined" &&
                      optStats.totalRounds !== null ? (
                        <div>
                          <span className="text-neutral-500">Rounds:</span>{" "}
                          <span>{optStats.totalRounds}</span>
                        </div>
                      ) : null}
                      {typeof optStats.converged !== "undefined" &&
                      optStats.converged !== null ? (
                        <div>
                          <span className="text-neutral-500">Converged:</span>{" "}
                          <span>{optStats.converged ? "Yes" : "No"}</span>
                        </div>
                      ) : null}
                      {optStats.optimizerType ? (
                        <div>
                          <span className="text-neutral-500">Optimizer:</span>{" "}
                          <span>{optStats.optimizerType}</span>
                        </div>
                      ) : null}
                      {typeof optStats.optimizationTimeMs !== "undefined" &&
                      optStats.optimizationTimeMs !== null ? (
                        <div>
                          <span className="text-neutral-500">Time:</span>{" "}
                          <span>
                            {Math.round(optStats.optimizationTimeMs)} ms
                          </span>
                        </div>
                      ) : null}
                      {optStats.usedSamples ? (
                        <div>
                          <span className="text-neutral-500">
                            Samples used:
                          </span>{" "}
                          <span>{optStats.usedSamples.total} samples</span>
                        </div>
                      ) : null}
                      {optStats.updatedAt ? (
                        <div>
                          <span className="text-neutral-500">Updated:</span>{" "}
                          <span>{optStats.updatedAt}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-neutral-500">
                      No optimization run yet.
                    </div>
                  )}
                </div>

                {/* Moved Live Chart to Hill tab */}
              </div>
            </TabsContent>

            <TabsContent value="hill" className="flex-1 overflow-hidden">
              <div className="border rounded-md p-4 h-full overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">History</div>
                </div>
                <div className="mb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">
                      Optimization History
                    </span>
                    {versions &&
                    Array.isArray(versions.versions) &&
                    versions.versions.length > 0 ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Previous run"
                          onClick={() => {
                            if (!versions || !Array.isArray(versions.versions))
                              return;
                            setVersionIndex((i) => Math.max(0, i - 1));
                            const newIndex = Math.max(0, versionIndex - 1);
                            const id = versions?.versions[newIndex]?.id;
                            if (id) setCurrentRunId(id);
                          }}
                          disabled={!versions || versionIndex === 0}
                        >
                          <ChevronLeft />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Next run"
                          onClick={() => {
                            if (!versions || !Array.isArray(versions.versions))
                              return;
                            const total = versions.versions.length;
                            setVersionIndex((i) => Math.min(total - 1, i + 1));
                            const nextIdx = Math.min(
                              versions.versions.length - 1,
                              versionIndex + 1
                            );
                            const id = versions?.versions[nextIdx]?.id;
                            if (id) setCurrentRunId(id);
                          }}
                          disabled={
                            !versions ||
                            versionIndex >= (versions?.versions.length || 0) - 1
                          }
                        >
                          <ChevronRight />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {(() => {
                      if (
                        !versions ||
                        !Array.isArray(versions.versions) ||
                        versions.versions.length === 0
                      ) {
                        return currentRunId
                          ? `${currentRunId}`
                          : "No history yet";
                      }
                      const total = versions.versions.length;
                      const rawTs = versions.versions[versionIndex]?.timestamp;
                      const localTs = formatLocalTimestamp(rawTs);
                      const label =
                        localTs || rawTs || versions.versions[versionIndex]?.id;
                      const isCurrent =
                        versions.versions[versionIndex]?.id === currentRunId;
                      const latestTag = versionIndex === 0 ? " — Latest" : "";
                      return `${versionIndex + 1} of ${total} — ${label}${isCurrent ? " — Current" : ""}${latestTag}`;
                    })()}
                  </div>
                </div>
                {versions &&
                Array.isArray(versions.versions) &&
                versions.versions.length > 0 &&
                versionIndex === 0 ? (
                  <div className="mb-1">
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                      Latest
                    </span>
                  </div>
                ) : null}
                {(() => {
                  const hasAnyHistory = !!(
                    versions &&
                    Array.isArray(versions.versions) &&
                    versions.versions.length > 0
                  );
                  const hasActiveRun =
                    !!currentRunId ||
                    (Array.isArray(trace.iterations) &&
                      trace.iterations.length > 0) ||
                    optStats?.status === "running";
                  if (hasAnyHistory || hasActiveRun) {
                    return (
                      <>
                        <div className="text-xs text-neutral-500 mb-2">
                          Step line = best-so-far
                        </div>
                        <div className="h-72 w-full border rounded-md dark:border-neutral-800 bg-white dark:bg-neutral-950">
                          <OptimizeLiveChart
                            data={trace.iterations.map((d) => ({
                              iteration: d.i,
                              selected: d.selected,
                              best: d.best,
                              avg: d.avg,
                              prompt: d.prompt,
                            }))}
                            finalBest={trace.finalBest}
                            selectedIteration={
                              (
                                trace as unknown as {
                                  selected?: { iteration: number };
                                }
                              ).selected?.iteration ?? null
                            }
                            onSelectPointAction={(p) => {
                              setTrace((prev) => {
                                const next: typeof prev & {
                                  selected?: {
                                    iteration: number;
                                    prompt?: string;
                                    best?: number;
                                    selected?: number;
                                    avg?: number;
                                  };
                                } = { ...prev } as unknown as typeof prev & {
                                  selected?: {
                                    iteration: number;
                                    prompt?: string;
                                    best?: number;
                                    selected?: number;
                                    avg?: number;
                                  };
                                };
                                let effectivePrompt: string | undefined =
                                  undefined;
                                // Prefer final prompt if present (ensures we show the actual final prompt)
                                const fp = (
                                  next as unknown as { finalPrompt?: string }
                                ).finalPrompt;
                                if (typeof fp === "string" && fp.trim()) {
                                  effectivePrompt = fp;
                                }
                                const idx = next.iterations.findIndex(
                                  (d) => d.i === p.iteration
                                );
                                if (idx >= 0) {
                                  for (let k = idx; k >= 0; k -= 1) {
                                    const pr = next.iterations[k]?.prompt;
                                    if (pr && pr.trim()) {
                                      effectivePrompt = pr;
                                      break;
                                    }
                                  }
                                }
                                if (
                                  !effectivePrompt &&
                                  typeof p.prompt === "string"
                                ) {
                                  effectivePrompt = p.prompt;
                                }
                                next.selected = {
                                  iteration: p.iteration,
                                  prompt: effectivePrompt,
                                  best: p.best,
                                  selected: p.selected,
                                  avg: p.avg,
                                };
                                return next as unknown as typeof prev;
                              });
                            }}
                          />
                        </div>
                      </>
                    );
                  }
                  return (
                    <div className="h-72 w-full border rounded-md dark:border-neutral-800 bg-white dark:bg-neutral-950 flex items-center justify-center text-neutral-500">
                      No history yet. Run an optimization to see progress.
                    </div>
                  );
                })()}
                {(() => {
                  const s = (
                    trace as unknown as {
                      selected?: {
                        iteration: number;
                        prompt?: string;
                        best?: number;
                        selected?: number;
                        avg?: number;
                      };
                    }
                  ).selected as
                    | {
                        iteration: number;
                        prompt?: string;
                        best?: number;
                        selected?: number;
                        avg?: number;
                      }
                    | undefined;
                  if (!s) return null;
                  return (
                    <div className="mt-3 border rounded-md p-3 text-sm bg-white dark:bg-neutral-950 dark:border-neutral-800 flex-1 min-h-0 flex flex-col">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          Iteration {s.iteration}
                        </div>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 border rounded"
                          onClick={() =>
                            navigator.clipboard.writeText(s.prompt || "")
                          }
                          title="Copy prompt"
                        >
                          Copy prompt
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-[12px]">
                        <div>
                          Score:{" "}
                          {typeof s.selected === "number"
                            ? s.selected.toFixed(3)
                            : "-"}
                        </div>
                        <div>
                          Best so far:{" "}
                          {typeof s.best === "number" ? s.best.toFixed(3) : "-"}
                        </div>
                      </div>
                      {s.prompt ? (
                        <pre className="mt-2 flex-1 min-h-0 overflow-auto whitespace-pre-wrap text-[12px] p-2 border rounded bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-800">
                          {s.prompt}
                        </pre>
                      ) : (
                        <div className="mt-2 text-[12px] text-neutral-500">
                          No prompt captured for this iteration.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
