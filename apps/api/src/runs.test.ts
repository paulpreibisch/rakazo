import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  activityNotificationsEnabled,
  activityPromptSnippet,
  clearRecentSpaceRuns,
  dismissSpaceRuns,
} from "./runs.js";

const actor: Actor = {
  spaceId: "space-1",
  userId: "user-1",
  email: "user@rakazo.test",
  isDeploymentOwner: true,
};

describe("run activity copy", () => {
  it("presents structured agent messages instead of their internal wake prompt", () => {
    expect(
      activityPromptSnippet({
        trigger: "bot_message",
        prompt: "[bot] A message just arrived from another bot with internal routing data",
        sourceBlocks: [
          {
            kind: "bot_message_received",
            fromBotId: "maya",
            fromBotName: "Maya",
            text: "Please check the release workflow.",
            intent: "request",
          },
        ],
      }),
    ).toBe("Maya asked: Please check the release workflow.");
  });

  it("fails closed when an agent message has no valid structured source", () => {
    expect(
      activityPromptSnippet({
        trigger: "bot_message",
        prompt: "[bot] private internal routing envelope",
        sourceBlocks: [{ kind: "text", text: "not a peer message" }],
      }),
    ).toBe("Message from another agent");
  });
});

describe("run activity notification preference", () => {
  it("silences only direct messages", () => {
    expect(activityNotificationsEnabled(null, false)).toBe(false);
    expect(activityNotificationsEnabled("group-1", false)).toBe(true);
  });
});

describe("dismissSpaceRuns", () => {
  it("scopes the update to this actor's own terminal, not-yet-dismissed runs", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = { run: { updateMany } } as unknown as PrismaClient;

    const result = await dismissSpaceRuns(prisma, actor, ["run-1", "run-2"]);

    expect(result).toEqual({ dismissed: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["run-1", "run-2"] },
        spaceId: actor.spaceId,
        userId: actor.userId,
        status: { in: ["completed", "failed", "cancelled"] },
        dismissedAt: null,
      },
      data: { dismissedAt: expect.any(Date) },
    });
  });

  it("short-circuits on an empty id list without touching the database", async () => {
    const updateMany = vi.fn();
    const prisma = { run: { updateMany } } as unknown as PrismaClient;

    const result = await dismissSpaceRuns(prisma, actor, []);

    expect(result).toEqual({ dismissed: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("clearRecentSpaceRuns", () => {
  it("dismisses every currently-recent run for this actor", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 5 });
    const prisma = { run: { updateMany } } as unknown as PrismaClient;

    const result = await clearRecentSpaceRuns(prisma, actor);

    expect(result).toEqual({ dismissed: 5 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        status: { in: ["completed", "failed", "cancelled"] },
        dismissedAt: null,
      },
      data: { dismissedAt: expect.any(Date) },
    });
  });
});
