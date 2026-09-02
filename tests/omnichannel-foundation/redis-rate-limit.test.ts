import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import IORedis from "ioredis";
import { allowWebhookRequest } from "../../lib/channels/webhook-gateway";

test("rate limit Redis é atômico sob concorrência", { skip: !process.env.TEST_REDIS_URL }, async () => {
  process.env.QUEUE_PREFIX = "crm-b16-test";
  const redis = new IORedis(process.env.TEST_REDIS_URL!, { maxRetriesPerRequest: 1 });
  try {
    const identifier = randomUUID();
    const results = await Promise.all(Array.from({ length: 50 }, () => allowWebhookRequest(redis, "meta", "origin", identifier, 20, 10_000)));
    assert.equal(results.filter((result) => result.allowed).length, 20);
    assert.equal(results.filter((result) => result.code === "RATE_LIMITED").length, 30);
  } finally { await redis.quit(); }
});
