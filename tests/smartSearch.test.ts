import { describe, expect, it } from "vitest";
import { fuzzyVariants, interpretQuery, similarity } from "../src/panda/smartSearch.js";

const now = new Date("2026-11-08T00:00:00Z");

describe("interpretQuery", () => {
  it("reads language + type", () => {
    const r = interpretQuery("hindi movies", now);
    expect(r).toMatchObject({ type: "movie", lang: "hi", label: "Hindi Movies" });
  });
  it("reads k-drama shorthand as Korean TV dramas", () => {
    expect(interpretQuery("k-dramas", now)).toMatchObject({ type: "tv", lang: "ko", genre: "18", label: "Korean Drama Shows" });
  });
  it("reads decades and genres", () => {
    const r = interpretQuery("90s action movies", now)!;
    expect(r).toMatchObject({ type: "movie", genre: "28", from: "1990-01-01", to: "1999-12-31" });
    expect(r.label).toBe("Action Movies from the 1990s");
  });
  it("maps genres to TV ids for shows", () => {
    expect(interpretQuery("sci-fi shows", now)).toMatchObject({ type: "tv", genre: "10765" });
  });
  it("supports best/new and anime", () => {
    expect(interpretQuery("best horror films", now)).toMatchObject({ sort: "vote_average.desc", genre: "27", label: "Top Rated Horror Movies" });
    expect(interpretQuery("anime", now)).toMatchObject({ type: "tv", lang: "ja", genre: "16", label: "Anime" });
    expect(interpretQuery("new malayalam movies", now)?.from).toBe("2025-11-08");
  });
  it("leaves real titles alone", () => {
    expect(interpretQuery("the dark knight", now)).toBeNull();
    expect(interpretQuery("movies", now)).toBeNull();
    expect(interpretQuery("love actually", now)).toBeNull();
    expect(interpretQuery("hindi tamil movies", now)).toBeNull();
  });
});

describe("fuzzy helpers", () => {
  it("scores close titles high", () => {
    expect(similarity("Interstellar", "intersteller")).toBeGreaterThan(0.7);
    expect(similarity("Interstellar", "Frozen")).toBeLessThan(0.2);
  });
  it("produces shorter variants", () => {
    expect(fuzzyVariants("intersteller")).toContain("interste");
    expect(fuzzyVariants("avatarr")).toContain("avatar");
  });
});
