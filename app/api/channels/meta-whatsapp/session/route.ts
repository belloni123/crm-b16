import { requireProjectAccess } from "@/lib/security";
import { createMetaOnboardingSession } from "@/lib/channels/meta/onboarding";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { projectId } = await request.json() as { projectId?: string };
    if (!projectId) return Response.json({ error: "PROJECT_ID_REQUIRED" }, { status: 400 });
    const { user } = await requireProjectAccess(projectId, "PROJECT_ADMIN");
    if (!process.env.META_APP_ID || !process.env.META_CONFIG_ID) return Response.json({ error: "META_EMBEDDED_SIGNUP_NOT_CONFIGURED" }, { status: 503 });
    return Response.json(await createMetaOnboardingSession(projectId, user.id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "META_SESSION_FAILED";
    return Response.json({ error: code }, { status: code.startsWith("Acesso negado") ? 403 : 400 });
  }
}
