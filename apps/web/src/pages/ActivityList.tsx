import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { RunActivityRow } from "@rakazo/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
} from "@rakazo/ui-web";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

function statusTone(status: RunActivityRow["status"]): string {
  if (status === "failed") return "text-destructive";
  if (status === "cancelled") return "text-muted-foreground";
  if (status === "completed") return "text-success";
  if (status === "waiting_input" || status === "waiting_takeover") return "text-warning";
  return "text-foreground";
}

type ActivityListProps = {
  onOpenRun: (run: RunActivityRow) => void;
};

export function ActivityList({ onOpenRun }: ActivityListProps) {
  const { t } = useLingui();
  const [activeRuns, setActiveRuns] = useState<RunActivityRow[]>([]);
  const [recentRuns, setRecentRuns] = useState<RunActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<"selected" | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const [active, recent] = await Promise.all([
          rpc.runs.list({ filter: "active" }),
          rpc.runs.list({ filter: "recent" }),
        ]);
        if (cancelled) return;
        setActiveRuns(active.runs);
        setRecentRuns(recent.runs);
        // Drop selections for runs that already left the list (e.g. dismissed
        // from another tab) so the delete button's count stays honest.
        setSelected((prev) => {
          if (prev.size === 0) return prev;
          const stillPresent = new Set(recent.runs.map((run) => run.runId));
          const next = new Set([...prev].filter((id) => stillPresent.has(id)));
          return next.size === prev.size ? prev : next;
        });
      } catch {
        // Keep the last good snapshot on transient RPC failures.
        if (cancelled) return;
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Schedule the next poll after the previous settles — no overlap.
          timer = window.setTimeout(() => void tick(), 15_000);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  function toggleSelected(runId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(runId);
      else next.delete(runId);
      return next;
    });
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      if (pendingDelete === "all") {
        await rpc.runs.clearRecent();
        setRecentRuns([]);
      } else {
        const runIds = [...selected];
        await rpc.runs.dismiss({ runIds });
        setRecentRuns((prev) => prev.filter((run) => !runIds.includes(run.runId)));
      }
      setSelected(new Set());
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not delete`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="px-2.5 py-2 text-[13px] text-muted-foreground/80">
        <Trans>Loading activity…</Trans>
      </div>
    );
  }

  if (activeRuns.length === 0 && recentRuns.length === 0) return null;

  return (
    <div className="mb-2 border-b border-border pb-2">
      {activeRuns.length > 0 ? (
        <section>
          <div className="px-2.5 pb-1 pt-1 text-[12.5px] font-medium text-muted-foreground/80">
            <Trans>Now</Trans>
          </div>
          {activeRuns.map((run) => (
            <ActivityRow key={run.runId} run={run} onOpen={() => onOpenRun(run)} />
          ))}
        </section>
      ) : null}
      {recentRuns.length > 0 ? (
        <section className={activeRuns.length > 0 ? "mt-2" : undefined}>
          <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1">
            <button
              type="button"
              aria-expanded={recentOpen}
              onClick={() => setRecentOpen((open) => !open)}
              className="flex flex-1 items-center gap-1 text-[12.5px] font-medium text-muted-foreground/80 hover:text-foreground"
            >
              <ChevronDown
                size={14}
                strokeWidth={2}
                className={`shrink-0 transition-transform ${recentOpen ? "" : "-rotate-90"}`}
              />
              <Trans>Recent</Trans>
              <span className="text-muted-foreground/60">({recentRuns.length})</span>
            </button>
            {recentOpen ? (
              <>
                {selected.size > 0 ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete("selected")}
                  >
                    <Trans>Delete ({selected.size})</Trans>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setPendingDelete("all")}
                >
                  <Trans>Clear</Trans>
                </Button>
              </>
            ) : null}
          </div>
          {recentOpen
            ? recentRuns.map((run) => (
                <ActivityRow
                  key={run.runId}
                  run={run}
                  selectable
                  checked={selected.has(run.runId)}
                  onToggleSelected={(checked) => toggleSelected(run.runId, checked)}
                  onOpen={() => onOpenRun(run)}
                />
              ))
            : null}
        </section>
      ) : null}
      {pendingDelete ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingDelete === "all" ? (
                  <Trans>Clear all recent activity?</Trans>
                ) : (
                  <Trans>
                    Delete {selected.size} recent {selected.size === 1 ? "item" : "items"}?
                  </Trans>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                <Trans>
                  This only removes them from Recent — the conversations themselves are not deleted.
                </Trans>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error ? <p className="text-[13.5px] text-destructive">{error}</p> : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                <Trans>Cancel</Trans>
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function ActivityRow({
  run,
  onOpen,
  selectable = false,
  checked = false,
  onToggleSelected,
}: {
  run: RunActivityRow;
  onOpen: () => void;
  selectable?: boolean;
  checked?: boolean;
  onToggleSelected?: (checked: boolean) => void;
}) {
  const { t } = useLingui();
  const title = run.groupName ? `${run.botName} · ${run.groupName}` : run.botName;
  const label = statusLabel(run.status);
  const activityLabel = t`${title}, ${label}`;
  const tone = statusTone(run.status);
  return (
    <div className="flex w-full items-center gap-1.5 rounded-xl px-1 hover:bg-accent">
      {selectable ? (
        <Checkbox
          aria-label={t`Select ${title}`}
          checked={checked}
          onCheckedChange={(next) => onToggleSelected?.(next === true)}
          className="ms-1.5 shrink-0"
        />
      ) : null}
      <button
        type="button"
        aria-label={activityLabel}
        onClick={onOpen}
        className="flex min-w-0 flex-1 gap-3 rounded-xl px-1.5 py-[9px] text-left"
      >
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full bg-current ${tone}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <span className="shrink-0 text-xs text-muted-foreground/80">
              {formatRelativeTime(run.updatedAt)}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            {run.promptSnippet ? (
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                {run.promptSnippet}
              </span>
            ) : null}
            <span className={`ms-auto shrink-0 text-xs ${tone}`}>{label}</span>
          </div>
        </div>
      </button>
    </div>
  );
}

function formatRelativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return t`just now`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t`${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t`${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return t`${days}d ago`;
  return date.toLocaleDateString(i18n.locale || "en", { month: "short", day: "numeric" });
}

function statusLabel(status: RunActivityRow["status"]): string {
  switch (status) {
    case "queued":
      return t`Queued`;
    case "leased":
      return t`Starting`;
    case "running":
      return t`Running`;
    case "waiting_input":
      return t`Needs input`;
    case "waiting_takeover":
      return t`Needs takeover`;
    case "completed":
      return t`Done`;
    case "failed":
      return t`Failed`;
    case "cancelled":
      return t`Cancelled`;
    default:
      return status;
  }
}
