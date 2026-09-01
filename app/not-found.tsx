import type { Metadata } from 'next';
import { ErrorScreen } from '@/components/error-screen';

export const metadata: Metadata = {
  title: 'Página não encontrada — CRM B16',
};

export default function NotFoundPage() {
  return (
    <ErrorScreen
      variant="not-found"
      eyebrow="Erro 404"
      title="Não encontramos esta página"
      description="O endereço pode ter sido digitado incorretamente, o recurso pode ter sido removido ou o link não está mais disponível."
      guidance="Confira o endereço ou volte para a lista de projetos para continuar trabalhando."
      primaryHref="/project"
      primaryLabel="Voltar aos projetos"
      secondaryHref="/"
      secondaryLabel="Ir para o início"
    />
  );
}
