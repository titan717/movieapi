import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { decode, decodeFile, encodeFile, parseLangs, pickTracks, searchSubtitles, subtitleFile, toVtt } from "../src/panda/subtitles.js";

const link = (n: number) => `https://dl.opensubtitles.org/en/download/src-api/vrf-19c00c5b/file/${n}.gz`;
const row = (n: number, extra: Record<string, string> = {}) => ({ IDSubtitleFile: String(n), SubFormat: "srt", SubSumCD: "1", SubBad: "0", SubDownloadLink: link(n), SubEncoding: "CP1252", SubHearingImpaired: "0", SubDownloadsCnt: String(n), MovieReleaseName: "BluRay", ...extra });

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
  it("searches episodes with the right path and caches", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify([row(3)]), { headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
    const a = await searchSubtitles("tt0944947", 1, 2, ["en", "es"], f, 1000);
    await searchSubtitles("tt0944947", 1, 2, ["en", "es"], f, 2000);
    expect(urls).toEqual(["https://rest.opensubtitles.org/search/episode-2/imdbid-0944947/season-1/sublanguageid-eng", "https://rest.opensubtitles.org/search/episode-2/imdbid-0944947/season-1/sublanguageid-spa"]);
    expect(a.map((t) => t.language)).toEqual(["en", "es"]);
  });
  it("downloads a file as VTT", async () => {
    const f = (async () => new Response(gzipSync(Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nHello\n")))) as unknown as typeof fetch;
    expect(await subtitleFile(encodeFile(link(77))!, "utf-8", f)).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n");
    expect(await subtitleFile("bad", "utf-8", f)).toBeNull();
  });
});
