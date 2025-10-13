import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import * as path from "path";

const SAMPLES_FILE = path.join(process.cwd(), "data", "samples.json");

export interface SampleGroup {
  id: string;
  name: string;
  timestamp: string;
  samples: any[];
}

export interface SamplesData {
  groups: SampleGroup[];
  currentGroupId: string;
}

async function loadSamplesData(): Promise<SamplesData> {
  try {
    const data = await fs.readFile(SAMPLES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      groups: [
        {
          id: "default",
          name: "Default Group",
          timestamp: new Date().toISOString(),
          samples: [],
        },
      ],
      currentGroupId: "default",
    };
  }
}

async function saveSamplesData(data: SamplesData): Promise<void> {
  await fs.writeFile(SAMPLES_FILE, JSON.stringify(data, null, 2));
}

// GET /api/sample-groups - List all groups
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const groupId = url.searchParams.get("id");

    const data = await loadSamplesData();

    if (groupId) {
      // Return specific group
      const group = data.groups.find((g) => g.id === groupId);
      if (!group) {
        return Response.json({ error: "Group not found" }, { status: 404 });
      }
      return Response.json({ group, currentGroupId: data.currentGroupId });
    }

    // Return all groups
    return Response.json({
      groups: data.groups,
      currentGroupId: data.currentGroupId,
    });
  } catch (error) {
    console.error("Error loading sample groups:", error);
    return Response.json(
      { error: "Failed to load sample groups" },
      { status: 500 }
    );
  }
}

// POST /api/sample-groups - Create a new group
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string") {
      return Response.json(
        { error: "Group name is required" },
        { status: 400 }
      );
    }

    const data = await loadSamplesData();

    const newGroup: SampleGroup = {
      id: nanoid(),
      name,
      timestamp: new Date().toISOString(),
      samples: [],
    };

    data.groups.push(newGroup);
    data.currentGroupId = newGroup.id; // Set as current group

    await saveSamplesData(data);

    return Response.json({ success: true, group: newGroup });
  } catch (error) {
    console.error("Error creating sample group:", error);
    return Response.json(
      { error: "Failed to create sample group" },
      { status: 500 }
    );
  }
}

// PUT /api/sample-groups - Update current group
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { currentGroupId } = body;

    if (!currentGroupId) {
      return Response.json({ error: "Group ID is required" }, { status: 400 });
    }

    const data = await loadSamplesData();

    // Verify group exists
    const group = data.groups.find((g) => g.id === currentGroupId);
    if (!group) {
      return Response.json({ error: "Group not found" }, { status: 404 });
    }

    data.currentGroupId = currentGroupId;
    await saveSamplesData(data);

    return Response.json({ success: true, currentGroupId });
  } catch (error) {
    console.error("Error updating current group:", error);
    return Response.json(
      { error: "Failed to update current group" },
      { status: 500 }
    );
  }
}

// DELETE /api/sample-groups?id=<groupId> - Delete a group
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const groupId = url.searchParams.get("id");

    if (!groupId) {
      return Response.json({ error: "Group ID required" }, { status: 400 });
    }

    if (groupId === "default") {
      return Response.json(
        { error: "Cannot delete default group" },
        { status: 400 }
      );
    }

    const data = await loadSamplesData();

    const groupIndex = data.groups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) {
      return Response.json({ error: "Group not found" }, { status: 404 });
    }

    data.groups.splice(groupIndex, 1);

    // If current group was deleted, switch to default
    if (data.currentGroupId === groupId) {
      data.currentGroupId = data.groups[0]?.id || "default";
    }

    await saveSamplesData(data);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting sample group:", error);
    return Response.json(
      { error: "Failed to delete sample group" },
      { status: 500 }
    );
  }
}
