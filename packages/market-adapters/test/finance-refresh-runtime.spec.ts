import { describe, expect, it, vi } from "vitest";

import {
  FinanceSnapshotRefreshRuntime,
  type FinanceRefreshTimer,
} from "../src/finance/refresh-runtime.js";
import type {
  FinanceIngestionJob,
  FinanceScheduledResult,
} from "../src/finance/scheduler.js";

const jobFor = (
  source: string,
  minPollIntervalSeconds: number,
): FinanceIngestionJob =>
  ({
    source: {
      descriptor: {
        source,
        minPollIntervalSeconds,
      },
    },
  }) as FinanceIngestionJob;

class CapturingTimer implements FinanceRefreshTimer {
  readonly scheduled: {
    callback: () => void;
    delayMilliseconds: number;
    handle: object;
  }[] = [];

  clear(handle: object): void {
    const index = this.scheduled.findIndex(
      (scheduled) => scheduled.handle === handle,
    );
    if (index >= 0) this.scheduled.splice(index, 1);
  }

  set(callback: () => void, delayMilliseconds: number): object {
    const handle = {};
    this.scheduled.push({ callback, delayMilliseconds, handle });
    return handle;
  }

  fire(index = 0): void {
    const scheduled = this.scheduled.splice(index, 1)[0];
    if (scheduled === undefined) throw new Error("No timer is scheduled");
    scheduled.callback();
  }
}

describe("finance snapshot refresh runtime", () => {
  it("refreshes immediately and schedules every source at its verified minimum cadence", async () => {
    const sec = jobFor("sec-edgar", 60);
    const gdelt = jobFor("gdelt-gkg", 900);
    const timer = new CapturingTimer();
    const runAll = vi.fn(
      async (jobs: readonly FinanceIngestionJob[]): Promise<FinanceScheduledResult[]> =>
        jobs.map((job) => ({
          status: "published",
          source: job.source.descriptor.source,
          generatedAt: "2026-08-12T00:00:00.000Z",
          ingestion: {
            status: "ready",
            source: job.source.descriptor.source,
            sourceMode: "real",
            attempts: 1,
            fetched: 0,
            created: 0,
            updated: 0,
            duplicates: 0,
            records: [],
          },
        })),
    );
    const runtime = new FinanceSnapshotRefreshRuntime({
      coordinator: { runAll },
      jobs: [sec, gdelt],
      timer,
    });

    await runtime.start();

    expect(runAll).toHaveBeenCalledTimes(1);
    expect(runAll).toHaveBeenCalledWith([sec, gdelt]);
    expect(
      timer.scheduled.map(({ delayMilliseconds }) => delayMilliseconds),
    ).toEqual([60_000, 900_000]);
  });

  it("does not let a stopped generation reschedule into a restarted runtime", async () => {
    const sec = jobFor("sec-edgar", 60);
    const timer = new CapturingTimer();
    let finishOldRefresh!: () => void;
    const oldRefresh = new Promise<void>((resolve) => {
      finishOldRefresh = resolve;
    });
    let refreshCalls = 0;
    const runAll = vi.fn(async (): Promise<FinanceScheduledResult[]> => {
      refreshCalls += 1;
      if (refreshCalls === 2) await oldRefresh;
      return [];
    });
    const runtime = new FinanceSnapshotRefreshRuntime({
      coordinator: { runAll },
      jobs: [sec],
      timer,
    });

    await runtime.start();
    timer.fire();
    await vi.waitFor(() => expect(runAll).toHaveBeenCalledTimes(2));
    const stopping = runtime.stop();
    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finishOldRefresh();
    await stopping;
    await runtime.start();
    expect(timer.scheduled).toHaveLength(1);

    await Promise.resolve();
    await Promise.resolve();
    expect(timer.scheduled).toHaveLength(1);
  });

  it("reports an unexpected scheduled failure and continues refreshing", async () => {
    const sec = jobFor("sec-edgar", 60);
    const timer = new CapturingTimer();
    const failure = new Error("snapshot repository unavailable");
    const runAll = vi
      .fn<
        (
          jobs: readonly FinanceIngestionJob[],
        ) => Promise<readonly FinanceScheduledResult[]>
      >()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(failure);
    const onUnexpectedError = vi.fn();
    const runtime = new FinanceSnapshotRefreshRuntime({
      coordinator: { runAll },
      jobs: [sec],
      onUnexpectedError,
      timer,
    });

    await runtime.start();
    timer.fire();
    await vi.waitFor(() =>
      expect(onUnexpectedError).toHaveBeenCalledWith(failure, "sec-edgar"),
    );
    expect(timer.scheduled).toHaveLength(1);

    await runtime.stop();
  });
});
