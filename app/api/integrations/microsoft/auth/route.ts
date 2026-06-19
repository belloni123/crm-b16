import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMicrosoftRedirectUri } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Parâmetro projectId é obrigatório' }, { status: 400 });
  }

  const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
  if (!MICROSOFT_CLIENT_ID) {
    return NextResponse.json({ error: 'Integração Microsoft não configurada no servidor.' }, { status: 500 });
  }

  const redirectUri = getMicrosoftRedirectUri();
  
  const microsoftAuthUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  microsoftAuthUrl.searchParams.append('client_id', MICROSOFT_CLIENT_ID);
  microsoftAuthUrl.searchParams.append('redirect_uri', redirectUri);
  microsoftAuthUrl.searchParams.append('response_type', 'code');
  microsoftAuthUrl.searchParams.append('scope', 'https://graph.microsoft.com/Calendars.ReadWrite offline_access email openid profile');
  microsoftAuthUrl.searchParams.append('response_mode', 'query');
  microsoftAuthUrl.searchParams.append('state', projectId);

  return NextResponse.redirect(microsoftAuthUrl.toString());
}
