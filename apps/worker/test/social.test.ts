import { describe, it, expect } from "vitest";
import { ApiPublisher, apiConnectionProblems } from "../src/social";

describe("ApiPublisher (Metricool REST)", () => {
  it("POST /api/v2/scheduler/posts cu blogId, userId și X-Mc-Auth; erorile per postare nu opresc restul", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 2) return new Response(JSON.stringify({ error: "network not connected" }), { status: 400 });
      return new Response(JSON.stringify({ data: { id: 123, uuid: "u-1" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new ApiPublisher("tok", "42", fake);
    const r = await p.schedule([
      { index: 0, blogId: "b1", date: "2026-11-24T19:00:00+02:00", info: { text: "a" } },
      { index: 1, blogId: "b1", date: "2026-11-24T19:20:00+02:00", info: { text: "b" } },
    ]);
    expect(calls[0].url).toBe("https://app.metricool.com/api/v2/scheduler/posts?blogId=b1&userId=42");
    expect((calls[0].init.headers as Record<string, string>)["X-Mc-Auth"]).toBe("tok");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: "a" });
    expect(r[0]).toMatchObject({ index: 0, ok: true, id: "123", uuid: "u-1" });
    expect(r[1]).toMatchObject({ index: 1, ok: false });
    expect(r[1].error).toMatch(/400/);
  });
});

describe("conexiuni Metricool", () => {
  it("rețea lipsă sau expirată pe brand", () => {
    const profiles = [{ id: 7, instagram: "contul_meu", tiktok: null, youtube: "UC123", facebook: "pagina", youtubeStatus: "TOKEN_EXPIRED" }];
    const p = apiConnectionProblems(profiles, [{ blogId: "7", platforms: ["instagram", "tiktok", "youtube"] }]);
    expect(p).toEqual(["brand 7: tiktok neconectat", "brand 7: youtube conexiune expirată"]);
  });
  it("brand inexistent", () => expect(apiConnectionProblems([], [{ blogId: "9", platforms: ["tiktok"] }])).toEqual(["brand 9 nu există în cont"]));
});
