-- Lets a user clear an entry out of the Recent activity feed without touching
-- the underlying run, thread or messages. Active runs are never dismissible;
-- only terminal (recent) runs can be hidden this way.
ALTER TABLE "runs" ADD COLUMN "dismissedAt" TIMESTAMP(3);

CREATE INDEX "runs_spaceId_userId_status_dismissedAt_idx" ON "runs"("spaceId", "userId", "status", "dismissedAt");
