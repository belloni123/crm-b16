import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PROJECT_FEATURE_KEYS } from "../lib/channels/features";
import { assertOutboundDisabled } from "../lib/env";

async function main() {
  if (process.env.DEPLOYMENT_ENV !== "staging") throw new Error("Staging seed refused outside DEPLOYMENT_ENV=staging.");
  assertOutboundDisabled();
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email: "admin.omnichannel@staging.invalid" },
      update: {},
      create: { id: "staging-user-omnichannel", name: "Admin Staging", email: "admin.omnichannel@staging.invalid", passwordHash: await bcrypt.hash("staging-disabled-login", 12), role: "SUPERADMIN", lgpdAccepted: true, lgpdAcceptedAt: new Date() },
    });
    const project = await prisma.project.upsert({
      where: { id: "staging-project-omnichannel" },
      update: { name: "Projeto Sintético Omnichannel" },
      create: { id: "staging-project-omnichannel", name: "Projeto Sintético Omnichannel", description: "Dados exclusivamente fictícios de staging" },
    });
    await prisma.membership.upsert({
      where: { userId_projectId: { userId: user.id, projectId: project.id } },
      update: { role: "PROJECT_ADMIN" },
      create: { userId: user.id, projectId: project.id, role: "PROJECT_ADMIN" },
    });
    const pipeline = await prisma.pipeline.upsert({ where: { id: "staging-pipeline-omnichannel" }, update: {}, create: { id: "staging-pipeline-omnichannel", name: "Pipeline Sintético", projectId: project.id } });
    const stage = await prisma.stage.upsert({ where: { id: "staging-stage-new" }, update: {}, create: { id: "staging-stage-new", name: "Novo", order: 0, pipelineId: pipeline.id } });
    for (let index = 1; index <= 3; index += 1) {
      const lead = await prisma.lead.upsert({
        where: { id: `staging-lead-${index}` }, update: {},
        create: { id: `staging-lead-${index}`, name: `Lead Fictício ${index}`, email: `lead${index}@staging.invalid`, phone: `+55000000000${index}`, company: "Empresa Fictícia", projectId: project.id },
      });
      await prisma.pipelineEntry.upsert({
        where: { leadId_pipelineId: { leadId: lead.id, pipelineId: pipeline.id } }, update: {},
        create: { id: `staging-entry-${index}`, leadId: lead.id, pipelineId: pipeline.id, stageId: stage.id },
      });
    }
    await prisma.channelConnection.upsert({
      where: { id: "staging-connection-disabled" },
      update: { isActive: false, status: "DISABLED", credentialsEncrypted: null },
      create: { id: "staging-connection-disabled", projectId: project.id, provider: "META_WHATSAPP", channel: "WHATSAPP", name: "Conexão fictícia desativada", status: "DISABLED", isActive: false },
    });
    for (const key of PROJECT_FEATURE_KEYS) {
      await prisma.projectFeature.upsert({
        where: { projectId_key: { projectId: project.id, key } },
        update: { enabled: false, configuration: null },
        create: { projectId: project.id, key, enabled: false },
      });
    }
    process.stdout.write("Synthetic staging seed applied with every feature disabled.\n");
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
