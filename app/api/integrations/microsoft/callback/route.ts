import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getMicrosoftRedirectUri } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const projectId = searchParams.get('state') || '';
  const errorParam = searchParams.get('error');

  const getSettingsUrl = (status: string) => {
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
    return `${baseUrl}/project/${projectId}/settings?tab=calendar&status=${status}`;
  };

  if (errorParam || !code) {
    console.error('[Microsoft Callback] Erro retornado pelo fluxo OAuth:', errorParam);
    return NextResponse.redirect(getSettingsUrl('error'));
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const userId = (session.user as any).id;

  const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
  const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    console.error('[Microsoft Callback] Credenciais da Microsoft não configuradas.');
    return NextResponse.redirect(getSettingsUrl('not_configured'));
  }

  try {
    // 1. Troca o código pelos tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        redirect_uri: getMicrosoftRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Erro ao trocar código por token da Microsoft: ${await tokenResponse.text()}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 2. Busca dados do perfil do usuário no Graph API para identificação visual
    let email: string | null = null;
    try {
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        email = profile.mail || profile.userPrincipalName || null;
      }
    } catch (profileError) {
      console.warn('[Microsoft Callback] Não foi possível carregar o perfil do usuário do Outlook:', profileError);
    }

    // 3. Salva ou atualiza a integração no banco de dados
    const updatePayload: any = {
      accessToken,
      expiresAt,
      email,
    };
    if (refreshToken) {
      updatePayload.refreshToken = refreshToken;
    }

    await prisma.calendarIntegration.upsert({
      where: {
        userId_provider: { userId, provider: 'MICROSOFT' },
      },
      update: updatePayload,
      create: {
        userId,
        provider: 'MICROSOFT',
        accessToken,
        refreshToken,
        expiresAt,
        email,
      },
    });

    console.log(`[Microsoft Callback] Integração Microsoft salva com sucesso para o usuário ${userId}`);
    return NextResponse.redirect(getSettingsUrl('success'));
  } catch (error: any) {
    console.error('[Microsoft Callback] Erro crítico no fluxo de callback:', error);
    const errMsg = error?.message || 'unknown';
    return NextResponse.redirect(getSettingsUrl(`error&message=${encodeURIComponent(errMsg)}`));
  }
}
