"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export function SidebarTriggerButton() {
  const { open } = useSidebar();

  // Only show the trigger when sidebar is closed
  if (open) return null;

  return <SidebarTrigger className="fixed top-4 left-4 z-40" />;
}
