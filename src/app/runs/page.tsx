"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  CheckCircle,
  ChevronRight,
  Clock,
  Database,
  Loader2,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface RunPrompt {
  iteration: number;
  prompt: string;
  accepted: boolean;
  score: number;
  metrics: Record<string, number | undefined>;
}

interface OptimizationRun {
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

export default function RunsPage() {
  const [runs, setRuns] = useState<OptimizationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<OptimizationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [sampleGroups, setSampleGroups] = useState<any[]>([]);

  useEffect(() => {
    loadRuns();
    loadSampleGroups();
  }, []);

  const loadRuns = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/runs");
      if (response.ok) {
        const data = await response.json();
        setRuns(data.runs || []);
      }
    } catch (error) {
      console.error("Failed to load runs:", error);
      toast.error("Failed to load runs");
    } finally {
      setLoading(false);
    }
  };

  const loadSampleGroups = async () => {
    try {
      const response = await fetch("/api/sample-groups");
      if (response.ok) {
        const data = await response.json();
        setSampleGroups(data.groups || []);
      }
    } catch (error) {
      console.error("Failed to load sample groups:", error);
    }
  };

  const getSampleGroupName = (groupId?: string) => {
    if (!groupId) return "N/A";
    const group = sampleGroups.find((g) => g.id === groupId);
    return group ? group.name : groupId;
  };

  const handleDelete = async (runId: string) => {
    if (!confirm("Are you sure you want to delete this run?")) return;

    try {
      const response = await fetch(`/api/runs?id=${runId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Run deleted");
        if (selectedRun?.id === runId) {
          setSelectedRun(null);
        }
        await loadRuns();
      } else {
        toast.error("Failed to delete run");
      }
    } catch (error) {
      console.error("Failed to delete run:", error);
      toast.error("Failed to delete run");
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 text-xs font-medium">
            <CheckCircle className="size-3" />
            Completed
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 text-xs font-medium">
            <Loader2 className="size-3 animate-spin" />
            Running
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 text-xs font-medium">
            <XCircle className="size-3" />
            Error
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="font-sans w-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-medium">Optimization Runs</h1>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Runs List */}
          <div className="lg:col-span-1">
            <div className="border rounded-lg bg-card overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold">All Runs</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {runs.length} run{runs.length !== 1 ? "s" : ""} total
                </p>
              </div>

              <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Loader2 className="size-6 animate-spin mx-auto mb-2" />
                    Loading runs...
                  </div>
                ) : runs.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Database className="size-12 mx-auto mb-2 opacity-50" />
                    <p>No runs yet</p>
                    <p className="text-xs mt-1">
                      Start an optimization to create your first run
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedRun?.id === run.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedRun(run)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusBadge(run.status)}
                              <span className="text-xs text-muted-foreground truncate">
                                {formatDate(run.timestamp)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Target className="size-3" />
                              <span className="font-medium">
                                Score: {run.bestScore.toFixed(3)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {run.prompts.length} prompt
                              {run.prompts.length !== 1 ? "s" : ""} •{" "}
                              {run.samplesUsed.length} sample
                              {run.samplesUsed.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                          <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Run Details */}
          <div className="lg:col-span-2">
            {!selectedRun ? (
              <div className="border rounded-lg p-12 bg-card text-center">
                <Database className="size-16 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">
                  Select a run to view details
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Run Header */}
                <div className="border rounded-lg p-6 bg-card">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-lg font-semibold">Run Details</h2>
                        {getStatusBadge(selectedRun.status)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="size-4" />
                        {formatDate(selectedRun.timestamp)}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(selectedRun.id)}
                    >
                      <Trash2 className="size-4 mr-2" />
                      Delete
                    </Button>
                  </div>

                  <Separator className="my-4" />

                  {/* Configuration */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Configuration</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          Optimization Model:
                        </span>
                        <div className="font-mono text-xs mt-1">
                          {selectedRun.config.optimizationModel}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Reflection Model:
                        </span>
                        <div className="font-mono text-xs mt-1">
                          {selectedRun.config.reflectionModel}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Batch Size:
                        </span>
                        <div className="font-medium">
                          {selectedRun.config.batchSize}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Iterations:
                        </span>
                        <div className="font-medium">
                          {selectedRun.config.numRollouts}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Best Score:
                        </span>
                        <div className="font-medium text-green-600">
                          {selectedRun.bestScore.toFixed(3)}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Collection Size:
                        </span>
                        <div className="font-medium">
                          {selectedRun.collectionSize}
                        </div>
                      </div>
                      {selectedRun.config.sampleGroupId && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">
                            Sample Group:
                          </span>
                          <div className="font-medium">
                            {getSampleGroupName(
                              selectedRun.config.sampleGroupId
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-sm text-muted-foreground">
                        Metrics:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedRun.config.selectedMetrics.map((metric) => (
                          <span
                            key={metric}
                            className="px-2 py-1 rounded bg-muted text-xs"
                          >
                            {metric}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-sm text-muted-foreground">
                        Samples Used ({selectedRun.samplesUsed.length}):
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedRun.samplesUsed.map((sampleId) => (
                          <span
                            key={sampleId}
                            className="px-2 py-1 rounded bg-muted text-xs font-mono"
                          >
                            {sampleId.substring(0, 8)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Final Prompt */}
                <div className="border rounded-lg p-6 bg-card">
                  <h3 className="text-sm font-semibold mb-3">Final Prompt</h3>
                  <Textarea
                    value={selectedRun.finalPrompt}
                    readOnly
                    className="min-h-[150px] font-mono text-xs bg-muted"
                  />
                  <Button
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedRun.finalPrompt);
                      toast.success("Copied to clipboard!");
                    }}
                  >
                    Copy to Clipboard
                  </Button>
                </div>

                {/* All Prompts */}
                <div className="border rounded-lg p-6 bg-card">
                  <h3 className="text-sm font-semibold mb-4">
                    All Prompts ({selectedRun.prompts.length})
                  </h3>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {selectedRun.prompts.map((promptEntry, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border-2 ${
                          promptEntry.accepted
                            ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10"
                            : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">
                              Iteration {promptEntry.iteration}
                            </span>
                            {promptEntry.accepted ? (
                              <CheckCircle className="size-4 text-green-600" />
                            ) : (
                              <XCircle className="size-4 text-red-600" />
                            )}
                            <span
                              className={`text-xs ${
                                promptEntry.accepted
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {promptEntry.accepted ? "Accepted" : "Rejected"}
                            </span>
                          </div>
                          <span className="text-sm font-medium">
                            Score: {promptEntry.score.toFixed(3)}
                          </span>
                        </div>

                        {/* Metrics */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {Object.entries(promptEntry.metrics).map(
                            ([key, value]) =>
                              value !== undefined && (
                                <span
                                  key={key}
                                  className="px-2 py-1 rounded bg-muted text-xs"
                                >
                                  {key}: {value.toFixed(2)}
                                </span>
                              )
                          )}
                        </div>

                        <Textarea
                          value={promptEntry.prompt}
                          readOnly
                          className="min-h-[100px] font-mono text-xs bg-background"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
