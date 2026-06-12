const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed do banco de dados (com melhorias do adendo)...');

  // 1. Limpar dados existentes (em ordem reversa de chaves estrangeiras)
  await prisma.customFieldValue.deleteMany({});
  await prisma.customFieldDefinition.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.whatsAppInstance.deleteMany({});
  await prisma.webhookLog.deleteMany({});
  await prisma.webhookEndpoint.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.tag.deleteMany({});
  await prisma.stage.deleteMany({});
  await prisma.pipeline.deleteMany({});
  await prisma.lostStatus.deleteMany({});
  await prisma.origin.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Tabelas limpas com sucesso.');

  // 2. Criar Usuários
  const passwordHash = await bcrypt.hash('admin123', 10);
  const superadmin = await prisma.user.create({
    data: {
      name: 'Felipe Belloni',
      email: 'admin@crmb16.com.br',
      passwordHash,
      role: 'SUPERADMIN',
    },
  });

  const rootPasswordHash = await bcrypt.hash('Fkbs1990@134821', 10);
  const rootUser = await prisma.user.create({
    data: {
      name: 'Felipe Agência B16',
      email: 'felipe@agenciab16.com.br',
      passwordHash: rootPasswordHash,
      role: 'SUPERADMIN',
    },
  });

  const memberPasswordHash = await bcrypt.hash('membro123', 10);
  const memberUser = await prisma.user.create({
    data: {
      name: 'Consultor CRM B16',
      email: 'membro@crmb16.com.br',
      passwordHash: memberPasswordHash,
      role: 'USER',
    },
  });

  console.log(`Usuários criados:
  - Superadmin: ${superadmin.email} (senha: admin123)
  - Root Principal: ${rootUser.email} (senha: Fkbs1990@134821)
  - Membro: ${memberUser.email} (senha: membro123)`);

  // 3. Criar Projetos
  const project1 = await prisma.project.create({
    data: {
      name: 'Cliente Alpha - Escala Comercial',
      description: 'Projeto de escala comercial focado em aquisição outbound e inbound.',
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Cliente Beta - Escala High Ticket',
      description: 'Projeto voltado para estruturação de funil e vendas High Ticket.',
    },
  });

  console.log(`Projetos criados:
  - ${project1.name} (ID: ${project1.id})
  - ${project2.name} (ID: ${project2.id})`);

  // 4. Criar Vinculações (Memberships)
  await prisma.membership.createMany({
    data: [
      { userId: superadmin.id, projectId: project1.id, role: 'PROJECT_ADMIN' },
      { userId: superadmin.id, projectId: project2.id, role: 'PROJECT_ADMIN' },
      { userId: rootUser.id, projectId: project1.id, role: 'PROJECT_ADMIN' },
      { userId: rootUser.id, projectId: project2.id, role: 'PROJECT_ADMIN' },
      { userId: memberUser.id, projectId: project1.id, role: 'MEMBER' },
    ],
  });

  console.log('Vinculações de projetos (Memberships) criadas.');

  // 5. Criar Origens (Origins)
  // Projeto 1
  const originWp1 = await prisma.origin.create({ data: { name: 'Formulário WordPress', projectId: project1.id } });
  const originInsta1 = await prisma.origin.create({ data: { name: 'Instagram DM', projectId: project1.id } });
  const originInd1 = await prisma.origin.create({ data: { name: 'Indicação Direta', projectId: project1.id } });
  
  // Projeto 2
  const originTrafego2 = await prisma.origin.create({ data: { name: 'Tráfego Pago (Ads)', projectId: project2.id } });
  const originKiwify2 = await prisma.origin.create({ data: { name: 'Kiwify Integrador', projectId: project2.id } });

  console.log('Origens de Leads criadas.');

  // 6. Criar Motivos de Perda (LostStatus)
  // Projeto 1
  const lostPreco1 = await prisma.lostStatus.create({ data: { reason: 'Preço Alto', projectId: project1.id } });
  const lostSemResposta1 = await prisma.lostStatus.create({ data: { reason: 'Sem resposta/Contato', projectId: project1.id } });
  const lostSemPerfil1 = await prisma.lostStatus.create({ data: { reason: 'Fora do Perfil (ICP)', projectId: project1.id } });

  // Projeto 2
  const lostInteresse2 = await prisma.lostStatus.create({ data: { reason: 'Sem interesse no momento', projectId: project2.id } });
  const lostConcorrente2 = await prisma.lostStatus.create({ data: { reason: 'Comprou do concorrente', projectId: project2.id } });

  console.log('Motivos de perda criados.');

  // 7. Criar Campos Personalizados (CustomFieldDefinition)
  // Projeto 1
  const fieldFatP1 = await prisma.customFieldDefinition.create({
    data: { name: 'Faturamento Mensal', type: 'NUMBER', entityType: 'LEAD', projectId: project1.id }
  });
  const fieldSegP1 = await prisma.customFieldDefinition.create({
    data: { name: 'Segmento de Atuação', type: 'TEXT', entityType: 'LEAD', projectId: project1.id }
  });

  // Projeto 2
  const fieldSociosP2 = await prisma.customFieldDefinition.create({
    data: { name: 'Número de Sócios', type: 'NUMBER', entityType: 'LEAD', projectId: project2.id }
  });

  console.log('Definições de campos personalizados criadas.');

  // 8. Criar Tags para os Projetos
  const tagMesaCertaP1 = await prisma.tag.create({
    data: { name: 'Decisor', color: '#6D8A6C', projectId: project1.id },
  });
  const tagProximidadeP1 = await prisma.tag.create({
    data: { name: 'ICP Ideal', color: '#abfe37', projectId: project1.id },
  });
  const tagHotP1 = await prisma.tag.create({
    data: { name: 'Lead Quente', color: '#ff4444', projectId: project1.id },
  });

  const tagRoiP2 = await prisma.tag.create({
    data: { name: 'High Ticket', color: '#6D8A6C', projectId: project2.id },
  });
  const tagEnterpriseP2 = await prisma.tag.create({
    data: { name: 'Enterprise', color: '#abfe37', projectId: project2.id },
  });

  console.log('Tags criadas.');

  // 9. Criar Funil de Vendas (Pipeline) e Estágios (Stages)
  // Projeto 1 Pipeline
  const pipelineP1 = await prisma.pipeline.create({
    data: {
      name: 'Funil Comercial Padrão',
      projectId: project1.id,
    },
  });

  const stagesP1 = await Promise.all([
    prisma.stage.create({ data: { name: 'Sem Contato', order: 0, color: '#888888', pipelineId: pipelineP1.id } }),
    prisma.stage.create({ data: { name: 'Qualificação', order: 1, color: '#3b82f6', pipelineId: pipelineP1.id } }),
    prisma.stage.create({ data: { name: 'Reunião Agendada', order: 2, color: '#f59e0b', pipelineId: pipelineP1.id } }),
    prisma.stage.create({ data: { name: 'Proposta Enviada', order: 3, color: '#8b5cf6', pipelineId: pipelineP1.id } }),
    prisma.stage.create({ data: { name: 'Fechado (Ganho)', order: 4, color: '#10b981', pipelineId: pipelineP1.id } }),
    prisma.stage.create({ data: { name: 'Perdido', order: 5, color: '#ef4444', pipelineId: pipelineP1.id } }),
  ]);

  // Projeto 2 Pipeline
  const pipelineP2 = await prisma.pipeline.create({
    data: {
      name: 'Funil de Upsell / High Ticket',
      projectId: project2.id,
    },
  });

  const stagesP2 = await Promise.all([
    prisma.stage.create({ data: { name: 'Novo Lead', order: 0, color: '#888888', pipelineId: pipelineP2.id } }),
    prisma.stage.create({ data: { name: 'Diagnóstico', order: 1, color: '#3b82f6', pipelineId: pipelineP2.id } }),
    prisma.stage.create({ data: { name: 'Apresentação', order: 2, color: '#f59e0b', pipelineId: pipelineP2.id } }),
    prisma.stage.create({ data: { name: 'Fechado', order: 3, color: '#10b981', pipelineId: pipelineP2.id } }),
  ]);

  console.log('Pipelines e Estágios criados.');

  // 10. Criar Leads (as Pessoas)
  // Leads do Projeto 1
  const lead1P1 = await prisma.lead.create({
    data: {
      name: 'Roberto Viana',
      email: 'roberto@vianacorp.com.br',
      phone: '11999991111',
      company: 'Viana Indústria S/A',
      priority: 'ALTA',
      projectId: project1.id,
      originId: originWp1.id, // Veio do WordPress
      tags: { connect: [{ id: tagHotP1.id }, { id: tagMesaCertaP1.id }] },
    },
  });

  const lead2P1 = await prisma.lead.create({
    data: {
      name: 'Fernanda Lima',
      email: 'fernanda@limafintech.co',
      phone: '21988882222',
      company: 'Lima Fintech',
      priority: 'ALTA',
      projectId: project1.id,
      originId: originInd1.id, // Indicação
      tags: { connect: [{ id: tagProximidadeP1.id }, { id: tagHotP1.id }] },
    },
  });

  const lead3P1 = await prisma.lead.create({
    data: {
      name: 'Carlos Oliveira',
      email: 'carlos@oliveiraconsultoria.com',
      phone: '31977773333',
      company: 'Oliveira Consultoria',
      priority: 'MEDIA',
      projectId: project1.id,
      originId: originInsta1.id, // Instagram
      tags: { connect: [{ id: tagMesaCertaP1.id }] },
    },
  });

  const lead4P1 = await prisma.lead.create({
    data: {
      name: 'Ana Júlia',
      email: 'ana@juliadesign.net',
      phone: '11966664444',
      company: 'AJ Design Studio',
      priority: 'BAIXA',
      projectId: project1.id,
      originId: originWp1.id,
      tags: { connect: [{ id: tagProximidadeP1.id }] },
    },
  });

  // Criar um lead no estado perdido
  const lead5LostP1 = await prisma.lead.create({
    data: {
      name: 'Maurício Souza',
      email: 'mauricio@souzatech.com',
      phone: '11911112222',
      company: 'Souza Tech',
      priority: 'MEDIA',
      projectId: project1.id,
      originId: originInsta1.id,
    },
  });

  // Outro lead perdido por falta de resposta
  const lead6LostP1 = await prisma.lead.create({
    data: {
      name: 'Julia Ramos',
      email: 'julia@ramosnegocios.com',
      phone: '11922223333',
      company: 'Ramos Negócios',
      priority: 'BAIXA',
      projectId: project1.id,
      originId: originWp1.id,
    },
  });

  // Leads do Projeto 2
  const lead1P2 = await prisma.lead.create({
    data: {
      name: 'Eduardo Santos',
      email: 'eduardo@santosholding.com',
      phone: '11955555555',
      company: 'Santos Holding',
      priority: 'ALTA',
      projectId: project2.id,
      originId: originTrafego2.id,
      tags: { connect: [{ id: tagRoiP2.id }, { id: tagEnterpriseP2.id }] },
    },
  });

  const lead2P2 = await prisma.lead.create({
    data: {
      name: 'Beatriz Costa',
      email: 'beatriz@costaadvocacia.com',
      phone: '21944444444',
      company: 'Costa & Associados',
      priority: 'MEDIA',
      projectId: project2.id,
      originId: originKiwify2.id,
      tags: { connect: [{ id: tagRoiP2.id }] },
    },
  });

  // Criar as participações (PipelineEntry) correspondentes para cada lead
  await prisma.pipelineEntry.createMany({
    data: [
      {
        leadId: lead1P1.id,
        pipelineId: pipelineP1.id,
        stageId: stagesP1[0].id, // Sem Contato
        value: 45000,
        status: 'ACTIVE',
      },
      {
        leadId: lead2P1.id,
        pipelineId: pipelineP1.id,
        stageId: stagesP1[2].id, // Reunião Agendada
        value: 120000,
        status: 'ACTIVE',
      },
      {
        leadId: lead3P1.id,
        pipelineId: pipelineP1.id,
        stageId: stagesP1[3].id, // Proposta Enviada
        value: 30000,
        status: 'ACTIVE',
      },
      {
        leadId: lead4P1.id,
        pipelineId: pipelineP1.id,
        stageId: stagesP1[4].id, // Fechado (Ganho)
        value: 15000,
        status: 'ACTIVE',
      },
      {
        leadId: lead5LostP1.id,
        pipelineId: pipelineP1.id,
        stageId: stagesP1[5].id, // Perdido
        value: 20000,
        status: 'LOST',
        lostStatusId: lostPreco1.id,
      },
      {
        leadId: lead6LostP1.id,
        pipelineId: pipelineP1.id,
        stageId: stagesP1[5].id, // Perdido
        value: 60000,
        status: 'LOST',
        lostStatusId: lostSemResposta1.id,
      },
      {
        leadId: lead1P2.id,
        pipelineId: pipelineP2.id,
        stageId: stagesP2[1].id, // Diagnóstico
        value: 250000,
        status: 'ACTIVE',
      },
      {
        leadId: lead2P2.id,
        pipelineId: pipelineP2.id,
        stageId: stagesP2[0].id, // Novo Lead
        value: 80000,
        status: 'ACTIVE',
      },
    ],
  });

  console.log('Leads e suas participações nos funis (PipelineEntry) criados.');

  // 11. Criar Valores de Campos Personalizados (CustomFieldValue)
  await prisma.customFieldValue.createMany({
    data: [
      { leadId: lead1P1.id, fieldDefinitionId: fieldFatP1.id, value: '80000' },
      { leadId: lead1P1.id, fieldDefinitionId: fieldSegP1.id, value: 'Indústria Metalúrgica' },
      
      { leadId: lead2P1.id, fieldDefinitionId: fieldFatP1.id, value: '250000' },
      { leadId: lead2P1.id, fieldDefinitionId: fieldSegP1.id, value: 'Tecnologia / Fintech' },

      { leadId: lead1P2.id, fieldDefinitionId: fieldSociosP2.id, value: '3' },
    ],
  });

  console.log('Valores de campos personalizados atribuídos aos Leads.');

  // 12. Criar Atividades (Activities)
  await prisma.activity.createMany({
    data: [
      { leadId: lead1P1.id, type: 'LOG', content: 'Lead importado no sistema via Seed.', userId: superadmin.id },
      { leadId: lead2P1.id, type: 'LOG', content: 'Lead importado no sistema via Seed.', userId: superadmin.id },
      { leadId: lead2P1.id, type: 'COMMENT', content: 'Agendou reunião para próxima terça às 14h.', userId: superadmin.id },
      { leadId: lead3P1.id, type: 'STATUS_CHANGE', content: 'Movido para o estágio de Proposta Enviada.', userId: superadmin.id },
      { leadId: lead4P1.id, type: 'LOG', content: 'Contrato assinado! Lead ganho.', userId: superadmin.id },
      { leadId: lead5LostP1.id, type: 'STATUS_CHANGE', content: 'Lead perdido: Achou o valor muito alto comparado ao budget.', userId: superadmin.id },
      { leadId: lead1P2.id, type: 'LOG', content: 'Diagnóstico de ROI concluído com sucesso.', userId: superadmin.id },
    ],
  });

  // 13. Criar Tarefas (Tasks)
  await prisma.task.createMany({
    data: [
      { title: 'Enviar mensagem de introdução', description: 'Chamar no WhatsApp Roberto para agendar call.', status: 'PENDING', leadId: lead1P1.id, projectId: project1.id },
      { title: 'Preparar deck de proposta', description: 'Estruturar proposta de R$ 120.000 para Fernanda.', status: 'IN_PROGRESS', leadId: lead2P1.id, projectId: project1.id },
      { title: 'Fazer follow-up da proposta', description: 'Ligar para Carlos para entender se restaram dúvidas.', status: 'PENDING', leadId: lead3P1.id, projectId: project1.id },
      { title: 'Onboarding do cliente', description: 'Reunião de início de projeto com Ana Júlia.', status: 'COMPLETED', leadId: lead4P1.id, projectId: project1.id },
      { title: 'Apresentar diagnóstico High Ticket', description: 'Apresentação para Eduardo Santos.', status: 'PENDING', leadId: lead1P2.id, projectId: project2.id },
    ],
  });

  console.log('Atividades e Tarefas criadas.');

  // 14. Criar Webhook de Entrada Padrão para Projeto 1 (apontando para Origem)
  await prisma.webhookEndpoint.create({
    data: {
      name: 'Captação WordPress (Formulário)',
      token: 'token-secreto-alpha-123',
      targetStageId: stagesP1[0].id,
      projectId: project1.id,
      originId: originWp1.id, // Conectado à origem WordPress
      fieldMapping: JSON.stringify({
        name: 'nome_cliente',
        email: 'email_cliente',
        phone: 'telefone_cliente',
        company: 'empresa_cliente',
        value: 'valor_estimado',
      }),
    },
  });

  console.log('Webhook de entrada conectado à origem cadastrado.');
  console.log('Seed do banco de dados (com adendo) concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
