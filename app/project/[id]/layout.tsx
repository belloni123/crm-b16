import React from 'react';
import { redirect } from 'next/navigation';
import { requireProjectAccess, getSession } from '@/lib/security';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  KanbanSquare, 
  Users, 
  CheckSquare, 
  MessageSquare, 
  Settings, 
  Shield, 
  LogOut,
  FolderSync,
  ChevronDown,
  HelpCircle
} from 'lucide-react';
import { ProjectSwitcher } from './project-switcher';
import { ThemeToggle } from '@/components/theme-toggle';

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ProjectLayout({ children, params }: Props) {
  const { id: projectId } = await params;
  
  // 1. Valida acesso do usuário ao projeto. Se não tiver, lança exceção interceptada pelo middleware/NextAuth
  const access = await requireProjectAccess(projectId);
  const session = await getSession();
  const user = session?.user as { id: string; name?: string; email: string; role: string };

  // 2. Busca os detalhes do projeto atual
  const currentProject = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!currentProject) {
    redirect('/project');
  }

  // 3. Busca todos os projetos acessíveis pelo usuário para o Workspace Switcher
  let accessibleProjects = [];
  if (user.role === 'SUPERADMIN') {
    accessibleProjects = await prisma.project.findMany({
      orderBy: { name: 'asc' },
    });
  } else {
    accessibleProjects = await prisma.project.findMany({
      where: {
        memberships: {
          some: { userId: user.id },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-transparent relative">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 flex-shrink-0 bg-dark-glass-4 backdrop-blur-xl border-b md:border-b-0 md:border-r border-border-subtle flex flex-col z-20">
        {/* Header da Sidebar com Logo e Workspace Switcher */}
        <div className="p-6 border-b border-border-subtle flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Link href="/project">
              <img
                src="/logo.svg"
                alt="No Front Scale"
                className="h-8 w-auto object-contain brightness-100"
              />
            </Link>
          </div>
          
          {/* Componente Client-Side de Seleção de Projeto */}
          <ProjectSwitcher 
            currentProjectName={currentProject.name} 
            currentProjectId={currentProject.id}
            projects={accessibleProjects.map(p => ({ id: p.id, name: p.name }))}
          />
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <SidebarLink
            href={`/project/${projectId}`}
            label="Dashboard"
            icon={<LayoutDashboard className="h-4 w-4" />}
          />
          <SidebarLink
            href={`/project/${projectId}/kanban`}
            label="Kanban"
            icon={<KanbanSquare className="h-4 w-4" />}
          />
          <SidebarLink
            href={`/project/${projectId}/leads`}
            label="Leads"
            icon={<Users className="h-4 w-4" />}
          />
          <SidebarLink
            href={`/project/${projectId}/tasks`}
            label="Tarefas"
            icon={<CheckSquare className="h-4 w-4" />}
          />
          <SidebarLink
            href={`/project/${projectId}/inbox`}
            label="Inbox WhatsApp"
            icon={<MessageSquare className="h-4 w-4" />}
          />
          <SidebarLink
            href={`/project/${projectId}/settings`}
            label="Configurações"
            icon={<Settings className="h-4 w-4" />}
          />
          <SidebarLink
            href={`/project/${projectId}/help`}
            label="Central de Ajuda"
            icon={<HelpCircle className="h-4 w-4" />}
          />
          
          {/* Se for SUPERADMIN, mostra link para o painel administrativo global */}
          {user.role === 'SUPERADMIN' && (
            <div className="pt-4 border-t border-border-subtle mt-4">
              <SidebarLink
                href="/admin"
                label="Painel Superadmin"
                icon={<Shield className="h-4 w-4 text-accent" />}
              />
            </div>
          )}
        </nav>

        {/* Perfil do Usuário e Logout */}
        <div className="p-4 border-t border-border-subtle bg-glass-1 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">
                {(user.name || user.email).substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">
                  {user.name || 'Membro'}
                </p>
                <p className="text-[10px] text-text-secondary truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <Link
            href="/api/auth/signout"
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-danger hover:text-white rounded-lg hover:bg-danger/10 transition-all duration-150"
          >
            <LogOut className="h-4 w-4" />
            Sair do CRM
          </Link>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        {children}
      </main>
    </div>
  );
}

// Subcomponente utilitário para renderizar links na Sidebar
interface SidebarLinkProps {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function SidebarLink({ href, label, icon }: SidebarLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-glass-3 border border-transparent hover:border-glass-4 transition-all duration-150 font-medium"
    >
      <span className="text-text-tertiary group-hover:text-white transition-colors duration-150">
        {icon}
      </span>
      {label}
    </Link>
  );
}
