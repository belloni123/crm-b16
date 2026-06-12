import { notFound } from 'next/navigation';
import { getMemberBySlug } from '@/lib/members';
import { MemberHeader, MemberSummaryCard } from '@/components/member-header';
import { GoalChecklist } from '@/components/goal-checklist';
import { PageTransition } from '@/components/page-transition';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const member = await getMemberBySlug(slug);
  if (!member) return {};
  return {
    title: `${member.nome} — Dashboard CRM b16`,
    description: `Acompanhe o planejamento estratégico de ${member.nome} na CRM b16.`,
  };
}

export default async function MemberDashboardPage({ params }: PageProps) {
  const { slug } = await params;
  const member = await getMemberBySlug(slug);

  if (!member) {
    notFound();
  }

  return (
    <main className="w-full max-w-[680px] mx-auto px-6 py-8 md:py-12 flex flex-col gap-6">
      <PageTransition>
        <MemberHeader nome={member.nome} empresa={member.empresa} />
        <MemberSummaryCard resumo={member.resumo} />
        <GoalChecklist initialMetas={member.metas} slug={member.slug} />
      </PageTransition>
    </main>
  );
}
