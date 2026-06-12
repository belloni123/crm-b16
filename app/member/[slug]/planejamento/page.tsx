import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getMemberBySlug } from '@/lib/members';
import { getMemberPlanning } from '@/lib/content';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { PageTransition } from '@/components/page-transition';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const member = await getMemberBySlug(slug);
  if (!member) return {};
  return {
    title: `Planejamento — ${member.nome}`,
    description: `Planejamento estratégico de ${member.nome} na CRM b16.`,
  };
}

export default async function PlanningPage({ params }: PageProps) {
  const { slug } = await params;
  const member = await getMemberBySlug(slug);

  if (!member) {
    notFound();
  }

  const planning = await getMemberPlanning(slug);

  return (
    <div className="min-h-screen bg-bg-base flex flex-col font-sans">
      {/* Sticky Topbar */}
      <header className="sticky top-0 z-50 h-14 w-full bg-[#0a0a0a]/80 backdrop-blur-[20px] border-b border-border-subtle flex items-center justify-between px-6">
        <Link
          href={`/member/${slug}`}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-all duration-300 ease-out cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 text-text-secondary" />
          <span>Voltar</span>
        </Link>
        <span className="text-xs font-mono text-text-tertiary truncate max-w-[200px] sm:max-w-none text-right">
          {planning ? planning.titulo : 'Aguardando'}
        </span>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[680px] mx-auto px-6 pt-8 pb-24">
        <PageTransition>
          {planning ? (
            <div className="flex flex-col gap-2">
              {planning.atualizado && (
                <div className="text-[10px] font-mono text-text-tertiary mb-6 uppercase tracking-wider">
                  Atualizado em: {planning.atualizado}
                </div>
              )}
              <MarkdownRenderer content={planning.content} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 border border-dashed border-border-strong rounded-2xl bg-bg-elevated/40">
              <p className="text-sm text-text-secondary">
                Seu planejamento ainda está sendo preparado.
              </p>
              <Link
                href={`/member/${slug}`}
                className="inline-flex items-center gap-2 text-xs font-mono text-accent hover:text-text-primary transition-all duration-300 ease-out py-2 px-3 border border-border-subtle hover:border-border-strong rounded-lg bg-bg-elevated cursor-pointer"
              >
                Voltar ao dashboard
              </Link>
            </div>
          )}
        </PageTransition>
      </main>
    </div>
  );
}
