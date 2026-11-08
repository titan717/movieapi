import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { decode, decodeFile, encodeFile, fromV3, parseLangs, pickTracks, searchSubtitles, subtitleFile, toVtt } from "../src/panda/subtitles.js";

const link = (n: number) => `https://dl.opensubtitles.org/en/download/src-api/vrf-19c00c5b/file/${n}.gz`;
const row = (n: number, extra: Record<string, string> = {}) => ({ IDSubtitleFile: String(n), SubFormat: "srt", SubSumCD: "1", SubBad: "0", SubLanguageID: "eng", SubDownloadLink: link(n), SubEncoding: "CP1252", SubHearingImpaired: "0", SubDownloadsCnt: String(n), MovieReleaseName: "BluRay", ...extra });

describe("subtitles", () => {
  it("parses languages, max 3, known only", () => {
    expect(parseLangs("en,ES,xx,en")).toEqual(["en", "es"]);
    expect(parseLangs("xx")).toBeNull();
    expect(parseLangs(undefined)).toEqual(["en"]);
    expect(parseLangs("en,es,fr,de")).toHaveLength(3);
  });
  it("round-trips download tokens and rejects other hosts", () => {
    const t = encodeFile(link(5))!;
    expect(decodeFile(t)).toBe(link(5));
    expect(encodeFile("https://evil.example/en/download/x.gz")).toBeNull();
    expect(decodeFile(Buffer.from("en/download/../../x").toString("base64url"))).toBeNull();
    expect(decodeFile("!!")).toBeNull();
  });
  it("picks regular tracks first by downloads, skips multi-CD and bad", () => {
    const tracks = pickTracks([row(10), row(500), row(300, { SubHearingImpaired: "1" }), row(900, { SubSumCD: "2" }), row(800, { SubBad: "1" }), row(700, { SubFormat: "sub" })], "en");
    expect(tracks.map((t) => t.id)).toEqual(["500", "10", "300"]);
    expect(tracks.map((t) => t.label)).toEqual(["English", "English 2", "English (SDH)"]);
    expect(tracks[0].file).toMatch(/^\/api\/v1\/panda\/subtitles\/file\?f=[\w-]+&enc=cp1252$/);
  });
  it("converts SRT to VTT and strips ad cues", () => {
    const vtt = toVtt("\uFEFF1\r\n00:00:06,000 --> 00:00:12,074\r\nWatch Online Movies and Series for FREE\r\nwww.osdb.link/lm\r\n\r\n2\r\n00:02:04,825 --> 00:02:06,75\r\n<font color=\"red\">People</font> are <i>always</i>\r\n{\\an8}asking me\r\n\r\n3\r\n00:03:00,000 --> 00:03:01,000\r\nSupport us and become VIP member\r\n");
    expect(vtt).toBe("WEBVTT\n\n00:02:04.825 --> 00:02:06.750\nPeople are <i>always</i>\nasking me\n");
  });
  it("decodes gzip and legacy encodings", () => {
    const latin = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]);
    expect(decode(gzipSync(latin), "cp1252")).toBe("café");
    expect(decode(new TextEncoder().encode("café"), "cp1252")).toBe("café");
  });
  it("reads the v3 add-on first and asks the REST index only for missing languages", async () => {
    const urls: string[] = [];
    const v3 = { subtitles: [
      { id: "1", url: "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/11", lang: "eng", subtitleFileName: "Show.S01E02.720p.HI.srt", movieReleaseName: "Show.S01E02.720p" },
      { id: "2", url: "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/12", lang: "eng", subtitleFileName: "Show.S01E02.srt", movieReleaseName: "Show.S01E02" },
      { id: "3", url: "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/13", lang: "pob", subtitleFileName: "x.srt" },
      { id: "4", url: "https://evil.example/x.srt", lang: "eng" }
    ] };
    const f = (async (u: string) => {
      urls.push(u);
      const body = u.includes("strem.io") ? v3 : [{ ...row(3), SubLanguageID: "spa" }];
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const a = await searchSubtitles("tt0944947", 1, 2, ["en", "es", "pt"], f, 1000);
    await searchSubtitles("tt0944947", 1, 2, ["en", "es", "pt"], f, 2000);
    expect(urls).toEqual(["https://opensubtitles-v3.strem.io/subtitles/series/tt0944947:1:2.json", "https://rest.opensubtitles.org/search/episode-2/imdbid-0944947/season-1/sublanguageid-spa"]);
    expect(a.map((t) => [t.language, t.label])).toEqual([["en", "English"], ["en", "English (SDH)"], ["es", "Spanish"], ["pt", "Portuguese"]]);
    expect(fromV3(v3).find((r) => r.id === "v3-1")?.hi).toBe(true);
  });
  it("throws when every index fails and nothing is cached", async () => {
    const f = (async () => new Response("<html>", { status: 403, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    await expect(searchSubtitles("tt7777777", null, null, ["en"], f, 1000)).rejects.toThrow(/403/);
  });
  it("accepts Stremio download hosts only", () => {
    expect(decodeFile(encodeFile("https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1")!)).toBe("https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/1");
    expect(encodeFile("https://subs5.strem.io.evil.example/en/download/x")).toBeNull();
  });
  it("downloads a file as VTT", async () => {
    const f = (async () => new Response(gzipSync(Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nHello\n")))) as unknown as typeof fetch;
    expect(await subtitleFile(encodeFile(link(77))!, "utf-8", f)).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n");
    expect(await subtitleFile("bad", "utf-8", f)).toBeNull();
  });
});
