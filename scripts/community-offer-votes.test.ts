import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { GET, PUT } from "../src/app/api/user/offer-votes/route";
import { NextResponse } from "next/server";
import { setSessionCookie } from "../src/lib/auth-session";

test("community votes require a server session, ignoring supplied identity", async () => {
  const response = await GET(new Request("https://www.shuxteam.com/api/user/offer-votes?userId=someone-else"));
  assert.equal(response.status, 401);
  const mutation = await PUT(new Request("https://www.shuxteam.com/api/user/offer-votes", { method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "https://www.shuxteam.com" },
    body: JSON.stringify({ userId: "someone-else", gameId: "test", voted: true, region: "AR" }) }));
  assert.equal(mutation.status, 401);
});

test("vote mutations reject foreign origins and malformed bodies before storage", async () => {
  const prior = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "community-votes-test-secret-not-for-production";
  try {
    const session = NextResponse.json({});
    setSessionCookie(session, { sub: "synthetic-test-user", email: "test@example.invalid", name: "Test" });
    const cookie = session.headers.get("set-cookie")!.split(";")[0];
    const foreign = await PUT(new Request("https://www.shuxteam.com/api/user/offer-votes", { method: "PUT",
      headers: { cookie, Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: "{}" }));
    assert.equal(foreign.status, 403);
    const oversized = await PUT(new Request("https://www.shuxteam.com/api/user/offer-votes", { method: "PUT",
      headers: { cookie, Origin: "https://www.shuxteam.com", "Content-Type": "application/json" }, body: JSON.stringify({ extra: "x".repeat(5000) }) }));
    assert.equal(oversized.status, 400);
    const malformed = await PUT(new Request("https://www.shuxteam.com/api/user/offer-votes", { method: "PUT",
      headers: { cookie, Origin: "https://www.shuxteam.com", "Content-Type": "application/json" }, body: JSON.stringify({ gameId: "../unsafe", voted: true, region: "AR" }) }));
    assert.equal(malformed.status, 400);
  } finally {
    if (prior === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = prior;
  }
});

test("Postgres enforces five votes under concurrency and allows reassignment", { skip: process.env.COMMUNITY_VOTES_DB_TEST !== "1" }, async () => {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());
  const { neon } = await import("@neondatabase/serverless");
  const { getOfferVotes, setOfferVote } = await import("../src/lib/community-offer-store");
  const campaign = `test-${randomUUID()}`;
  const user = `test-${randomUUID()}`;
  const client = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL!);
  try {
    await Promise.all(Array.from({ length: 12 }, (_, index) => setOfferVote(user, `game-${index}`, true, campaign)));
    const votes = await getOfferVotes(user, campaign);
    assert.equal(votes.length, 5);
    assert.equal(new Set(votes).size, 5);
    await Promise.all(Array.from({ length: 5 }, () => setOfferVote(user, votes[0], true, campaign)));
    assert.equal((await getOfferVotes(user, campaign)).length, 5);
    const full = await setOfferVote(user, "extra-game", true, campaign);
    assert.equal(full.includes("extra-game"), false);
    await setOfferVote(user, votes[0], false, campaign);
    const reassigned = await setOfferVote(user, "extra-game", true, campaign);
    assert.equal(reassigned.length, 5);
    assert.equal(reassigned.includes("extra-game"), true);
    assert.equal(reassigned.includes(votes[0]), false);
    assert.deepEqual(await getOfferVotes(`${user}-other`, campaign), []);
  } finally {
    await client.query("DELETE FROM community_offer_votes WHERE campaign=$1", [campaign]);
  }
});
