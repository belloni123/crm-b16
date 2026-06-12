import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function ProjectDispatcherPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/');
  }

  const user = session.user as { id: string; role: string; name?: string; email: string };

  // 1. Tratamento para SUPERADMIN
  if (user.role === 'SUPERADMIN') {
    const firstProject = await prisma.project.findFirst({
      orderBy: { name: 'asc' },
    });

    if (firstProject) {
      redirect(`/project/${firstProject.id}`);
    } else {
      redirect('/admin');
    }
  }

  // 2. Tratamento para Usuário comum (Membro)
  const userMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { project: true },
    orderBy: { project: { name: 'asc' } },
  });

  if (userMembership) {
    redirect(`/project/${userMembership.projectId}`);
  }

  // 3. Caso o usuário não tenha nenhum projeto vinculado
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-bg-base min-h-screen text-center">
      <div className="w-full max-w-[480px] bg-glass-1 backdrop-blur-md border border-border-subtle rounded-2xl p-8 shadow-2xl">
        <div className="relative mb-6">
          <img
            src="/logo-white.png"
            alt="CRM b16 Logo"
            className="logo-theme-white h-10 mx-auto"
          />
          <img
            src="/logo-dark.png"
            alt="CRM b16 Logo"
            className="logo-theme-dark h-10 mx-auto"
          />
        </div>
        <h1 className="text-xl font-bold font-display text-white mb-3">
          Nenhum Projeto Vinculado
        </h1>
        <p className="text-sm text-text-secondary mb-8 leading-relaxed">
          Olá, <span className="text-white font-semibold">{user.name || user.email}</span>. 
          Sua conta ainda não foi vinculada a nenhum projeto comercial por um administrador.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/api/auth/signout"
            className="w-full h-11 flex items-center justify-center bg-glass-3 hover:bg-[rgba(255,255,255,0.06)] border border-border-subtle hover:border-text-secondary text-white font-semibold rounded-lg transition-all duration-200"
          >
            Sair da Conta
          </Link>
        </div>
      </div>
    </main>
  );
}
