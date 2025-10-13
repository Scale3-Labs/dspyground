"use client";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
    ChevronRight,
    Clock,
    Database,
    Loader2,
    MessageSquare,
    ThumbsDown,
    ThumbsUp,
    Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface SampleGroup {
  id: string;
  name: string;
  timestamp: string;
  samples: any[];
}

export default function SamplesPage() {
  const [groups, setGroups] = useState<SampleGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<SampleGroup | null>(null);
  const [currentGroupId, setCurrentGroupId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/sample-groups");
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups || []);
        setCurrentGroupId(data.currentGroupId || "");

        // Select first group by default
        if (data.groups && data.groups.length > 0 && !selectedGroup) {
          setSelectedGroup(data.groups[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load sample groups:", error);
      toast.error("Failed to load sample groups");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (groupId === "default") {
      toast.error("Cannot delete default group");
      return;
    }

    if (!confirm("Are you sure you want to delete this sample group?")) return;

    try {
      const response = await fetch(`/api/sample-groups?id=${groupId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Sample group deleted");
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null);
        }
        await loadGroups();
      } else {
        toast.error("Failed to delete sample group");
      }
    } catch (error) {
      console.error("Failed to delete sample group:", error);
      toast.error("Failed to delete sample group");
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatMessage = (message: any) => {
    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) => {
          if (part.type === "text") return part.text;
          if (part.type === "tool-call") return `[Tool: ${part.toolName}]`;
          if (part.type === "tool-result") return `[Result: ${part.toolName}]`;
          return "";
        })
        .filter(Boolean)
        .join(" ");
    }

    return "";
  };

  return (
    <div className="font-sans w-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-medium">Sample Groups</h1>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Groups List */}
          <div className="lg:col-span-1">
            <div className="border rounded-lg bg-card overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold">Sample Groups</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {groups.length} group{groups.length !== 1 ? "s" : ""} total
                </p>
              </div>

              <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Loader2 className="size-6 animate-spin mx-auto mb-2" />
                    Loading groups...
                  </div>
                ) : groups.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Database className="size-12 mx-auto mb-2 opacity-50" />
                    <p>No sample groups yet</p>
                    <p className="text-xs mt-1">Create one in the Chat tab</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedGroup?.id === group.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedGroup(group)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">
                                {group.name}
                              </span>
                              {group.id === currentGroupId && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-2 py-0.5 rounded">
                                  Active
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="size-3" />
                              {formatDate(group.timestamp)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {group.samples.length} sample
                              {group.samples.length !== 1 ? "s" : ""}
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

          {/* Right Panel: Samples List */}
          <div className="lg:col-span-2">
            {!selectedGroup ? (
              <div className="border rounded-lg p-12 bg-card text-center">
                <Database className="size-16 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">
                  Select a group to view samples
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group Header */}
                <div className="border rounded-lg p-6 bg-card">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold mb-2">
                        {selectedGroup.name}
                      </h2>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="size-4" />
                        {formatDate(selectedGroup.timestamp)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {selectedGroup.samples.length} sample
                        {selectedGroup.samples.length !== 1 ? "s" : ""} in this
                        group
                      </p>
                    </div>
                    {selectedGroup.id !== "default" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteGroup(selectedGroup.id)}
                      >
                        <Trash2 className="size-4 mr-2" />
                        Delete Group
                      </Button>
                    )}
                  </div>
                </div>

                {/* Samples List */}
                {selectedGroup.samples.length === 0 ? (
                  <div className="border rounded-lg p-12 bg-card text-center">
                    <MessageSquare className="size-16 mx-auto mb-4 opacity-20" />
                    <p className="text-muted-foreground">
                      No samples in this group yet
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Samples will appear here as you add them from the Chat tab
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedGroup.samples.map((sample: any) => (
                      <div
                        key={sample.id}
                        className="border rounded-lg p-6 bg-card"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-xs text-muted-foreground">
                            {formatDate(sample.timestamp)}
                          </div>
                          {sample.feedback && (
                            <div className="flex items-center gap-2">
                              {sample.feedback.rating === "positive" ? (
                                <ThumbsUp className="size-4 text-green-600" />
                              ) : (
                                <ThumbsDown className="size-4 text-red-600" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {sample.feedback.rating}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          {sample.messages.map((msg: any, idx: number) => (
                            <div key={idx} className="space-y-2">
                              <div
                                className={`p-3 rounded-lg ${
                                  msg.role === "user"
                                    ? "bg-blue-50 dark:bg-blue-900/20"
                                    : msg.role === "assistant"
                                    ? "bg-muted/50"
                                    : "bg-amber-50 dark:bg-amber-900/20"
                                }`}
                              >
                                <div className="text-xs font-semibold text-muted-foreground mb-1">
                                  {msg.role.charAt(0).toUpperCase() +
                                    msg.role.slice(1)}
                                </div>
                                <div className="text-sm whitespace-pre-wrap">
                                  {formatMessage(msg)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {sample.feedback && sample.feedback.comment && (
                          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                            <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                              Feedback
                            </div>
                            <div className="text-sm text-amber-900 dark:text-amber-100">
                              {sample.feedback.comment}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
