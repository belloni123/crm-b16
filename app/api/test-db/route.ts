import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const instances = await prisma.whatsAppInstance.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    const conversationsCount = await prisma.conversation.count();
    const messagesCount = await prisma.message.count();

    return NextResponse.json({
      success: true,
      instances,
      conversationsCount,
      messagesCount
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
