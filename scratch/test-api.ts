import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function testApi() {
  console.log('=== INICIANDO TESTE INTEGRADO DA API REST E SEGURANÇA ===\n');

  // 1. Obter os dois projetos criados pelo seed
  const projects = await prisma.project.findMany({
    take: 2,
    include: {
      pipelines: {
        include: {
          stages: { orderBy: { order: 'asc' } }
        }
      }
    }
  });

  if (projects.length < 2) {
    throw new Error('O teste necessita de pelo menos 2 projetos cadastrados. Rode o seed antes.');
  }

  const project1 = projects[0];
  const project2 = projects[1];

  const pipeline1 = project1.pipelines[0];
  if (!pipeline1 || !pipeline1.stages[0]) {
    throw new Error('Nenhum funil ou estágio encontrado no projeto 1.');
  }
  const stageId1 = pipeline1.stages[0].id;

  console.log(`Projeto 1 (Funcional): "${project1.name}" (ID: ${project1.id})`);
  console.log(`Projeto 2 (Rate Limit): "${project2.name}" (ID: ${project2.id})\n`);

  // 2. Gerar chaves de API para os dois projetos
  const mainToken = 'b16_test_main_' + crypto.randomBytes(20).toString('hex');
  const mainPrefix = mainToken.substring(0, 12);
  const mainHash = bcrypt.hashSync(mainToken, bcrypt.genSaltSync(10));

  const limitToken = 'nfs_test_limit_' + crypto.randomBytes(20).toString('hex');
  const limitPrefix = limitToken.substring(0, 12);
  const limitHash = bcrypt.hashSync(limitToken, bcrypt.genSaltSync(10));

  await prisma.project.update({
    where: { id: project1.id },
    data: { apiKeyHash: mainHash, apiKeyPrefix: mainPrefix }
  });

  await prisma.project.update({
    where: { id: project2.id },
    data: { apiKeyHash: limitHash, apiKeyPrefix: limitPrefix }
  });

  console.log(`Chave Principal (Proj 1): ${mainToken}`);
  console.log(`Chave de Limite (Proj 2): ${limitToken}\n`);

  try {
    // --- Teste A: Requisição sem Token ---
    console.log('--- Teste A: Requisição sem token (Esperado: 401) ---');
    const resNoToken = await fetch(`${BASE_URL}/api/v1/pipelines`);
    console.log(`Status: ${resNoToken.status}`);
    const bodyNoToken = await resNoToken.json();
    console.log(`Response:`, bodyNoToken);
    if (resNoToken.status !== 401) {
      throw new Error('Falha no Teste A: Deveria ter retornado status 401.');
    }

    // --- Teste B: Requisição com Token Inválido ---
    console.log('\n--- Teste B: Requisição com token inválido (Esperado: 401) ---');
    const resBadToken = await fetch(`${BASE_URL}/api/v1/pipelines`, {
      headers: { 'Authorization': 'Bearer b16_token_falso_12345' }
    });
    console.log(`Status: ${resBadToken.status}`);
    const bodyBadToken = await resBadToken.json();
    console.log(`Response:`, bodyBadToken);
    if (resBadToken.status !== 401) {
      throw new Error('Falha no Teste B: Deveria ter retornado status 401.');
    }

    // --- Teste C: Listar Pipelines (Autenticação Válida) ---
    console.log('\n--- Teste C: Listar Pipelines (Esperado: 200) ---');
    const resPipelines = await fetch(`${BASE_URL}/api/v1/pipelines`, {
      headers: { 'Authorization': `Bearer ${mainToken}` }
    });
    console.log(`Status: ${resPipelines.status}`);
    const bodyPipelines = await resPipelines.json();
    console.log(`Pipelines encontrados: ${bodyPipelines.pipelines?.length || 0}`);
    if (resPipelines.status !== 200 || !bodyPipelines.pipelines) {
      throw new Error('Falha no Teste C: Não listou os funis.');
    }

    // --- Teste D: Criar Lead via API ---
    console.log('\n--- Teste D: Criar Lead via POST /api/v1/leads (Esperado: 200) ---');
    const resCreateLead = await fetch(`${BASE_URL}/api/v1/leads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mainToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Lead Integrado Via API',
        email: 'api_lead@test.com',
        phone: '11999998888',
        company: 'API Corp',
        value: 50000,
        priority: 'ALTA',
        stageId: stageId1
      })
    });
    console.log(`Status: ${resCreateLead.status}`);
    const bodyCreateLead = await resCreateLead.json();
    console.log('Response:', bodyCreateLead);
    if (resCreateLead.status !== 200 || !bodyCreateLead.leadId) {
      throw new Error('Falha no Teste D: Lead não foi criado.');
    }
    const createdLeadId = bodyCreateLead.leadId;

    // --- Teste E: Detalhar Lead ---
    console.log('\n--- Teste E: Detalhar Lead via GET /api/v1/leads/[id] (Esperado: 200) ---');
    const resGetLead = await fetch(`${BASE_URL}/api/v1/leads/${createdLeadId}`, {
      headers: { 'Authorization': `Bearer ${mainToken}` }
    });
    console.log(`Status: ${resGetLead.status}`);
    const bodyGetLead = await resGetLead.json();
    console.log(`Lead Nome: ${bodyGetLead.lead?.name}`);
    console.log(`Lead Comercial Atribuído (ID): ${bodyGetLead.lead?.assignedUserId || 'Nenhum'}`);
    if (resGetLead.status !== 200 || bodyGetLead.lead?.id !== createdLeadId) {
      throw new Error('Falha no Teste E: Lead não encontrado ou incorreto.');
    }

    // --- Teste F: Atualizar Lead ---
    console.log('\n--- Teste F: Atualizar Lead via PATCH /api/v1/leads/[id] (Esperado: 200) ---');
    const resUpdateLead = await fetch(`${BASE_URL}/api/v1/leads/${createdLeadId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${mainToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Lead Integrado Via API Modificado',
        priority: 'MEDIA'
      })
    });
    console.log(`Status: ${resUpdateLead.status}`);
    const bodyUpdateLead = await resUpdateLead.json();
    console.log(`Nome atualizado no retorno: ${bodyUpdateLead.lead?.name}`);
    if (resUpdateLead.status !== 200 || bodyUpdateLead.lead?.name !== 'Lead Integrado Via API Modificado') {
      throw new Error('Falha no Teste F: Lead não foi atualizado.');
    }

    // --- Teste G: Criar Tarefa ---
    console.log('\n--- Teste G: Criar Tarefa via POST /api/v1/tasks (Esperado: 200) ---');
    const resCreateTask = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mainToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leadId: createdLeadId,
        title: 'Tarefa criada por agente externo',
        description: 'Ligar para alinhar integrações e CRM',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
    });
    console.log(`Status: ${resCreateTask.status}`);
    const bodyCreateTask = await resCreateTask.json();
    console.log('Tarefa criada:', bodyCreateTask.task?.title);
    if (resCreateTask.status !== 200 || !bodyCreateTask.task) {
      throw new Error('Falha no Teste G: Tarefa não foi criada.');
    }

    // --- Teste H: Rate Limiting (Usando a chave de limite dedicada) ---
    console.log('\n--- Teste H: Rate Limiting (Esperado: 429) ---');
    console.log('Disparando 65 requisições rápidas usando a segunda chave para estourar o limite de 60 req/min...');
    
    let rateLimited = false;
    let successCount = 0;
    
    for (let i = 1; i <= 65; i++) {
      const res = await fetch(`${BASE_URL}/api/v1/pipelines`, {
        headers: { 'Authorization': `Bearer ${limitToken}` }
      });
      if (res.status === 200) {
        successCount++;
      } else if (res.status === 429) {
        rateLimited = true;
        console.log(`[BLOQUEADO] Requisição #${i} bloqueada com status 429. Retry-After: ${res.headers.get('Retry-After')} segundos.`);
        break;
      } else {
        throw new Error(`Falha no Teste H: Retorno inesperado status ${res.status}`);
      }
    }
    
    console.log(`Requisições permitidas antes do bloqueio da chave 2: ${successCount}`);
    if (!rateLimited) {
      throw new Error('Falha no Teste H: O Rate Limiter não bloqueou as requisições (não retornou 429).');
    } else {
      console.log('Rate Limiter FUNCIONANDO de forma protetiva! (OK)');
    }

    // --- Teste I: Soft Delete do Lead (Usando chave principal intacta) ---
    console.log('\n--- Teste I: Soft Delete via DELETE /api/v1/leads/[id] (Esperado: 200) ---');
    const resDelete = await fetch(`${BASE_URL}/api/v1/leads/${createdLeadId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${mainToken}` }
    });
    console.log(`Status: ${resDelete.status}`);
    const bodyDelete = await resDelete.json();
    console.log('Response:', bodyDelete);
    if (resDelete.status !== 200) {
      throw new Error('Falha no Teste I: DELETE falhou.');
    }

    // --- Validação no Banco (Soft Delete) ---
    console.log('\n--- Validação no Banco de Dados (Certificando Soft-Delete) ---');
    // Verifica se a participação (PipelineEntry) está ARCHIVED
    const entries = await prisma.pipelineEntry.findMany({
      where: { leadId: createdLeadId }
    });
    console.log(`Quantidade de participações: ${entries.length}`);
    entries.forEach(e => {
      console.log(`Participação ID: ${e.id} | Status: ${e.status} (Esperado: ARCHIVED)`);
      if (e.status !== 'ARCHIVED') {
        throw new Error('Falha na validação do banco: PipelineEntry não foi arquivado.');
      }
    });

    // Verifica se o lead continua existindo no banco (não foi apagado fisicamente)
    const dbLead = await prisma.lead.findUnique({ where: { id: createdLeadId } });
    console.log(`Registro do Lead na tabela Lead existe? ${dbLead ? 'Sim (Correto, soft-delete preserva a pessoa)' : 'Não (Erro, lead deletado fisicamente!)'}`);
    if (!dbLead) {
      throw new Error('Falha na validação do banco: O registro do Lead foi apagado fisicamente.');
    }

    // Limpeza final do lead de teste
    console.log('\nLimpando registros de teste do banco de dados...');
    await prisma.task.deleteMany({ where: { leadId: createdLeadId } });
    await prisma.activity.deleteMany({ where: { leadId: createdLeadId } });
    await prisma.pipelineEntry.deleteMany({ where: { leadId: createdLeadId } });
    await prisma.lead.delete({ where: { id: createdLeadId } });

  } catch (err: any) {
    console.error('\n❌ ERRO DURANTE OS TESTES DE API:', err.message);
    process.exit(1);
  } finally {
    // Restaurar os projetos removendo chaves de API
    await prisma.project.update({
      where: { id: project1.id },
      data: { apiKeyHash: null, apiKeyPrefix: null }
    });
    await prisma.project.update({
      where: { id: project2.id },
      data: { apiKeyHash: null, apiKeyPrefix: null }
    });
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log('🎉 PARABÉNS! TODOS OS TESTES DE API E SEGURANÇA PASSARAM COM SUCESSO! 🎉');
  console.log('================================================================');
}

testApi();
