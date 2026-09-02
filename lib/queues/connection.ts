import IORedis from "ioredis";
import { requireRedisUrl } from "@/lib/env";

export function createRedisConnection() {
  return new IORedis(requireRedisUrl(), { maxRetriesPerRequest: null, enableReadyCheck: true });
}
