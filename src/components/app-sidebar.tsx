"use client";

import {
  BookOpen,
  Database,
  FileText,
  MessageSquare,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const items = [
  {
    title: "Chat",
    url: "/chat",
    icon: MessageSquare,
  },
  {
    title: "Optimize",
    url: "/optimize",
    icon: Sparkles,
  },
  {
    title: "Runs",
    url: "/runs",
    icon: FileText,
  },
  {
    title: "Samples",
    url: "/samples",
    icon: Database,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleFactoryReset = async () => {
    try {
      setIsResetting(true);

      // Clear runs
      const runsRes = await fetch("/api/factory-reset", {
        method: "POST",
      });

      if (!runsRes.ok) {
        throw new Error("Failed to factory reset");
      }

      toast.success("Factory reset completed successfully");
      setResetDialogOpen(false);

      // Reload the page to reflect changes
      window.location.reload();
    } catch (error) {
      console.error("Error during factory reset:", error);
      toast.error("Failed to complete factory reset");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Sidebar variant="floating" collapsible="offcanvas">
      <SidebarHeader className="flex flex-row items-center justify-between p-4">
        <span className="text-lg font-semibold">DSPyground</span>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 flex flex-row items-center justify-start gap-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-muted-foreground"
        >
          <Link href="/how-to">
            <BookOpen className="size-4 mr-2" />
            How To
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setResetDialogOpen(true)}
          className="text-muted-foreground hover:text-destructive"
          title="Factory Reset"
        >
          <Trash2 className="size-4" />
        </Button>
      </SidebarFooter>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              samples, runs, and reset your system prompt to &quot;You are a
              helpful assistant.&quot; Your preferences will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFactoryReset}
              disabled={isResetting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isResetting ? "Resetting..." : "Yes, reset everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
