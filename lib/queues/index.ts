import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { queuePrefix } from "@/lib/env";

export const QUEUE_NAMES = ["provider-events", "outbox-dispatch", "message-dispatch", "dead-letter"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export function createFoundationQueue(name: QueueName) {
  return new Queue(name, { prefix: queuePrefix(), connection: createRedisConnection(), defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100 } });
}

export function isQueueName(value: string): value is QueueName {
  return (QUEUE_NAMES as readonly string[]).includes(value);
}
