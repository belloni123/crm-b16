import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/security";

export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  const { connectionId } = await context.params;
  if (!projectId) return Response.json({ error: "PROJECT_ID_REQUIRED" }, { status: 400 });
  try {
    const { user } = await requireProjectAccess(projectId, "PROJECT_ADMIN");
    const connection = await prisma.channelConnection.findFirst({ where: { id: connectionId, projectId, provider: "META_WHATSAPP" } });
    if (!connection) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    await prisma.$transaction([
      prisma.channelConnection.update({ where: { id: connection.id }, data: { isActive: false, status: "DISCONNECTED", archivedAt: new Date(), credentialsEncrypted: null, credentialsKeyId: null, tokenExpiresAt: null } }),
      prisma.auditEvent.create({ data: { projectId, actorUserId: user.id, action: "META_WHATSAPP_DISCONNECTED", resourceType: "ChannelConnection", resourceId: connection.id, reason: "HISTORY_PRESERVED" } }),
    ]);
    return Response.json({ status: "DISCONNECTED", historyPreserved: true });
  } catch { return Response.json({ error: "FORBIDDEN" }, { status: 403 }); }
}
