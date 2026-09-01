'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="pt-BR">
      <head>
        <title>Erro inesperado — CRM B16</title>
      </head>
      <body style={{ margin: 0, background: '#0a0a0a', color: '#f5f5f5', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box' }}>
          <section style={{ width: '100%', maxWidth: 620, border: '1px solid rgba(255,255,255,.1)', borderRadius: 24, background: '#151515', padding: 40, boxSizing: 'border-box', boxShadow: '0 30px 90px rgba(0,0,0,.45)' }}>
            <div style={{ color: '#d4a843', fontSize: 12, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase' }}>CRM B16 · Erro crítico</div>
            <h1 style={{ margin: '20px 0 12px', fontSize: 34, lineHeight: 1.1 }}>Não foi possível carregar o CRM</h1>
            <p style={{ margin: 0, color: '#a3a3a3', fontSize: 16, lineHeight: 1.7 }}>Encontramos uma falha inesperada na estrutura da aplicação. Tente novamente; se continuar, fale com o administrador.</p>
            <button type="button" onClick={retry} style={{ marginTop: 28, minHeight: 44, border: 0, borderRadius: 12, padding: '0 22px', background: '#d4a843', color: '#0a0a0a', fontWeight: 800, cursor: 'pointer' }}>
              Tentar novamente
            </button>
            {error.digest && <p style={{ marginTop: 24, color: '#666', fontFamily: 'monospace', fontSize: 11 }}>Referência: {error.digest}</p>}
          </section>
        </main>
      </body>
    </html>
  );
}
