import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";

export const QUEUE_NAMES = ["provider-events", "outbox-dispatch", "message-dispatch", "dead-letter"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export function createFoundationQueue(name: QueueName) {
  return new Queue(name, { connection: createRedisConnection(), defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100 } });
}
