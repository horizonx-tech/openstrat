import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MarketDatasetIndexEntrySchema,
  MarketDatasetManifestSchema,
  type MarketDatasetManifest
} from "@openstrat/domain";
import { FileObjectStore } from "@openstrat/persistence";
import {
  getMarketDatasetManifest,
  listMarketDatasetIndexEntries,
  marketDatasetIndexRef,
  marketDatasetManifestRef,
  normalizedMarketDataObjectRef,
  putMarketDatasetManifest,
  rawMarketDataObjectRef,
  writeMarketDatasetIndexEntry,
  writeMarketDatasetManifestAndIndex
} from "./datasets.js";

const receivedAt = "2026-06-04T00:00:00.000Z";
const startAt = "2023-04-19T17:00:00.000Z";
const endAt = "2023-04-19T18:00:00.000Z";

function sampleManifest(): MarketDatasetManifest {
  return MarketDatasetManifestSchema.parse({
    dataset_ref: "datasets/hyperliquid/BTC-PERP/2026-06-04T00-00-00.000Z.json",
    canonical_symbol: "BTC-PERP",
    source: "hyperliquid",
    venue: "hyperliquid",
    asset_class: "crypto",
    created_at: receivedAt,
    time_range: {
      start_at: startAt,
      end_at: endAt
    },
    acquisition: {
      method: "fixture",
      requested_at: receivedAt,
      completed_at: receivedAt,
      actor: "test",
      deterministic: true
    },
    source_provenance: {
      source_kind: "public_ledger",
      public_ledger: true,
      replayable: true,
      verification_refs: ["https://hyperliquid.gitbook.io/hyperliquid-docs/"]
    },
    raw_refs: [
      {
        ref: "raw/hyperliquid/candles/BTC/15m/1681923600000-1681927200000.json",
        kind: "candles",
        source: "hyperliquid",
        venue: "hyperliquid",
        captured_at: receivedAt,
        request: {
          type: "candleSnapshot"
        },
        immutable: true
      }
    ],
    normalized_refs: [
      {
        ref: "normalized/hyperliquid/candles/BTC/15m/1681923600000-1681927200000.json",
        family: "candles",
        canonical_symbol: "BTC-PERP",
        source: "hyperliquid",
        venue: "hyperliquid",
        created_at: receivedAt,
        raw_refs: ["raw/hyperliquid/candles/BTC/15m/1681923600000-1681927200000.json"],
        immutable: true
      }
    ],
    freshness: {
      as_of: receivedAt,
      stale_after_ms: 5000
    },
    coverage: {
      families: ["candles"],
      candle_intervals: ["15m"]
    },
    append_only: true
  });
}

describe("market dataset storage layout", () => {
  let tempDir: string;
  let store: FileObjectStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "openstrat-market-datasets-"));
    store = new FileObjectStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds deterministic raw, normalized, dataset, and index refs", () => {
    expect(
      rawMarketDataObjectRef({
        source: "hyperliquid",
        family: "candles",
        parts: ["BTC", "15m", "1681923600000-1681927200000"]
      })
    ).toBe("raw/hyperliquid/candles/BTC/15m/1681923600000-1681927200000.json");
    expect(
      normalizedMarketDataObjectRef({
        source: "hyperliquid",
        family: "candles",
        parts: ["BTC", "15m", "1681923600000-1681927200000"]
      })
    ).toBe("normalized/hyperliquid/candles/BTC/15m/1681923600000-1681927200000.json");
    expect(
      marketDatasetManifestRef({
        source: "hyperliquid",
        canonical_symbol: "BTC-PERP",
        received_at: receivedAt
      })
    ).toBe("datasets/hyperliquid/BTC-PERP/2026-06-04T00-00-00.000Z.json");
    expect(
      marketDatasetIndexRef({
        source: "hyperliquid",
        venue: "hyperliquid",
        canonical_symbol: "BTC-PERP"
      })
    ).toBe("indexes/market-datasets/hyperliquid/hyperliquid/BTC-PERP.json");
  });

  it("writes and reads dataset manifests without overwriting by default", () => {
    const manifest = sampleManifest();

    putMarketDatasetManifest(store, manifest);

    expect(getMarketDatasetManifest(store, manifest.dataset_ref)).toMatchObject({
      dataset_ref: manifest.dataset_ref,
      canonical_symbol: "BTC-PERP"
    });
    expect(() => putMarketDatasetManifest(store, manifest)).toThrow(
      "Object already exists"
    );
  });

  it("writes index entries and lists them by symbol, source, venue, family, and time range", () => {
    const manifest = sampleManifest();
    const entry = writeMarketDatasetManifestAndIndex(store, manifest);

    expect(MarketDatasetIndexEntrySchema.safeParse(entry).success).toBe(true);
    expect(
      listMarketDatasetIndexEntries(store, {
        canonical_symbol: "BTC-PERP",
        source: "hyperliquid",
        venue: "hyperliquid",
        start_at: "2023-04-19T17:30:00.000Z",
        end_at: "2023-04-19T18:30:00.000Z",
        families: ["candles"]
      })
    ).toEqual([entry]);
    expect(
      listMarketDatasetIndexEntries(store, {
        canonical_symbol: "BTC-PERP",
        source: "hyperliquid",
        venue: "hyperliquid",
        start_at: "2023-04-20T00:00:00.000Z",
        end_at: "2023-04-20T01:00:00.000Z"
      })
    ).toEqual([]);
  });

  it("deduplicates index entries by dataset ref while preserving append-only datasets", () => {
    const manifest = sampleManifest();
    const entry = writeMarketDatasetManifestAndIndex(store, manifest);
    writeMarketDatasetIndexEntry(store, entry);

    expect(
      listMarketDatasetIndexEntries(store, {
        canonical_symbol: "BTC-PERP",
        source: "hyperliquid",
        venue: "hyperliquid"
      })
    ).toEqual([entry]);
    expect(() => writeMarketDatasetManifestAndIndex(store, manifest)).toThrow(
      "Object already exists"
    );
  });
});
