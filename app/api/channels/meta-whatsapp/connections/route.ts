import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/security";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "PROJECT_ID_REQUIRED" }, { status: 400 });
  try {
    await requireProjectAccess(projectId, "PROJECT_ADMIN");
    const rows = await prisma.channelConnection.findMany({ where: { projectId, provider: "META_WHATSAPP" }, orderBy: { createdAt: "desc" }, include: { channelTemplates: { select: { id: true, name: true, language: true, category: true, status: true, lastSyncedAt: true }, orderBy: { name: "asc" } } } });
    return Response.json(rows.map((row) => {
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      const capabilities = row.capabilitiesSnapshot ? JSON.parse(row.capabilitiesSnapshot) : {};
      return {
        id: row.id, name: row.name, status: row.status, isActive: row.isActive,
        wabaIdMasked: row.externalWabaId ? `***${row.externalWabaId.slice(-4)}` : null,
        phoneNumberIdMasked: row.externalPhoneNumberId ? `***${row.externalPhoneNumberId.slice(-4)}` : null,
        displayPhoneMasked: metadata.displayPhoneMasked || null,
        qualityRating: capabilities.qualityRating || null, phoneStatus: capabilities.phoneStatus || null,
        lastHealthAt: row.lastHealthAt, lastErrorCode: row.lastErrorCode, templates: row.channelTemplates,
      };
    }), { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "FORBIDDEN" }, { status: 403 }); }
}
