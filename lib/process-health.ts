import { createServer } from "node:http";
import type IORedis from "ioredis";
import { prisma } from "@/lib/prisma";

export function startHealthServer(port: number, service: string, redis: IORedis) {
  const server = createServer(async (request, response) => {
    if (request.url !== "/health") { response.writeHead(404).end(); return; }
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
