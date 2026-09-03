import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import { MetaGraphClient } from "./graph-client";

type Template = { id?: string; name: string; language: string; category?: string; status?: string; components?: unknown[] };

export async function syncMetaTemplates(projectId: string, connectionId: string) {
  const connection = await prisma.channelConnection.findFirst({ where: { id: connectionId, projectId, provider: "META_WHATSAPP", isActive: true } });
  if (!connection?.credentialsEncrypted || !connection.externalWabaId) throw new Error("META_CONNECTION_NOT_READY");
  const { accessToken } = decryptChannelCredentials<{ accessToken: string }>(connection.credentialsEncrypted);
  const graph = new MetaGraphClient(accessToken);
  let path: string | null = `/${encodeURIComponent(connection.externalWabaId)}/message_templates?fields=id,name,language,category,status,components&limit=100`;
  const collected: Template[] = [];
  while (path && collected.length < 1000) {
    const page: { data?: Template[]; paging?: { next?: string } } = await graph.get(path);
    collected.push(...(page.data || []));
    const next = page.paging?.next ? new URL(page.paging.next) : null;
    path = next ? `${next.pathname.replace(/^\/v\d+\.\d+/, "")}${next.search}` : null;
  }
  const syncedAt = new Date();
  for (const template of collected) {
    const componentsJson = JSON.stringify(template.components || []);
    await prisma.channelTemplate.upsert({
      where: { channelConnectionId_name_language: { channelConnectionId: connection.id, name: template.name, language: template.language } },
      create: { projectId, channelConnectionId: connection.id, providerTemplateId: template.id, name: template.name, language: template.language, category: template.category || "UNKNOWN", status: template.status || "UNKNOWN", componentsJson, componentsHash: createHash("sha256").update(componentsJson).digest("hex"), lastSyncedAt: syncedAt },
      update: { providerTemplateId: template.id, category: template.category || "UNKNOWN", status: template.status || "UNKNOWN", componentsJson, componentsHash: createHash("sha256").update(componentsJson).digest("hex"), lastSyncedAt: syncedAt },
    });
  }
  await prisma.$transaction([
    prisma.channelConnection.update({ where: { id: connection.id }, data: { lastHealthAt: syncedAt, lastErrorCode: null } }),
    prisma.auditEvent.create({ data: { projectId, action: "META_TEMPLATES_SYNCED", resourceType: "ChannelConnection", resourceId: connection.id, metadataRedacted: JSON.stringify({ count: collected.length }) } }),
  ]);
  return collected.length;
}
