"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  BookOpen,
  Database,
  FileText,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export default function HowToPage() {
  return (
    <div className="font-sans w-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="size-6" />
              <h1 className="text-xl font-medium">How to Use DSPyground</h1>
              <ThemeToggle />
            </div>
            <Link href="/chat">
              <Button variant="outline" size="sm">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">
              Welcome to DSPyground
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              DSPyground is a prompt optimization playground that helps you
              systematically improve your AI prompts through automated testing
              and optimization. This guide will walk you through the key
              features and how to get started.
            </p>
          </section>

          <Separator />

          {/* Chat Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="size-5" />
              <h3 className="text-xl font-semibold">1. Chat</h3>
            </div>
            <div className="space-y-3 text-muted-foreground">
              <p>
                The Chat page is where you interact with AI models and create
                test samples for optimization.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-foreground">Key Features:</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    <strong>Text Mode:</strong> Have natural conversations with
                    the AI
                  </li>
                  <li>
                    <strong>Structured Output:</strong> Get responses in a
                    predefined JSON schema
                  </li>
                  <li>
                    <strong>Sample Groups:</strong> Organize your test cases
                    into groups
                  </li>
                  <li>
                    <strong>Save Samples:</strong> Click the{" "}
                    <Plus className="inline size-3" /> button to save
                    conversations as test samples
                  </li>
                </ul>
              </div>
              <p className="text-sm">
                💡 <strong>Tip:</strong> Create multiple sample groups for
                different use cases (e.g., &quot;Tone Tests&quot;, &quot;Safety
                Tests&quot;)
              </p>
            </div>
          </section>

          <Separator />

          {/* Optimize Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="size-5" />
              <h3 className="text-xl font-semibold">2. Optimize</h3>
            </div>
            <div className="space-y-3 text-muted-foreground">
              <p>
                The Optimize page uses the GEPA (Generative Prompt Optimization)
                algorithm to automatically improve your prompts based on your
                test samples.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-foreground">How it works:</h4>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>Select a sample group to optimize against</li>
                  <li>Choose your optimization and reflection models</li>
                  <li>
                    Configure metrics to evaluate responses (tone, accuracy,
                    etc.)
                  </li>
                  <li>Set batch size and number of iterations</li>
                  <li>Click Optimize and watch the live progress</li>
                </ol>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Progress Tracking:
                </h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-blue-800 dark:text-blue-200">
                  <li>View live logs of each iteration</li>
                  <li>See sample outputs and evaluations in real-time</li>
                  <li>Track score improvements on the chart</li>
                  <li>Review generated prompts and their scores</li>
                </ul>
              </div>
            </div>
          </section>

          <Separator />

          {/* Runs Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="size-5" />
              <h3 className="text-xl font-semibold">3. Runs</h3>
            </div>
            <div className="space-y-3 text-muted-foreground">
              <p>
                The Runs page shows the history of all your optimization runs.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-foreground">
                  What you can see:
                </h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>All generated prompts from each run</li>
                  <li>Score for each prompt iteration</li>
                  <li>Configuration used (models, metrics, batch size)</li>
                  <li>Which sample group was used</li>
                  <li>Final optimized prompt</li>
                </ul>
              </div>
              <p className="text-sm">
                💡 <strong>Tip:</strong> You can load optimized prompts from
                runs into your system prompt using the prompt editor dialog
              </p>
            </div>
          </section>

          <Separator />

          {/* Samples Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Database className="size-5" />
              <h3 className="text-xl font-semibold">4. Samples</h3>
            </div>
            <div className="space-y-3 text-muted-foreground">
              <p>The Samples page lets you manage your test sample groups.</p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-foreground">
                  Managing Samples:
                </h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>View all sample groups and their contents</li>
                  <li>See conversation history for each sample</li>
                  <li>Delete sample groups (except the default group)</li>
                  <li>Review feedback saved with samples</li>
                </ul>
              </div>
            </div>
          </section>

          <Separator />

          {/* Getting Started */}
          <section>
            <h3 className="text-xl font-semibold mb-4">Quick Start Guide</h3>
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-900 rounded-lg p-4">
                <ol className="list-decimal list-inside space-y-3 ml-2">
                  <li className="font-medium">
                    <strong>Set your preferences</strong>
                    <p className="text-sm font-normal text-muted-foreground mt-1 ml-5">
                      Configure your OpenRouter API key and select available
                      models in the Optimize page settings
                    </p>
                  </li>
                  <li className="font-medium">
                    <strong>Create test samples</strong>
                    <p className="text-sm font-normal text-muted-foreground mt-1 ml-5">
                      Go to Chat, have conversations, and save them as samples.
                      Create different groups for different scenarios
                    </p>
                  </li>
                  <li className="font-medium">
                    <strong>Edit your system prompt</strong>
                    <p className="text-sm font-normal text-muted-foreground mt-1 ml-5">
                      Click the <FileText className="inline size-3" /> button in
                      the chat input to set your initial prompt
                    </p>
                  </li>
                  <li className="font-medium">
                    <strong>Run optimization</strong>
                    <p className="text-sm font-normal text-muted-foreground mt-1 ml-5">
                      Head to Optimize, select your sample group, configure
                      settings, and start optimizing
                    </p>
                  </li>
                  <li className="font-medium">
                    <strong>Review and use results</strong>
                    <p className="text-sm font-normal text-muted-foreground mt-1 ml-5">
                      Check Runs to see your optimized prompts and load the best
                      one back into your system prompt
                    </p>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          <Separator />

          {/* Tips */}
          <section>
            <h3 className="text-xl font-semibold mb-4">Pro Tips</h3>
            <div className="grid gap-3">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">📊 Use Multiple Metrics</h4>
                <p className="text-sm text-muted-foreground">
                  Define custom metrics for different aspects (tone, accuracy,
                  brevity) to get well-rounded optimizations
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">🔄 Iterate Gradually</h4>
                <p className="text-sm text-muted-foreground">
                  Start with fewer iterations to test quickly, then increase for
                  more thorough optimization
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">🎯 Organize Sample Groups</h4>
                <p className="text-sm text-muted-foreground">
                  Keep sample groups focused on specific use cases for better
                  targeted optimizations
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">💾 Save Good Runs</h4>
                <p className="text-sm text-muted-foreground">
                  Your optimization history is preserved - you can always go
                  back and review or reuse previous prompts
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className="text-center pt-8">
            <Link href="/chat">
              <Button size="lg">
                <MessageSquare className="size-4 mr-2" />
                Start Using DSPyground
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
