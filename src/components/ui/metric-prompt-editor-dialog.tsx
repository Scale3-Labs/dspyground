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
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface MetricPromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetricsPromptConfig {
  evaluation_instructions: string;
  dimensions: Record<
    string,
    {
      name: string;
      description: string;
      weight: number;
    }
  >;
  positive_feedback_instruction: string;
  negative_feedback_instruction: string;
  comparison_positive: string;
  comparison_negative: string;
}

export function MetricPromptEditorDialog({
  open,
  onOpenChange,
}: MetricPromptEditorDialogProps) {
  const [config, setConfig] = useState<MetricsPromptConfig>({
    evaluation_instructions: "",
    dimensions: {},
    positive_feedback_instruction: "",
    negative_feedback_instruction: "",
    comparison_positive: "",
    comparison_negative: "",
  });
  const [originalConfig, setOriginalConfig] = useState<MetricsPromptConfig>({
    evaluation_instructions: "",
    dimensions: {},
    positive_feedback_instruction: "",
    negative_feedback_instruction: "",
    comparison_positive: "",
    comparison_negative: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load config when dialog opens
  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/metrics-prompt");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setOriginalConfig(JSON.parse(JSON.stringify(data)));
      } else {
        throw new Error("Failed to load metrics prompts");
      }
    } catch (error) {
      console.error("Error loading metrics prompts:", error);
      toast.error("Failed to load metrics prompts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetch("/api/metrics-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        throw new Error("Failed to save metrics prompts");
      }

      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      toast.success("Metrics prompts saved successfully");
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving metrics prompts:", error);
      toast.error("Failed to save metrics prompts");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setConfig(JSON.parse(JSON.stringify(originalConfig)));
    onOpenChange(false);
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const updateDimensionDescription = (key: string, description: string) => {
    setConfig((prev) => ({
      ...prev,
      dimensions: {
        ...prev.dimensions,
        [key]: {
          ...prev.dimensions[key],
          description,
        },
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Edit Metrics Evaluation Prompts</DialogTitle>
          <DialogDescription>
            Customize how each metric is evaluated during prompt optimization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading metrics prompts...
            </div>
          ) : (
            <>
              {/* Evaluation Instructions */}
              <div className="space-y-2">
                <Label htmlFor="eval-instructions">
                  Evaluation Instructions
                </Label>
                <Textarea
                  id="eval-instructions"
                  value={config.evaluation_instructions}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      evaluation_instructions: e.target.value,
                    }))
                  }
                  placeholder="Base instructions for the evaluation model..."
                  className="min-h-[60px] font-mono text-sm"
                />
              </div>

              {/* Metric Dimensions */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">
                  Metric Dimensions
                </Label>
                {Object.entries(config.dimensions || {}).map(([key, dim]) => (
                  <div key={key} className="space-y-2 p-4 border rounded-lg">
                    <Label htmlFor={`dim-${key}`} className="font-medium">
                      {dim.name}
                    </Label>
                    <Textarea
                      id={`dim-${key}`}
                      value={dim.description}
                      onChange={(e) =>
                        updateDimensionDescription(key, e.target.value)
                      }
                      placeholder={`How to evaluate ${dim.name}...`}
                      className="min-h-[80px] font-mono text-sm"
                    />
                  </div>
                ))}
              </div>

              {/* Positive Feedback Instruction */}
              <div className="space-y-2">
                <Label htmlFor="positive-feedback">
                  Positive Feedback Instruction
                </Label>
                <Textarea
                  id="positive-feedback"
                  value={config.positive_feedback_instruction}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      positive_feedback_instruction: e.target.value,
                    }))
                  }
                  placeholder="Instructions when sample has positive feedback..."
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              {/* Negative Feedback Instruction */}
              <div className="space-y-2">
                <Label htmlFor="negative-feedback">
                  Negative Feedback Instruction
                </Label>
                <Textarea
                  id="negative-feedback"
                  value={config.negative_feedback_instruction}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      negative_feedback_instruction: e.target.value,
                    }))
                  }
                  placeholder="Instructions when sample has negative feedback..."
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              {/* Comparison Instructions */}
              <div className="space-y-2">
                <Label htmlFor="comparison-positive">
                  Comparison (Positive Samples)
                </Label>
                <Textarea
                  id="comparison-positive"
                  value={config.comparison_positive}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      comparison_positive: e.target.value,
                    }))
                  }
                  placeholder="How to compare for positive samples..."
                  className="min-h-[60px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="comparison-negative">
                  Comparison (Negative Samples)
                </Label>
                <Textarea
                  id="comparison-negative"
                  value={config.comparison_negative}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      comparison_negative: e.target.value,
                    }))
                  }
                  placeholder="How to compare for negative samples..."
                  className="min-h-[60px] font-mono text-sm"
                />
              </div>
            </>
          )}
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
            {isSaving ? "Saving..." : "Save Prompts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
