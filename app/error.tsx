'use client';

import { useEffect } from 'react';
import { ErrorScreen } from '@/components/error-screen';

export default function ApplicationError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      variant="unexpected"
      eyebrow="Erro 500"
      title="Algo não saiu como esperado"
      description="O CRM encontrou uma falha inesperada ao carregar esta área. Seus dados não foram apagados."
      guidance="Tente carregar novamente. Se o problema continuar, envie o código de referência abaixo ao administrador."
      onRetry={retry}
      secondaryHref="/project"
      secondaryLabel="Voltar aos projetos"
      reference={error.digest}
    />
  );
}
