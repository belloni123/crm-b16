import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOrUpdateDeduplicatedLead } from '@/lib/leads';

// Store global para o rate limiter de IPs dos formulários
const globalRef = globalThis as any;
if (!globalRef.formRateLimitStore) {
  globalRef.formRateLimitStore = new Map<string, number[]>();
}
const rateLimitStore: Map<string, number[]> = globalRef.formRateLimitStore;

// Helper para rate limiting deslizante por IP
function isIpRateLimited(ip: string, limitPerMinute: number = 10): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  
  let requests = rateLimitStore.get(ip) || [];
  requests = requests.filter(timestamp => now - timestamp < windowMs);
  
  if (requests.length >= limitPerMinute) {
    const oldestTimestamp = requests[0];
    const msToWait = windowMs - (now - oldestTimestamp);
    const retryAfter = Math.ceil(msToWait / 1000);
    return {
      allowed: false,
      retryAfter: retryAfter > 0 ? retryAfter : 1
    };
  }
  
  requests.push(now);
  rateLimitStore.set(ip, requests);
  return { allowed: true };
}

// Helper para renderizar uma página HTML de erro estilizada (para posts tradicionais de formulários)
function renderHtmlErrorPage(message: string) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erro no Envio</title>
  <style>
    body {
      background: linear-gradient(145deg, #050505 0%, #09120b 100%);
      color: #EAEAEA;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: rgba(255, 255, 255, 0.01);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-left: 2px solid #ef4444;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      border-radius: 12px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      text-align: center;
    }
    h1 {
      font-size: 20px;
      margin-top: 0;
      color: #ffffff;
    }
    p {
      font-size: 14px;
      color: #888888;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .btn {
      background-color: rgba(255, 255, 255, 0.05);
      color: #EAEAEA;
      border: 1px solid rgba(255, 255, 255, 0.08);
      text-decoration: none;
      font-size: 13px;
      font-weight: bold;
      padding: 10px 20px;
      border-radius: 8px;
      display: inline-block;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 40px; color: #ef4444; margin-bottom: 16px;">⚠</div>
    <h1>Não foi possível processar</h1>
    <p>${message}</p>
    <a href="javascript:history.back()" class="btn">Voltar e Corrigir</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    status: 400
  });
}

// Helper para renderizar uma página HTML de sucesso estilizada (para posts tradicionais de formulários)
function renderHtmlSuccessPage(message: string) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Envio Confirmado</title>
  <style>
    body {
      background: linear-gradient(145deg, #050505 0%, #09120b 100%);
      color: #EAEAEA;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: rgba(255, 255, 255, 0.01);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-left: 2px solid #d4a843;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      border-radius: 12px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      text-align: center;
    }
    h1 {
      font-size: 20px;
      margin-top: 0;
      color: #ffffff;
    }
    p {
      font-size: 14px;
      color: #888888;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .btn {
      background-color: #d4a843;
      color: #1a1a1a;
      text-decoration: none;
      font-size: 13px;
      font-weight: bold;
      padding: 10px 20px;
      border-radius: 8px;
      display: inline-block;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: #e6c273;
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 40px; color: #d4a843; margin-bottom: 16px;">✓</div>
    <h1>Formulário Enviado!</h1>
    <p>${message}</p>
    <a href="javascript:history.back()" class="btn">Voltar</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    status: 200
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // 1. Obter IP do Cliente para Rate Limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
             request.headers.get('x-real-ip')?.trim() || 
             '127.0.0.1';

  const isJson = (request.headers.get('content-type') || '').includes('application/json');

  // 2. Verificar Rate Limiting (Máximo 10 envios por minuto)
  const rateLimit = isIpRateLimited(ip, 10);
  if (!rateLimit.allowed) {
    const errorMsg = `Muitos envios detectados de seu IP. Por favor, aguarde ${rateLimit.retryAfter} segundos antes de tentar novamente.`;
    if (isJson) {
      return NextResponse.json({ error: errorMsg }, { status: 429 });
    }
    return renderHtmlErrorPage(errorMsg);
  }

  // 3. Buscar o formulário correspondente
  const form = await prisma.form.findUnique({
    where: { token },
    include: {
      fields: true
    }
  });

  if (!form || !form.isActive) {
    const errorMsg = 'Formulário inválido, inativo ou inexistente.';
    if (isJson) {
      return NextResponse.json({ error: errorMsg }, { status: 404 });
    }
    return renderHtmlErrorPage(errorMsg);
  }

  // 4. Ler payload do formulário (JSON ou Form Urlencoded)
  let body: Record<string, any> = {};
  try {
    if (isJson) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = value.toString();
      });
    }
  } catch (err) {
    const errorMsg = 'Erro ao ler os dados enviados.';
    if (isJson) {
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }
    return renderHtmlErrorPage(errorMsg);
  }

  // 5. Proteção Contra Spam: Honeypot
  // O robô preencherá o campo oculto. Humanos não o vêem.
  const honeypotVal = body.b16_hp_website;
  if (honeypotVal !== undefined && honeypotVal.trim() !== '') {
    // Descarte silencioso: fingimos que deu tudo certo para confundir o spambot!
    if (isJson) {
      return NextResponse.json({
        success: true,
        message: form.successMessage,
        redirectUrl: form.redirectUrl || null
      });
    }

    if (form.redirectUrl) {
      return NextResponse.redirect(form.redirectUrl, 303);
    }
    return renderHtmlSuccessPage(form.successMessage);
  }

  // 6. Validar Campos Obrigatórios configurados no formulário
  const missingFields: string[] = [];
  for (const field of form.fields) {
    if (field.required) {
      const val = body[field.fieldName];
      if (val === undefined || val === null || val.toString().trim() === '') {
        missingFields.push(field.label);
      }
    }
  }

  if (missingFields.length > 0) {
    const errorMsg = `Preencha os campos obrigatórios: ${missingFields.join(', ')}.`;
    if (isJson) {
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }
    return renderHtmlErrorPage(errorMsg);
  }

  // 7. Mapear campos de sistema e campos customizados
  let leadName = 'Sem Nome';
  let email: string | null = null;
  let phone: string | null = null;
  const customFieldValues: { definitionId: string; value: string }[] = [];

  for (const field of form.fields) {
    const val = body[field.fieldName]?.toString().trim();
    if (field.type === 'SYSTEM') {
      if (field.fieldName === 'name' && val) {
        leadName = val;
      }
      if (field.fieldName === 'email' && val) {
        email = val.toLowerCase();
      }
      if (field.fieldName === 'phone' && val) {
        phone = val.replace(/\D/g, ''); // Remove formatações
        if (phone && !phone.startsWith('55')) {
          phone = '55' + phone;
        }
      }
    } else if (field.type === 'CUSTOM' && field.customFieldDefinitionId && val) {
      customFieldValues.push({
        definitionId: field.customFieldDefinitionId,
        value: val
      });
    }
  }

  try {
    // 8. Chamar o processador de Leads do CRM (Trata deduplicação e comercial round-robin)
    const utmSource = body.utm_source?.toString().trim() || null;
    const utmMedium = body.utm_medium?.toString().trim() || null;
    const utmCampaign = body.utm_campaign?.toString().trim() || null;
    const utmContent = body.utm_content?.toString().trim() || null;
    const utmTerm = body.utm_term?.toString().trim() || null;
    const referrer = body.referrer?.toString().trim() || null;
    const landingPage = body.url?.toString().trim() || null;

    const lead = await createOrUpdateDeduplicatedLead(
      form.projectId,
      {
        name: leadName,
        email,
        phone,
        stageId: form.stageId,
        originId: form.originId,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        referrer,
        landingPage
      },
      null // Sem operador autenticado
    );

    // 9. Atualizar valores dos campos customizados coletados
    for (const cv of customFieldValues) {
      const existingVal = await prisma.customFieldValue.findFirst({
        where: { leadId: lead.id, fieldDefinitionId: cv.definitionId }
      });

      if (existingVal) {
        if (cv.value === '') {
          await prisma.customFieldValue.delete({ where: { id: existingVal.id } });
        } else {
          await prisma.customFieldValue.update({
            where: { id: existingVal.id },
            data: { value: cv.value }
          });
        }
      } else if (cv.value !== '') {
        await prisma.customFieldValue.create({
          data: {
            leadId: lead.id,
            fieldDefinitionId: cv.definitionId,
            value: cv.value
          }
        });
      }
    }

    // 10. Gravar log no histórico de atividades do Lead
    await prisma.activity.create({
      data: {
        leadId: lead.id,
        type: 'LOG',
        content: `Lead cadastrado via formulário embutido: "${form.name}".`
      }
    });

    // 11. Retornar resposta apropriada
    if (isJson) {
      return NextResponse.json({
        success: true,
        leadId: lead.id,
        message: form.successMessage,
        redirectUrl: form.redirectUrl || null
      });
    }

    if (form.redirectUrl) {
      return NextResponse.redirect(form.redirectUrl, 303);
    }
    return renderHtmlSuccessPage(form.successMessage);

  } catch (err: any) {
    console.error('Erro ao processar submissão do formulário público:', err);
    const errorMsg = 'Ocorreu um erro interno ao salvar suas informações. Por favor, tente novamente mais tarde.';
    if (isJson) {
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
    return renderHtmlErrorPage(errorMsg);
  }
}
