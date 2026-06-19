import { prisma } from '@/lib/prisma';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

// Retorna a URL base dinamicamente se o NEXTAUTH_URL não estiver configurado
function getAppBaseUrl() {
  const url = process.env.NEXTAUTH_URL || 'https://crm.nofrontscale.com.br';
  return url.replace(/\/$/, '');
}

export function getGoogleRedirectUri() {
  return `${getAppBaseUrl()}/api/integrations/google/callback`;
}

export function getMicrosoftRedirectUri() {
  return `${getAppBaseUrl()}/api/integrations/microsoft/callback`;
}

/**
 * Atualiza o token de acesso (accessToken) do Google ou Microsoft se estiver expirado
 */
export async function refreshIntegrationTokenIfNeeded(userId: string, provider: 'GOOGLE' | 'MICROSOFT') {
  const integration = await prisma.calendarIntegration.findUnique({
    where: {
      userId_provider: { userId, provider },
    },
  });

  if (!integration) return null;

  // Se expira em mais de 5 minutos, o token ainda é válido
  const now = new Date();
  if (integration.expiresAt && integration.expiresAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    return integration.accessToken;
  }

  // Se não temos refresh token, não há como renovar
  if (!integration.refreshToken) {
    console.warn(`[Calendar] Não há refresh token disponível para o usuário ${userId} (${provider})`);
    return null;
  }

  try {
    if (provider === 'GOOGLE') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('Credenciais do Google Calendar não configuradas no servidor.');
      }

      console.log(`[Calendar] Renovando token do Google para o usuário ${userId}`);
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: integration.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error(`Falha ao renovar token do Google: ${await response.text()}`);
      }

      const data = await response.json();
      const newAccessToken = data.access_token;
      const expiresIn = data.expires_in || 3600;
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

      await prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: newAccessToken,
          expiresAt: newExpiresAt,
        },
      });

      return newAccessToken;
    } else {
      if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        throw new Error('Credenciais do Outlook/Microsoft Calendar não configuradas no servidor.');
      }

      console.log(`[Calendar] Renovando token da Microsoft para o usuário ${userId}`);
      const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          refresh_token: integration.refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
        }),
      });

      if (!response.ok) {
        throw new Error(`Falha ao renovar token da Microsoft: ${await response.text()}`);
      }

      const data = await response.json();
      const newAccessToken = data.access_token;
      const expiresIn = data.expires_in || 3600;
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

      // A Microsoft às vezes retorna um novo refresh token também
      const newRefreshToken = data.refresh_token || integration.refreshToken;

      await prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
        },
      });

      return newAccessToken;
    }
  } catch (error) {
    console.error(`[Calendar] Erro ao renovar o token da integração do usuário ${userId} (${provider}):`, error);
    return null;
  }
}

/**
 * Envia uma requisição HTTP para a API do Google Calendar
 */
async function callGoogleCalendarApi(
  accessToken: string,
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: any
) {
  const url = `https://www.googleapis.com/calendar/v3${endpoint}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Erro na API do Google Calendar (${response.status}): ${await response.text()}`);
  }

  if (method === 'DELETE') return null;
  return await response.json();
}

/**
 * Envia uma requisição HTTP para a API do Microsoft Graph (Outlook)
 */
async function callMicrosoftCalendarApi(
  accessToken: string,
  endpoint: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: any
) {
  const url = `https://graph.microsoft.com/v1.0${endpoint}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Erro na API do Microsoft Graph (${response.status}): ${await response.text()}`);
  }

  if (method === 'DELETE') return null;
  return await response.json();
}

/**
 * Sincroniza uma tarefa com o Google Calendar
 */
export async function syncTaskToGoogleCalendar(
  userId: string,
  task: {
    id: string;
    title: string;
    description: string | null;
    dueDate: Date | null;
    status: string;
    googleEventId: string | null;
  },
  action: 'CREATE' | 'UPDATE' | 'DELETE'
) {
  const token = await refreshIntegrationTokenIfNeeded(userId, 'GOOGLE');
  if (!token) return;

  try {
    // Se for DELETE ou a tarefa não tem data de vencimento (mas possui evento no Google)
    if (action === 'DELETE' || !task.dueDate || task.status === 'COMPLETED') {
      if (task.googleEventId) {
        console.log(`[Google Calendar] Removendo evento ${task.googleEventId} do usuário ${userId}`);
        try {
          await callGoogleCalendarApi(token, `/calendars/primary/events/${task.googleEventId}`, 'DELETE');
        } catch (err) {
          // Se o evento já foi deletado na agenda do usuário manualmente, ignoramos o erro 404
          console.warn(`[Google Calendar] Evento não encontrado na agenda para exclusão.`, err);
        }
        await prisma.task.update({
          where: { id: task.id },
          data: { googleEventId: null },
        });
      }
      return;
    }

    const startDate = task.dueDate;
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hora depois

    const eventPayload = {
      summary: `CRM: ${task.title}`,
      description: task.description || 'Tarefa sincronizada do CRM No Front Scale.',
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
    };

    if (task.googleEventId) {
      console.log(`[Google Calendar] Atualizando evento ${task.googleEventId} do usuário ${userId}`);
      await callGoogleCalendarApi(token, `/calendars/primary/events/${task.googleEventId}`, 'PUT', eventPayload);
    } else {
      console.log(`[Google Calendar] Criando novo evento para a tarefa ${task.id} do usuário ${userId}`);
      const result = await callGoogleCalendarApi(token, '/calendars/primary/events', 'POST', eventPayload);
      if (result && result.id) {
        await prisma.task.update({
          where: { id: task.id },
          data: { googleEventId: result.id },
        });
      }
    }
  } catch (error) {
    console.error(`[Google Calendar] Erro ao sincronizar a tarefa ${task.id}:`, error);
  }
}

/**
 * Sincroniza uma tarefa com o Microsoft Outlook Calendar
 */
export async function syncTaskToMicrosoftCalendar(
  userId: string,
  task: {
    id: string;
    title: string;
    description: string | null;
    dueDate: Date | null;
    status: string;
    microsoftEventId: string | null;
  },
  action: 'CREATE' | 'UPDATE' | 'DELETE'
) {
  const token = await refreshIntegrationTokenIfNeeded(userId, 'MICROSOFT');
  if (!token) return;

  try {
    // Se for DELETE ou a tarefa não tem data de vencimento (mas possui evento na Microsoft)
    if (action === 'DELETE' || !task.dueDate || task.status === 'COMPLETED') {
      if (task.microsoftEventId) {
        console.log(`[Outlook Calendar] Removendo evento ${task.microsoftEventId} do usuário ${userId}`);
        try {
          await callMicrosoftCalendarApi(token, `/me/calendar/events/${task.microsoftEventId}`, 'DELETE');
        } catch (err) {
          console.warn(`[Outlook Calendar] Evento não encontrado no Outlook para exclusão.`, err);
        }
        await prisma.task.update({
          where: { id: task.id },
          data: { microsoftEventId: null },
        });
      }
      return;
    }

    const startDate = task.dueDate;
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hora depois

    const eventPayload = {
      subject: `CRM: ${task.title}`,
      body: {
        contentType: 'HTML',
        content: task.description || 'Tarefa sincronizada do CRM No Front Scale.',
      },
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
    };

    if (task.microsoftEventId) {
      console.log(`[Outlook Calendar] Atualizando evento ${task.microsoftEventId} do usuário ${userId}`);
      await callMicrosoftCalendarApi(token, `/me/calendar/events/${task.microsoftEventId}`, 'PATCH', eventPayload);
    } else {
      console.log(`[Outlook Calendar] Criando novo evento para a tarefa ${task.id} do usuário ${userId}`);
      const result = await callMicrosoftCalendarApi(token, '/me/calendar/events', 'POST', eventPayload);
      if (result && result.id) {
        await prisma.task.update({
          where: { id: task.id },
          data: { microsoftEventId: result.id },
        });
      }
    }
  } catch (error) {
    console.error(`[Outlook Calendar] Erro ao sincronizar a tarefa ${task.id}:`, error);
  }
}

/**
 * Envia gatilho de sincronização para todos os provedores integrados do usuário
 */
export async function syncTaskToAllCalendars(
  userId: string,
  task: {
    id: string;
    title: string;
    description: string | null;
    dueDate: Date | null;
    status: string;
    googleEventId: string | null;
    microsoftEventId: string | null;
  },
  action: 'CREATE' | 'UPDATE' | 'DELETE'
) {
  const integrations = await prisma.calendarIntegration.findMany({
    where: { userId },
  });

  if (integrations.length === 0) return;

  const promises = integrations.map((integration) => {
    if (integration.provider === 'GOOGLE') {
      return syncTaskToGoogleCalendar(userId, task, action);
    } else if (integration.provider === 'MICROSOFT') {
      return syncTaskToMicrosoftCalendar(userId, task, action);
    }
    return Promise.resolve();
  });

  await Promise.all(promises);
}
