import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

// Load local env files (both gitignored) so the test can run with `npm test`
// using the same CONVEX_* variables the app reads at runtime. Existing
// process.env values always win (dotenv never overrides).
loadEnv(); // .env
if (existsSync(".env.local")) loadEnv({ path: ".env.local" });

const siteUrl =
  process.env.CONVEX_SITE_URL ||
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  process.env.CONVEX_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  "";
const secret = process.env.CONVEX_INGEST_SECRET || "";
const endpoint = `${siteUrl.replace(/\/$/, "")}/events/bot-message`;

const configured = Boolean(siteUrl && secret);

async function authorized(method: string, body: unknown) {
  return fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

describe(
  "Convex /events/bot-message (integration)",
  {
    skip: !configured
      ? "set CONVEX_SITE_URL (or CONVEX_URL) and CONVEX_INGEST_SECRET to enable"
      : false,
  },
  () => {
    it("rejects requests without a Bearer token (401)", async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(res.status, 401);
    });

    it("rejects requests with an incorrect Bearer token (401)", async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer incorrect-secret",
        },
        body: "{}",
      });
      assert.equal(res.status, 401);
    });

    it("rejects a valid payload with invalid tokens (401) and invalid payload with a valid token (400)", async () => {
      const payload = { externalBotId: "x", externalUserId: "x", phone: "1", role: "user", content: "x" };

      // No clean-up needed: these never write to the DB because auth fails first.
      const noAuth = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(noAuth.status, 401);

      const wrongToken = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer incorrect-secret",
        },
        body: JSON.stringify(payload),
      });
      assert.equal(wrongToken.status, 401);

      // Auth passes, payload is invalid -> 400 (never reaches the DB).
      const badPayload = await authorized("POST", {});
      assert.equal(badPayload.status, 400);
    });

    it("accepts a valid payload and returns 200, then cleans up via DELETE", async () => {
      const externalBotId = `e2e-test-${Date.now()}`;
      const phone = "0000000000";
      const payload = {
        externalBotId,
        externalUserId: externalBotId,
        phone,
        role: "user",
        content: "integration-test-200",
      };

      // Write a real row (the 200 path).
      const res = await authorized("POST", payload);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });

      // Clean up the created row so the production table stays empty.
      const del = await authorized("DELETE", { externalBotId, phone });
      assert.equal(del.status, 200);
      assert.deepEqual(await del.json(), { ok: true });

      // Deleting again is idempotent (no row -> still ok).
      const delAgain = await authorized("DELETE", { externalBotId, phone });
      assert.equal(delAgain.status, 200);
    });
  },
);
