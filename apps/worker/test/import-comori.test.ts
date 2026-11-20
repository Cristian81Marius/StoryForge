import { describe, it, expect } from "vitest";
import { withRetry, HttpError, type Fetcher } from "../src/import-comori";

describe("withRetry (limitarea de trafic a site-ului)", () => {
  const waits: number[] = [];
  const wait = async (ms: number) => void waits.push(ms);

  it("reîncearcă 500 cu pauze progresive, apoi reușește", async () => {
    waits.length = 0;
    let n = 0;
    const f: Fetcher = async (url) => {
      if (n++ < 2) throw new HttpError(500, url);
      return "ok";
    };
    await expect(withRetry(f, [5, 20, 60], wait)("u")).resolves.toBe("ok");
    expect(waits).toEqual([5, 20]);
  });

  it("404 nu se reîncearcă", async () => {
    waits.length = 0;
    const f: Fetcher = async (url) => {
      throw new HttpError(404, url);
    };
    await expect(withRetry(f, [5, 20], wait)("u")).rejects.toThrow(/404/);
    expect(waits).toEqual([]);
  });

  it("renunță după ultima pauză", async () => {
    waits.length = 0;
    const f: Fetcher = async (url) => {
      throw new HttpError(503, url);
    };
    await expect(withRetry(f, [1, 2], wait)("u")).rejects.toThrow(/503/);
    expect(waits).toEqual([1, 2]);
  });

  it("erorile de rețea se reîncearcă", async () => {
    let n = 0;
    const f: Fetcher = async () => {
      if (n++ === 0) throw new TypeError("fetch failed");
      return "ok";
    };
    await expect(withRetry(f, [1], async () => {})("u")).resolves.toBe("ok");
  });
});
