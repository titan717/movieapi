import { describe, expect, it } from "vitest";
import { isImdbId, skipSegments } from "../src/panda/service.js";

const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

describe("skip segments", () => {
  it("validates IMDb ids", () => {
    expect(isImdbId("tt0903747")).toBe(true);
    expect(isImdbId("0903747")).toBe(false);
    expect(isImdbId("tt1; drop")).toBe(false);
  });
  it("maps IntroDB intro / recap / outro to seconds", async () => {
    const v = await skipSegments("tt0000001", 1, 3, ok({ intro: { start_sec: 183, end_sec: 199, confidence: 1 }, recap: null, outro: { start_sec: 2847, end_sec: 2901, confidence: 1 }, no_recap: false }), 1);
    expect(v.intro).toEqual({ start: 183, end: 199 });
    expect(v.recap).toBeNull();
    expect(v.credits).toEqual({ start: 2847, end: 2901 });
  });
  it("drops low-confidence or inverted markers and survives failures", async () => {
    const v = await skipSegments("tt0000002", 1, 1, ok({ intro: { start_sec: 50, end_sec: 20 }, outro: { start_sec: 10, end_sec: 90, confidence: 0.2 } }), 1);
    expect(v.intro).toBeNull();
    expect(v.credits).toBeNull();
    const boom = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    const w = await skipSegments("tt0000003", 2, 2, boom, 1);
    expect(w).toMatchObject({ intro: null, recap: null, credits: null });
  });
});
