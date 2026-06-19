import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGoogleRedirectUri } from '@/lib/calendar';

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
    console.error('[Google Callback] Erro retornado pelo fluxo OAuth:', errorParam);
    return NextResponse.redirect(getSettingsUrl('error'));
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const userId = (session.user as any).id;

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('[Google Callback] Credenciais do Google Calendar não configuradas.');
    return NextResponse.redirect(getSettingsUrl('not_configured'));
  }

  try {
    // 1. Troca o código pelos tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: getGoogleRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Erro ao trocar código por token: ${await tokenResponse.text()}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 2. Busca o e-mail do usuário no Google para identificação visual no CRM
    let email: string | null = null;
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        email = userInfo.email || null;
      }
    } catch (userInfoError) {
      console.warn('[Google Callback] Não foi possível carregar o e-mail do usuário do Google:', userInfoError);
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
        userId_provider: { userId, provider: 'GOOGLE' },
      },
      update: updatePayload,
      create: {
        userId,
        provider: 'GOOGLE',
        accessToken,
        refreshToken,
        expiresAt,
        email,
      },
    });

    console.log(`[Google Callback] Integração Google salva com sucesso para o usuário ${userId}`);
    return NextResponse.redirect(getSettingsUrl('success'));
  } catch (error: any) {
    console.error('[Google Callback] Erro crítico no fluxo de callback:', error);
    const errMsg = error?.message || 'unknown';
    return NextResponse.redirect(getSettingsUrl(`error&message=${encodeURIComponent(errMsg)}`));
  }
}
