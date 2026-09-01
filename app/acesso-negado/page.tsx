import type { Metadata } from 'next';
import { ErrorScreen } from '@/components/error-screen';
import { getSession } from '@/lib/security';

export const metadata: Metadata = {
  title: 'Acesso negado — CRM B16',
  description: 'Sua conta não tem permissão para acessar esta área do CRM B16.',
};

interface Props {
  searchParams: Promise<{ reason?: string }>;
}

export default async function AccessDeniedPage({ searchParams }: Props) {
  const [{ reason }, session] = await Promise.all([searchParams, getSession()]);
  const isAdminArea = reason === 'admin';
  const authenticated = Boolean(session?.user);

  return (
    <ErrorScreen
      variant="forbidden"
      eyebrow="Erro 403"
      title={isAdminArea ? 'Esta área é exclusiva para superadministradores' : 'Você não tem acesso a este projeto'}
      description={isAdminArea
        ? 'Sua conta está ativa, mas não possui o nível de acesso necessário para abrir o painel administrativo.'
        : 'Sua conta está ativa, mas não está vinculada a este projeto ou não possui a permissão necessária.'}
      guidance="Fale com um administrador do CRM B16 e peça a vinculação ao projeto ou a revisão do seu perfil de acesso."
      primaryHref={authenticated ? '/project' : '/'}
      primaryLabel={authenticated ? 'Voltar aos meus projetos' : 'Ir para o login'}
      secondaryHref={authenticated ? '/api/auth/signout' : '/'}
      secondaryLabel={authenticated ? 'Sair e trocar de conta' : 'Voltar ao início'}
    />
  );
}
