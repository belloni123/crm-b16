import { requireProjectAccess } from "@/lib/security";
import { completeMetaOnboarding } from "@/lib/channels/meta/onboarding";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string>;
    for (const key of ["projectId", "sessionId", "state", "nonce", "code", "wabaId", "phoneNumberId"]) if (!body[key]) return Response.json({ error: `MISSING_${key.toUpperCase()}` }, { status: 400 });
    const { user } = await requireProjectAccess(body.projectId, "PROJECT_ADMIN");
    const connectionId = await completeMetaOnboarding({ projectId: body.projectId, userId: user.id, sessionId: body.sessionId, state: body.state, nonce: body.nonce, code: body.code, wabaId: body.wabaId, phoneNumberId: body.phoneNumberId });
    return Response.json({ status: "CONNECTED", connectionId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "META_ONBOARDING_FAILED";
    return Response.json({ error: code }, { status: code.startsWith("Acesso negado") ? 403 : 400 });
  }
}
