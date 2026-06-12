process.env.CRM_TEST_MODE = 'true';
process.env.CRM_TEST_USER_ROLE = 'SUPERADMIN';

import { PrismaClient } from '@prisma/client';
import { createForm, updateForm, deleteForm, getForms } from '../app/actions/crm';
import { POST } from '../app/api/forms/submit/[token]/route';
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

async function runTests() {
  console.log('=== INICIANDO TESTES DO CONSTRUTOR DE FORMULÁRIOS ===\n');

  // 1. Obter usuário admin para o mock da sessão
  const dbUser = await prisma.user.findFirst();
  if (!dbUser) {
    throw new Error('Nenhum usuário cadastrado. Rode o seed primeiro.');
  }
  process.env.CRM_TEST_USER_ID = dbUser.id;
  console.log(`[OK] Usuário admin mockado: ${dbUser.email} (ID: ${dbUser.id})`);

  // 2. Obter projeto do banco
  const project = await prisma.project.findFirst({
    include: {
      pipelines: {
        include: {
          stages: { orderBy: { order: 'asc' } }
        }
      },
      customFieldDefinitions: true,
      origins: true
    }
  });

  if (!project || project.pipelines.length === 0) {
    throw new Error('Nenhum projeto ou funil cadastrado. Rode o seed primeiro.');
  }

  const projectId = project.id;
  const targetPipeline = project.pipelines[0];
  const targetStage = targetPipeline.stages[0];
  const targetOrigin = project.origins[0];
  
  console.log(`[OK] Projeto de teste: "${project.name}" (ID: ${projectId})`);
  console.log(`[OK] Kanban de destino: "${targetPipeline.name}" | Estágio: "${targetStage.name}"`);

  let createdFormId = '';
  let formToken = '';

  try {
    // --- Teste A: Criar formulário como SUPERADMIN ---
    console.log('\n--- Teste A: Criar formulário como SUPERADMIN ---');
    const newForm = await createForm(projectId, {
      name: 'Formulário Evento Teste',
      pipelineId: targetPipeline.id,
      stageId: targetStage.id,
      originId: targetOrigin?.id || null,
      successMessage: 'Parabéns! Cadastro efetuado.',
      redirectUrl: '',
      fields: [
        { type: 'SYSTEM', fieldName: 'name', customFieldDefinitionId: null, label: 'Seu Nome', required: true, order: 0 },
        { type: 'SYSTEM', fieldName: 'email', customFieldDefinitionId: null, label: 'Seu E-mail', required: true, order: 1 },
        { type: 'SYSTEM', fieldName: 'phone', customFieldDefinitionId: null, label: 'Seu WhatsApp', required: false, order: 2 }
      ]
    });

    createdFormId = newForm.id;
    formToken = newForm.token;
    console.log(`[OK] Formulário criado com sucesso! ID: ${createdFormId} | Token: ${formToken}`);

    // --- Teste B: Impedir membro comercial (MEMBER) de criar formulários ---
    console.log('\n--- Teste B: Validar bloqueio de criação para cargo MEMBER ---');
    
    // Cria um usuário comercial temporário no banco
    const tempMemberUser = await prisma.user.upsert({
      where: { email: 'comercial_teste@crm.com' },
      update: {},
      create: {
        email: 'comercial_teste@crm.com',
        name: 'Vendedor Teste',
        passwordHash: 'hashed_password'
      }
    });

    // Vincula como MEMBER no projeto
    await prisma.membership.upsert({
      where: { userId_projectId: { userId: tempMemberUser.id, projectId } },
      update: { role: 'MEMBER' },
      create: {
        userId: tempMemberUser.id,
        projectId,
        role: 'MEMBER'
      }
    });

    // Muta as variáveis de ambiente de teste para o MEMBER
    process.env.CRM_TEST_USER_ID = tempMemberUser.id;
    process.env.CRM_TEST_USER_ROLE = 'USER';

    let didThrow = false;
    try {
      await createForm(projectId, {
        name: 'Formulário Proibido',
        pipelineId: targetPipeline.id,
        stageId: targetStage.id,
        fields: [
          { type: 'SYSTEM', fieldName: 'email', customFieldDefinitionId: null, label: 'E-mail', required: true, order: 0 }
        ]
      });
    } catch (err: any) {
      didThrow = true;
      console.log(`[OK] Bloqueio de MEMBER funcionou! Erro capturado: "${err.message}"`);
    }

    if (!didThrow) {
      throw new Error('Falha de Segurança: O cargo MEMBER conseguiu criar um formulário!');
    }

    // Restaura o mock para SUPERADMIN
    process.env.CRM_TEST_USER_ID = dbUser.id;
    process.env.CRM_TEST_USER_ROLE = 'SUPERADMIN';

    // --- Teste C: Submissão normal e criação de lead ---
    console.log('\n--- Teste C: Submissão de Formulário via POST ---');
    const submitPayload = {
      name: 'Cliente Form Teste',
      email: 'clienteform@teste.com',
      phone: '11988887777',
      b16_hp_website: '' // honeypot vazio (humano)
    };

    const request = new NextRequest(`http://localhost:3000/api/forms/submit/${formToken}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '189.10.20.30' // IP fictício
      },
      body: JSON.stringify(submitPayload)
    });

    const response = await POST(request, { params: Promise.resolve({ token: formToken }) });
    console.log(`Status da Resposta: ${response.status}`);
    const resJson = await response.json();
    console.log('JSON retornado:', resJson);

    if (response.status !== 200 || !resJson.success) {
      throw new Error('Submissão do formulário falhou!');
    }

    // Verificar se o lead foi gravado no Postgres
    const savedLead = await prisma.lead.findFirst({
      where: { email: 'clienteform@teste.com', projectId },
      include: {
        pipelineEntries: true,
        activities: true
      }
    });

    if (!savedLead) {
      throw new Error('O lead submetido não foi gravado no banco de dados!');
    }

    console.log(`[OK] Lead gravado no banco. ID: ${savedLead.id} | Nome: ${savedLead.name}`);
    console.log(`[OK] Comercial atribuído (round-robin): ${savedLead.assignedUserId || 'Nenhum'}`);
    console.log(`[OK] Destino no Kanban correto: ${savedLead.pipelineEntries[0]?.stageId === targetStage.id ? 'Sim' : 'Não'}`);
    console.log(`[OK] Log de atividade registrado: "${savedLead.activities[0]?.content}"`);

    // --- Teste D: Honeypot (Bloqueio de Spambots) ---
    console.log('\n--- Teste D: Honeypot (Envio por Robô) ---');
    const botPayload = {
      name: 'Spambot Malicioso',
      email: 'spambot@spam.com',
      phone: '11911112222',
      b16_hp_website: 'http://spambot.com' // preenchido (robô!)
    };

    const botRequest = new NextRequest(`http://localhost:3000/api/forms/submit/${formToken}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '189.10.20.31'
      },
      body: JSON.stringify(botPayload)
    });

    const botResponse = await POST(botRequest, { params: Promise.resolve({ token: formToken }) });
    console.log(`Status do Bot: ${botResponse.status}`);
    const botJson = await botResponse.json();
    console.log('JSON retornado para o Bot:', botJson);

    // Deve retornar sucesso (descarte silencioso)
    if (botResponse.status !== 200 || !botJson.success) {
      throw new Error('Honeypot falhou: Deveria simular sucesso!');
    }

    // Garante que o lead NÃO foi criado no banco
    const spamLead = await prisma.lead.findFirst({
      where: { email: 'spambot@spam.com', projectId }
    });

    if (spamLead) {
      throw new Error('Honeypot falhou: O lead do robô foi gravado no banco!');
    }
    console.log('[OK] Honeypot bloqueou o bot e descartou o lead silenciosamente!');

    // --- Teste E: Rate Limiting ---
    console.log('\n--- Teste E: Rate Limiting por IP (Flood) ---');
    let limitReached = false;
    
    // Enviamos 12 requisições em sequência com o mesmo IP
    for (let i = 0; i < 12; i++) {
      const floodRequest = new NextRequest(`http://localhost:3000/api/forms/submit/${formToken}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.10.15' // IP fixo de flood
        },
        body: JSON.stringify({
          name: `Flood ${i}`,
          email: `flood${i}@teste.com`,
          phone: '11900000000',
          b16_hp_website: ''
        })
      });

      const floodRes = await POST(floodRequest, { params: Promise.resolve({ token: formToken }) });
      if (floodRes.status === 429) {
        limitReached = true;
        console.log(`[OK] Rate Limit ativado na tentativa ${i + 1}! Status: 429`);
        break;
      }
    }

    if (!limitReached) {
      throw new Error('Rate Limiting falhou! Permitiu mais de 10 requisições por minuto do mesmo IP.');
    }

    // --- Teste G: Rastreamento de UTMs e Deduplicação ---
    console.log('\n--- Teste G: Rastreamento de UTMs e Deduplicação ---');
    const utmPayload = {
      name: 'Cliente UTM Teste',
      email: 'clienteutm@teste.com',
      phone: '11977776666',
      b16_hp_website: '',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'blackfriday_2026',
      utm_content: 'ad_group_1',
      utm_term: 'leads_crm',
      referrer: 'https://google.com',
      url: 'https://seusite.com/landing-page'
    };

    const utmRequest = new NextRequest(`http://localhost:3000/api/forms/submit/${formToken}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '189.10.20.40'
      },
      body: JSON.stringify(utmPayload)
    });

    const utmResponse = await POST(utmRequest, { params: Promise.resolve({ token: formToken }) });
    const utmResJson = await utmResponse.json();
    console.log('JSON retornado (UTM):', utmResJson);

    if (utmResponse.status !== 200 || !utmResJson.success) {
      throw new Error('Submissão do formulário com UTMs falhou!');
    }

    // Verificar se o lead foi gravado com as UTMs corretas
    let checkUtmLead = await prisma.lead.findFirst({
      where: { email: 'clienteutm@teste.com', projectId }
    });

    if (!checkUtmLead) {
      throw new Error('Lead do teste de UTM não foi gravado!');
    }

    console.log(`[OK] Lead com UTM criado. Source: ${checkUtmLead.utmSource} | Campaign: ${checkUtmLead.utmCampaign}`);
    if (checkUtmLead.utmSource !== 'google' || checkUtmLead.utmCampaign !== 'blackfriday_2026' || checkUtmLead.referrer !== 'https://google.com') {
      throw new Error('Parâmetros UTM ou metadados de navegação gravados incorretamente!');
    }

    // Agora simular re-entrada (deduplicação) com NOVAS UTMs
    console.log('Simulando nova submissão com diferentes UTMs (Deduplicação)...');
    const newUtmPayload = {
      name: 'Cliente UTM Teste Atualizado',
      email: 'clienteutm@teste.com',
      phone: '11977776666',
      b16_hp_website: '',
      utm_source: 'facebook',
      utm_medium: 'paid',
      utm_campaign: 'natal_2026',
      utm_content: 'stories_ad',
      utm_term: 'software_vendas',
      referrer: 'https://instagram.com',
      url: 'https://seusite.com/promocao-natal'
    };

    const reRequest = new NextRequest(`http://localhost:3000/api/forms/submit/${formToken}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '189.10.20.40'
      },
      body: JSON.stringify(newUtmPayload)
    });

    const reResponse = await POST(reRequest, { params: Promise.resolve({ token: formToken }) });
    const reResJson = await reResponse.json();

    if (reResponse.status !== 200 || !reResJson.success) {
      throw new Error('Re-submissão do formulário falhou!');
    }

    // Recarregar lead do banco
    const checkUtmLeadWithActivities = await prisma.lead.findFirst({
      where: { email: 'clienteutm@teste.com', projectId },
      include: { activities: { orderBy: { createdAt: 'desc' } } }
    });

    if (!checkUtmLeadWithActivities) {
      throw new Error('Lead de UTM sumiu do banco!');
    }

    // Deve MANTER as UTMs originais (Primeiro Toque)
    console.log(`[OK] Lead pós-deduplicação. Source original: ${checkUtmLeadWithActivities.utmSource} | Campaign original: ${checkUtmLeadWithActivities.utmCampaign}`);
    if (checkUtmLeadWithActivities.utmSource !== 'google' || checkUtmLeadWithActivities.utmCampaign !== 'blackfriday_2026') {
      throw new Error('Falha na regra do Primeiro Toque: As UTMs originais foram sobrescritas!');
    }

    // Deve gravar as novas UTMs no histórico de atividades
    const lastActivity = checkUtmLeadWithActivities.activities.find(act => act.content.includes('Lead re-enviou formulário com novos dados de campanha'));
    if (!lastActivity) {
      throw new Error('Nova campanha não foi registrada no histórico de atividades!');
    }
    console.log(`[OK] Nova campanha registrada na timeline de atividades: "${lastActivity.content}"`);

    // --- Teste F: Excluir formulário e cascade ---
    console.log('\n--- Teste F: Deletar Formulário e Cascade ---');
    await deleteForm(projectId, createdFormId);
    
    const checkForm = await prisma.form.findUnique({
      where: { id: createdFormId }
    });
    
    if (checkForm) {
      throw new Error('O formulário não foi deletado!');
    }
    
    const checkFields = await prisma.formField.findMany({
      where: { formId: createdFormId }
    });
    
    if (checkFields.length > 0) {
      throw new Error('Cascade falhou! Os campos do formulário continuam no banco!');
    }
    console.log('[OK] Formulário e campos deletados com sucesso via cascade!');

    // Limpeza de leads gerados no teste
    await prisma.lead.deleteMany({
      where: { email: { in: ['clienteform@teste.com', 'spambot@spam.com', 'clienteutm@teste.com'] } }
    });

    console.log('\n======================================================');
    console.log('🎉 SUCESSO! TODOS OS TESTES DO CONSTRUTOR DE FORMULÁRIOS PASSARAM! 🎉');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n❌ OCORREU UM ERRO NOS TESTES:', err);
    
    // Tenta limpar dados criados
    if (createdFormId) {
      await prisma.form.delete({ where: { id: createdFormId } }).catch(() => {});
    }
    await prisma.lead.deleteMany({
      where: { email: { in: ['clienteform@teste.com', 'spambot@spam.com'] } }
    }).catch(() => {});

    process.exit(1);
  }
}

runTests();
