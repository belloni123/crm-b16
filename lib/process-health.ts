import { createServer } from "node:http";
import type IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { queuePrefix } from "@/lib/env";

export function serviceHeartbeatKey(service: "worker" | "scheduler") {
  return `${queuePrefix()}:health:${service}`;
}

export function startServiceHeartbeat(service: "worker" | "scheduler", redis: IORedis, intervalMs = 5000) {
  const beat = async () => redis.set(serviceHeartbeatKey(service), String(Date.now()), "PX", intervalMs * 3);
  void beat();
  const timer = setInterval(() => void beat(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export function startHealthServer(port: number, service: string, redis: IORedis) {
  const server = createServer(async (request, response) => {
    if (request.url === "/live") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "alive", service }));
      return;
    }
    if (request.url !== "/health" && request.url !== "/ready") { response.writeHead(404).end(); return; }
    try {
      await Promise.all([redis.ping(), prisma.$queryRaw`SELECT 1`]);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", service }));
    } catch {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "unavailable", service }));
    }
  });
  server.listen(port, "0.0.0.0");
  return server;
}
