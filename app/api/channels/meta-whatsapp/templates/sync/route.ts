import { requireProjectAccess } from "@/lib/security";
import { syncMetaTemplates } from "@/lib/channels/meta/templates";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { projectId, connectionId } = await request.json() as { projectId?: string; connectionId?: string };
    if (!projectId || !connectionId) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    await requireProjectAccess(projectId, "PROJECT_ADMIN");
    return Response.json({ status: "SYNCED", count: await syncMetaTemplates(projectId, connectionId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "META_TEMPLATE_SYNC_FAILED" }, { status: 400 });
  }
}
