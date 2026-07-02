import { PrismaClient } from '@prisma/client';
import { getPhoneVariants } from '../lib/utils';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting WhatsApp conversation merging script...');

  // 1. Fetch all conversations and WhatsApp instances
  const instances = await prisma.whatsAppInstance.findMany();
  const conversations = await prisma.conversation.findMany({
    include: {
      messages: true,
      lead: true,
    },
  });

  console.log(`Found ${instances.length} WhatsApp instances and ${conversations.length} total conversations.`);

  // Create a map of instances for quick access
  const instanceMap = new Map(instances.map((i) => [i.id, i]));

  // Group conversations by instanceId
  const conversationsByInstance = new Map<string, typeof conversations>();
  for (const c of conversations) {
    const list = conversationsByInstance.get(c.instanceId) || [];
    list.push(c);
    conversationsByInstance.set(c.instanceId, list);
  }

  let totalMerged = 0;

  for (const [instanceId, instConversations] of conversationsByInstance.entries()) {
    const instance = instanceMap.get(instanceId);
    const instanceName = instance?.name || '';
    console.log(`\nProcessing instance: "${instanceName}" (ID: ${instanceId})`);

    // Group conversations by contact phone variants
    const groups: (typeof conversations)[] = [];

    for (const conv of instConversations) {
      const variants = getPhoneVariants(conv.whatsappId);
      
      // Find an existing group where any conversation matches these variants
      let foundGroup = false;
      for (const group of groups) {
        if (group.some((gc) => variants.includes(gc.whatsappId) || getPhoneVariants(gc.whatsappId).includes(conv.whatsappId))) {
          group.push(conv);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.push([conv]);
      }
    }

    // Process each group of duplicate conversations
    for (const group of groups) {
      if (group.length <= 1) continue;

      console.log(`\nFound group with ${group.length} duplicate conversations:`);
      for (const c of group) {
        console.log(`  - Conv ID: ${c.id}, whatsappId: ${c.whatsappId}, name: "${c.name}", lead: ${c.lead?.name || 'none'}, messages: ${c.messages.length}`);
      }

      // 1. Select the primary conversation
      // Score each conversation to find the best candidate
      const scoredConversations = group.map((c) => {
        let score = 0;
        
        // Prefer conversations that are NOT named after the instance owner or are just digits
        const isGenericName = 
          c.name === c.whatsappId || 
          c.name === instanceName || 
          c.name.includes('/B16');
        
        if (!isGenericName) {
          score += 100; // Strong preference for a specific contact name (e.g. Thiago Santos)
        }

        if (c.leadId) {
          score += 50; // Prefer conversation linked to a lead
        }

        score += c.messages.length; // Tie-breaker: prefer the one with more messages

        return { conversation: c, score };
      });

      // Sort by score descending
      scoredConversations.sort((a, b) => b.score - a.score);
      const primary = scoredConversations[0].conversation;
      const redundantList = scoredConversations.slice(1).map((sc) => sc.conversation);

      console.log(`Selected PRIMARY conversation: "${primary.name}" (ID: ${primary.id})`);

      let updatedLeadId = primary.leadId;
      let updatedName = primary.name;
      let updatedLastMessageAt = new Date(primary.lastMessageAt);

      // 2. Merge redundant conversations into the primary
      for (const redundant of redundantList) {
        console.log(`Merging redundant conversation "${redundant.name}" (ID: ${redundant.id}) -> Primary`);

        // Move messages
        if (redundant.messages.length > 0) {
          const moveResult = await prisma.message.updateMany({
            where: { conversationId: redundant.id },
            data: { conversationId: primary.id },
          });
          console.log(`  Moved ${moveResult.count} messages.`);
        }

        // Inherit lead link if primary doesn't have one
        if (!updatedLeadId && redundant.leadId) {
          updatedLeadId = redundant.leadId;
          console.log(`  Inherited lead ID: ${redundant.leadId}`);
        }

        // Inherit contact name if primary name is generic and redundant is not
        const primaryIsGeneric = 
          updatedName === primary.whatsappId || 
          updatedName === instanceName || 
          updatedName.includes('/B16');

        const redundantIsGeneric = 
          redundant.name === redundant.whatsappId || 
          redundant.name === instanceName || 
          redundant.name.includes('/B16');

        if (primaryIsGeneric && !redundantIsGeneric) {
          updatedName = redundant.name;
          console.log(`  Inherited contact name: "${redundant.name}"`);
        }

        // Keep the most recent lastMessageAt timestamp
        const redundantDate = new Date(redundant.lastMessageAt);
        if (redundantDate > updatedLastMessageAt) {
          updatedLastMessageAt = redundantDate;
        }

        // Delete redundant conversation
        await prisma.conversation.delete({
          where: { id: redundant.id },
        });
        console.log(`  Deleted redundant conversation.`);
      }

      // 3. Update the primary conversation with final values
      await prisma.conversation.update({
        where: { id: primary.id },
        data: {
          leadId: updatedLeadId,
          name: updatedName,
          lastMessageAt: updatedLastMessageAt,
        },
      });

      console.log(`Successfully updated primary conversation "${updatedName}"`);
      totalMerged++;
    }
  }

  console.log(`\nWhatsApp conversation merging completed. Total groups merged: ${totalMerged}`);
}

main()
  .catch((e) => {
    console.error('Error during merging script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
