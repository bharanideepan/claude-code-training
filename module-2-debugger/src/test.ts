// Simple test script to reveal the 3 bugs
// Run: npm test (after starting server with npm run dev)

import { getDb } from "./db";

const BASE = "http://localhost:3456";
const TEST_EMAIL = "test@example.com";

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
  } catch (error: any) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${error.message}`);
  }
}

async function run() {
  console.log("\n--- Debug Detective Test Suite ---\n");

  // Cleanup: remove test user from previous runs so tests are idempotent
  getDb().prepare("DELETE FROM users WHERE email = ?").run(TEST_EMAIL);

  // -----------------------------------------------------------------------
  // Bug #1 — email was hardcoded as `undefined` instead of forwarded from req.body
  // -----------------------------------------------------------------------

  let createdUserId: number | null = null;

  await test("POST /api/users should create a user", async () => {
    const res = await fetch(`${BASE}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test User", email: TEST_EMAIL }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(`Status ${res.status}: ${body.error}`);
    }
    const user = await res.json();
    if (!user.id) throw new Error("User missing id");
    if (user.email !== TEST_EMAIL)
      throw new Error(`Expected email ${TEST_EMAIL}, got ${user.email} — email not forwarded to createUser`);
    createdUserId = user.id;
  });

  // Regression: if undefined is passed again, the INSERT fails with NOT NULL —
  // this second call with the same email would also catch it via UNIQUE constraint.
  await test("POST /api/users regression — email field must survive round-trip", async () => {
    getDb().prepare("DELETE FROM users WHERE email = ?").run("regression@example.com");
    const res = await fetch(`${BASE}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Regression User", email: "regression@example.com" }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(`Status ${res.status}: ${body.error}`);
    }
    const user = await res.json();
    if (user.email !== "regression@example.com")
      throw new Error(`email not persisted — got ${user.email}`);
  });

  // -----------------------------------------------------------------------
  // Bug #2 — COUNT(*) was missing WHERE authorId = ?, returning total post count
  // -----------------------------------------------------------------------

  await test("GET /api/users/1/stats should show correct post count", async () => {
    const res = await fetch(`${BASE}/api/users/1/stats`);
    const stats = await res.json();
    // Alice has 40 of the 200 seeded posts (200 / 5 users)
    if (stats.postCount !== 40)
      throw new Error(`Expected 40 posts for user 1, got ${stats.postCount} (seems like total count?)`);
  });

  // Regression: newly created user has 0 posts — if WHERE clause is missing,
  // this returns the total (200+) instead of 0, catching the regression.
  await test("GET /api/users/:id/stats regression — count must be scoped to that user", async () => {
    if (!createdUserId) throw new Error("Skipped — user creation failed");
    const res = await fetch(`${BASE}/api/users/${createdUserId}/stats`);
    const stats = await res.json();
    if (stats.postCount !== 0)
      throw new Error(
        `New user should have 0 posts, got ${stats.postCount} — WHERE authorId = ? clause missing`
      );
  });

  // -----------------------------------------------------------------------
  // Bug #3 — N+1: one SELECT per post instead of a single JOIN
  // -----------------------------------------------------------------------

  await test("GET /api/posts/feed should use efficient queries", async () => {
    const res = await fetch(`${BASE}/api/posts/feed`);
    const data = await res.json();
    if (!data.meta.queryCount)
      throw new Error(
        `No queryCount in response — add query counting to detect N+1 (${data.meta.count} posts likely = ${data.meta.count + 1} queries)`
      );
    if (data.meta.queryCount > 2)
      throw new Error(
        `Used ${data.meta.queryCount} queries for ${data.meta.count} posts (N+1 detected — use a JOIN)`
      );
  });

  // Regression: each post must carry author data — if the JOIN is removed,
  // posts either lose the author field entirely or it becomes null.
  await test("GET /api/posts/feed regression — every post must include author data", async () => {
    const res = await fetch(`${BASE}/api/posts/feed`);
    const { posts } = await res.json();
    if (!posts || posts.length === 0) throw new Error("No posts returned");
    const missing = posts.filter((p: any) => !p.author || !p.author.id || !p.author.name);
    if (missing.length > 0)
      throw new Error(
        `${missing.length} post(s) missing author data — JOIN may have been removed`
      );
  });

  console.log("\n--- Done ---\n");
}

run().catch(console.error);
