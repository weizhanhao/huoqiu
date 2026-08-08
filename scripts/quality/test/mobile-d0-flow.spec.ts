import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";

import {
  d0MaestroLabels,
  d0OpenInstrumentLabel,
  d0WatchlistCountLabel,
} from "../../../apps/mobile/src/accessibility/d0-maestro-labels";

const flowPath = new URL(
  "../../../tests/e2e/maestro/d0/golden.yaml",
  import.meta.url,
);

describe("D0 Maestro flow", () => {
  it("parses a native add-once-reset-empty flow whose labels come from the app", () => {
    const flow = readFileSync(flowPath, "utf8");
    const documents = parseAllDocuments(flow);
    expect(documents).toHaveLength(2);
    expect(documents.every((document) => document.errors.length === 0)).toBe(
      true,
    );

    const header = documents[0]?.toJS() as Record<string, unknown>;
    const commands = documents[1]?.toJS() as Record<string, unknown>[];
    expect(header).toMatchObject({
      appId: "com.huoqiu.alpha",
      name: "D0 fixture golden path",
    });
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          "../../../packages/contracts/fixtures/d0.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      instruments: [{ name: string; symbol: string }];
      market: { source: string };
    };
    const instrument = fixture.instruments[0];
    expect(instrument).toBeDefined();
    if (instrument === undefined) throw new Error("D0 instrument is required");

    expect(commands).toEqual([
      { launchApp: { clearState: true } },
      { assertVisible: d0MaestroLabels.demoData },
      { tapOn: d0MaestroLabels.searchTrigger },
      { tapOn: d0MaestroLabels.searchInput },
      { inputText: instrument.symbol },
      { tapOn: d0MaestroLabels.searchSubmit },
      { assertVisible: d0MaestroLabels.searchResults },
      { tapOn: d0OpenInstrumentLabel(instrument.name) },
      { assertVisible: fixture.market.source },
      { assertVisible: d0MaestroLabels.detailDisclosure },
      { tapOn: d0MaestroLabels.addWatchlist },
      { assertVisible: d0MaestroLabels.includedWatchlist },
      { tapOn: d0MaestroLabels.back },
      { tapOn: d0MaestroLabels.back },
      { tapOn: d0MaestroLabels.watchlistTab },
      { assertVisible: d0MaestroLabels.watchlistTitle },
      { assertVisible: d0WatchlistCountLabel(1) },
      { tapOn: d0MaestroLabels.watchlistReset },
      { assertVisible: d0MaestroLabels.watchlistEmpty },
    ]);
    expect(flow).not.toMatch(/localhost|127\.0\.0\.1|expo\s+web/iu);
  });
});
