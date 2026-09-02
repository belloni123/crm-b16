import IORedis from "ioredis";
import { requireRedisUrl } from "@/lib/env";

export function redisConnectionOptions() {
  return { url: requireRedisUrl(), maxRetriesPerRequest: null, enableReadyCheck: true };
}

export function createRedisConnection() {
  return new IORedis(requireRedisUrl(), { maxRetriesPerRequest: null, enableReadyCheck: true });
}
