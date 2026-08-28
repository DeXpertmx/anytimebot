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

    it("accepts the correct Bearer token (400 on invalid payload, proving auth passed)", async () => {
      // The handler only reaches body validation after auth succeeds, so an
      // invalid payload returning 400 proves the secret is accepted. We
      // deliberately avoid sending a valid payload here: that would write a
      // row to the production botConversations table.
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: "{}",
      });
      assert.equal(res.status, 400);
    });
  },
);
