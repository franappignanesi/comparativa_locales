import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSuggestionLink } from "../src/lib/game-suggestion-link";
import { matchGameSuggestion, sameSuggestionEdition, suggestionCandidateConflict } from "../src/lib/game-suggestion-matching";
import { suggestionBody, suggestionOriginAllowed } from "../src/lib/game-suggestion-http";
import { POST } from "../src/app/api/suggestions/route";
import { GET as adminGet, PATCH as adminPatch } from "../src/app/api/admin/suggestions/route";
import type { SuggestionPreview } from "../src/lib/game-suggestion-types";

test("store links are canonicalized without trackers or regional duplicates", () => {
  assert.deepEqual(parseSuggestionLink("https://store.steampowered.com/app/620/Portal_2/?utm_source=test#x"), { store: "steam", storeId: "app/620", url: "https://store.steampowered.com/app/620/" });
  assert.equal(parseSuggestionLink("https://store.steampowered.com/sub/10/").storeId, "sub/10");
  assert.equal(parseSuggestionLink("https://es.humblebundle.com/store/alan-wake-remastered").url, "https://www.humblebundle.com/store/alan-wake-remastered");
  assert.equal(parseSuggestionLink("https://www.gog.com/es/game/cuphead").storeId, "cuphead");
  assert.equal(parseSuggestionLink("https://store.epicgames.com/es-ES/p/alan-wake-2").store, "epic");
  assert.equal(parseSuggestionLink("https://www.xbox.com/es-AR/games/store/game/9N7271QN4SGB").storeId, "9N7271QN4SGB");
});
test("SSRF, redirects, ports, credentials, unsafe paths and lookalike domains are rejected", () => {
  for (const url of ["http://store.steampowered.com/app/620/", "https://127.0.0.1/app/620/", "https://store.steampowered.com.evil.test/app/620/", "https://evil.test@store.steampowered.com/app/620/", "https://store.steampowered.com:444/app/620/", "https://store.steampowered.com/linkfilter/?url=https://evil.test", "https://www.gog.com/en/game/%2e%2e", "https://www.humblebundle.com/store/a/extra", "https://store.steampowered.com/app/0/", "https://bit.ly/game"]) assert.throws(() => parseSuggestionLink(url), url);
});
test("same origin and bounded JSON are mandatory for mutations", async () => {
  const req = (origin?: string) => new Request("https://www.shuxteam.com/api/suggestions", { headers: origin ? { origin } : {} });
  assert.equal(suggestionOriginAllowed(req()), false);
  assert.equal(suggestionOriginAllowed(req("https://evil.test")), false);
  assert.equal(suggestionOriginAllowed(req("https://www.shuxteam.com")), true);
  await assert.rejects(suggestionBody(new Request("https://test", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:"x".repeat(5000)})})));
  await assert.rejects(suggestionBody(new Request("https://test", {method:"POST",headers:{"content-type":"application/json"},body:"[]"})));
});
test("public and admin endpoints reject unsigned user or email claims before accessing storage", async () => {
  assert.equal((await POST(new Request("https://www.shuxteam.com/api/suggestions", {method:"POST",body:JSON.stringify({userId:"someone"})}))).status, 401);
  assert.equal((await adminGet(new Request("https://www.shuxteam.com/api/admin/suggestions?email=franappignanesi@gmail.com"))).status, 401);
  assert.equal((await adminPatch(new Request("https://www.shuxteam.com/api/admin/suggestions", {method:"PATCH"}))).status, 401);
});
const preview: SuggestionPreview = { ...parseSuggestionLink("https://store.steampowered.com/app/123/"), title:"Example Game",coverUrl:null,existingGameId:null };
function fake(options: { title?: string; type?: string; windows?: boolean; deals?: boolean } = {}) {
  return async <T>(url: string): Promise<T> => {
    let value: unknown;
    if (url.includes("lookup")) value = { "app/123": "verified-id" };
    else if (url.includes("games/info")) value = { id:"verified-id",title:options.title ?? "Example Game",type:options.type ?? "game",appid:123,releaseDate:"2020-01-01" };
    else if (url.includes("appdetails")) value = { "123": {success:true,data:{name:"Example Game",type:"game",platforms:{windows:options.windows ?? true},genres:[{description:"Action"}],header_image:"https://example.com/cover.jpg"}} };
    else value = [{id:"verified-id",deals:options.deals === false ? [] : [{shop:{id:61},price:{amount:9.99},url:"https://store.steampowered.com/app/123/"}]}];
    return value as T;
  };
}
test("matching requires exact edition, PC base game and current source-store price", async () => {
  const candidate = await matchGameSuggestion(preview, fake());
  assert.equal(candidate.identifiers.itadId, "verified-id");
  assert.equal(candidate.identifiers.steamAppId, 123);
  assert.deepEqual(candidate.expectedStores,["steam"]);
  assert.equal(sameSuggestionEdition("Game", "Game Deluxe"), false);
  await assert.rejects(matchGameSuggestion(preview,fake({title:"Example Game Deluxe"})));
  await assert.rejects(matchGameSuggestion(preview,fake({type:"dlc"})));
  await assert.rejects(matchGameSuggestion(preview,fake({windows:false})));
  await assert.rejects(matchGameSuggestion(preview,fake({deals:false})));
  await assert.rejects(matchGameSuggestion({...preview,title:null},fake()));
  assert.equal(suggestionCandidateConflict(candidate,[{id:"existing",identifiers:{steamAppId:123}}])?.id,"existing");
});
test("queued processing is durable, bounded and acknowledged only after production deploy", async () => {
  const {readFile} = await import("node:fs/promises");
  const worker = await readFile("scripts/process-game-suggestions.ts","utf8");
  assert.ok(worker.includes("searched < 10"));
  assert.ok(worker.includes("--confirm-published"));
  assert.ok(worker.includes("row && Object.values(row.prices).some"));
  const workflow = await readFile(".github/workflows/daily-price-refresh.yml","utf8");
  assert.ok(workflow.indexOf("Process community game suggestions") < workflow.indexOf("Expand curated catalog safely"));
  assert.ok(workflow.indexOf("Confirm community games published") > workflow.indexOf("Deploy refreshed production artifact"));
  const store = await readFile("src/lib/game-suggestion-store.ts","utf8");
  assert.ok(store.includes("FOR UPDATE SKIP LOCKED"));
  assert.ok(store.includes("PRIMARY KEY(suggestion_id,user_sub)"));
  assert.ok(store.includes("status IN ('approved','publishing')"));
});
