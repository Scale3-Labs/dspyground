"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface OptimizationRun {
  id: string;
  timestamp: string;
  finalPrompt: string;
  bestScore: number;
  config: {
    sampleGroupId?: string;
  };
}

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSampleGroupId?: string;
}

export function PromptEditorDialog({
  open,
  onOpenChange,
  currentSampleGroupId,
}: PromptEditorDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [runs, setRuns] = useState<OptimizationRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");

  // Load prompt and runs when dialog opens
  useEffect(() => {
    if (open) {
      loadPrompt();
      loadRuns();
    }
  }, [open, currentSampleGroupId]);

  const loadPrompt = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/prompt");
      if (res.ok) {
        const data = await res.json();
        setPrompt(data.prompt || "");
        setOriginalPrompt(data.prompt || "");
      } else {
        throw new Error("Failed to load prompt");
      }
    } catch (error) {
      console.error("Error loading prompt:", error);
      toast.error("Failed to load prompt");
    } finally {
      setIsLoading(false);
    }
  };

  const loadRuns = async () => {
    try {
      const res = await fetch("/api/runs");
      if (res.ok) {
        const data = await res.json();
        // Filter runs by current sample group if available
        const allRuns = data.runs || [];
        const filteredRuns = currentSampleGroupId
          ? allRuns.filter(
              (run: OptimizationRun) =>
                run.config.sampleGroupId === currentSampleGroupId &&
                run.finalPrompt
            )
          : allRuns.filter((run: OptimizationRun) => run.finalPrompt);
        setRuns(filteredRuns);
      }
    } catch (error) {
      console.error("Error loading runs:", error);
    }
  };

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId);
    const selectedRun = runs.find((r) => r.id === runId);
    if (selectedRun) {
      setPrompt(selectedRun.finalPrompt);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        throw new Error("Failed to save prompt");
      }

      setOriginalPrompt(prompt);
      toast.success("Prompt saved successfully");
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving prompt:", error);
      toast.error("Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPrompt(originalPrompt);
    setSelectedRunId("");
    onOpenChange(false);
  };

  const hasChanges = prompt !== originalPrompt;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit System Prompt</DialogTitle>
          <DialogDescription>
            Edit the system prompt that guides the AI&apos;s behavior. Changes
            will apply to new conversations.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4 flex flex-col gap-4">
          {runs.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="run-select" className="text-sm font-medium">
                Load Optimized Prompt
                {currentSampleGroupId && (
                  <span className="text-muted-foreground font-normal ml-1">
                    (from current sample group)
                  </span>
                )}
              </Label>
              <Select value={selectedRunId} onValueChange={handleSelectRun}>
                <SelectTrigger id="run-select">
                  <SelectValue placeholder="Select an optimized run..." />
                </SelectTrigger>
                <SelectContent>
                  {runs.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {formatDate(run.timestamp)} - Score:{" "}
                      {run.bestScore.toFixed(3)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading prompt...
              </div>
            ) : (
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your system prompt here..."
                className="h-full font-mono text-sm resize-none"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isLoading}
          >
            {isSaving ? "Saving..." : "Save Prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
