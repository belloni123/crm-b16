'use client';

import * as React from 'react';
import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Shield, LogOut, Check } from 'lucide-react';
import { acceptLgpdTerms } from '@/app/actions/lgpd';
import { Button } from '@/components/ui/button';

export function LgpdGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const [checked, setChecked] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const userAccepted = React.useMemo(() => {
    return !!(session?.user as any)?.lgpdAccepted;
  }, [session]);

  const handleAccept = async () => {
    if (!checked) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await acceptLgpdTerms();
      if (result.success) {
        // Atualiza a sessão NextAuth localmente com a nova flag lgpdAccepted
        await update({
          ...session,
          user: {
            ...session?.user,
            lgpdAccepted: true,
          }
        });
      } else {
        setError('Ocorreu um erro ao processar seu aceite. Tente novamente.');
      }
    } catch (err: any) {
      setError(err.message || 'Falha na conexão. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Carregamento inicial da sessão
  if (status === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-bg-base text-text-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
        <span className="text-sm font-medium">Carregando painel seguro...</span>
      </div>
    );
  }

  // 2. Se não estiver logado, deixa o middleware fazer o redirecionamento padrão
  if (status === 'unauthenticated') {
    return <>{children}</>;
  }

  // 3. Se logado e termos aceitos, renderiza a tela normalmente
  if (userAccepted) {
    return <>{children}</>;
  }

  // 4. Bloqueio por Termos da LGPD
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden">
      {/* Background desfocado idêntico ao login */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none z-0 filter blur-sm"
        style={{ backgroundImage: "url('/login-bg.jpg')" }}
      />
      <div className="absolute inset-0 bg-[#050505]/85 pointer-events-none z-0" />

      {/* Caixa do Termo (Glassmorphic) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[640px] bg-bg-elevated/90 backdrop-blur-lg border border-border-strong rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col max-h-[90vh] text-left"
      >
        {/* Header do Modal */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-accent/10 border border-accent/20 rounded-xl">
            <Shield className="h-6 w-6 text-accent drop-shadow-[0_0_8px_rgba(159,232,112,0.3)]" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-extrabold text-white font-display uppercase tracking-tight">
              Termos de Uso e LGPD
            </h1>
            <p className="text-xs text-text-secondary font-medium">
              Por favor, leia e concorde com os termos para acessar o painel comercial.
            </p>
          </div>
        </div>

        {/* Scroll Box com Termos */}
        <div className="flex-1 overflow-y-auto bg-black/40 border border-border-subtle rounded-xl p-4 md:p-5 mb-6 text-xs md:text-sm text-text-secondary leading-relaxed font-sans max-h-[350px] custom-scrollbar">
          <div className="space-y-4">
            <p className="text-white font-bold uppercase tracking-wider text-xs">
              POLÍTICA DE PRIVACIDADE E SEGURANÇA DE DADOS (LGPD) — NO FRONT SCALE
            </p>
            <p>
              Este Termo de Aceite e Consentimento de Uso de Dados regula a utilização da plataforma de CRM e automação comercial <strong>No Front Scale</strong>, em conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais (LGPD) — Lei nº 13.709/2018</strong>.
            </p>
            
            <h3 className="text-white font-semibold text-xs uppercase">1. Coleta e Finalidade do Tratamento de Dados</h3>
            <p>
              Como usuário ou operador da plataforma, você está ciente de que coletamos e processamos informações necessárias para a sua identificação e acesso seguro (como nome, endereço de e-mail corporativo e logs de atividade). 
              Adicionalmente, a plataforma processa informações dos contatos e Leads inseridos no sistema (nomes, telefones, e-mails, históricos de negócios e interações em canais de comunicação). O tratamento desses dados possui a finalidade estrita de:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Viabilizar a gestão do funil de vendas, oportunidades e tarefas comerciais;</li>
              <li>Permitir o envio de mensagens transacionais e acompanhamentos automatizados;</li>
              <li>Integrar com gateways de comunicação e APIs externas autorizadas pelo projeto (incluindo automações de WhatsApp via Evolution API).</li>
            </ul>

            <h3 className="text-white font-semibold text-xs uppercase">2. Confidencialidade e Medidas de Segurança</h3>
            <p>
              Comprometemo-nos a aplicar medidas de segurança técnicas e administrativas aptas a proteger os dados pessoais de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração ou comunicação. 
              As credenciais de acesso fornecidas (e-mail e senha criptografada) são de uso estritamente pessoal e intransferível, sendo sua obrigação zelar pelo sigilo destas informações.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">3. Responsabilidades e Boas Práticas do Usuário</h3>
            <p>
              Ao utilizar as funcionalidades do CRM e ao interagir com Leads ou clientes, você se obriga a:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Tratar os dados dos Leads de acordo com os princípios da boa-fé, finalidade, adequação e necessidade;</li>
              <li>Não compartilhar informações comerciais confidenciais fora da plataforma sem autorização prévia;</li>
              <li>Garantir que os contatos inseridos na plataforma possuam uma base legal de consentimento ou interesse legítimo para o recebimento de mensagens e contatos de vendas.</li>
            </ul>

            <h3 className="text-white font-semibold text-xs uppercase">4. Seus Direitos como Titular</h3>
            <p>
              Em conformidade com a LGPD, você pode, a qualquer momento, solicitar a confirmação da existência do tratamento, o acesso aos seus dados cadastrais, a correção de dados incompletos ou inexatos, ou a eliminação dos seus dados pessoais tratados mediante requisição expressa ao administrador do seu projeto.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">5. Contato e Esclarecimento de Dúvidas</h3>
            <p>
              Para exercer seus direitos ou esclarecer quaisquer dúvidas sobre a forma como seus dados são tratados na plataforma, você pode entrar em contato com o nosso Encarregado pelo Tratamento de Dados Pessoais (DPO) através do e-mail oficial: <a href="mailto:contato@nofronscale.com.br" className="text-accent underline">contato@nofronscale.com.br</a>.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">6. Consentimento e Vigência</h3>
            <p>
              Ao marcar a caixa de seleção abaixo e clicar em "Aceitar e Continuar", você fornece seu consentimento livre, informado e inequívoco para o tratamento de dados pessoais conforme descrito neste termo, que vigorará por todo o período em que sua conta estiver ativa na plataforma.
            </p>
          </div>
        </div>

        {/* Notificação de Erro */}
        {error && (
          <div className="text-xs font-semibold text-danger bg-danger/10 border border-danger/20 rounded-lg p-3 mb-5 text-center">
            {error}
          </div>
        )}

        {/* Checkbox de Consentimento */}
        <label className="flex items-start gap-3 mb-6 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="sr-only"
            disabled={isSubmitting}
          />
          <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
            checked 
              ? 'bg-accent border-accent text-black' 
              : 'border-border-strong bg-black/40 group-hover:border-accent/50'
          }`}>
            {checked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
          </div>
          <span className="text-xs md:text-sm text-text-secondary leading-snug group-hover:text-text-primary transition-colors">
            Li, compreendi e concordo com os Termos de Uso e a Política de Privacidade de dados em conformidade com a LGPD.
          </span>
        </label>

        {/* Rodapé com Botões */}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 border-t border-border-subtle pt-5">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            disabled={isSubmitting}
            className="w-full sm:w-auto h-11 flex items-center justify-center gap-2 bg-glass-3 hover:bg-[rgba(255,255,255,0.06)] border border-border-subtle hover:border-text-secondary text-text-primary px-5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Recusar e Sair
          </button>
          
          <Button
            type="button"
            onClick={handleAccept}
            disabled={!checked || isSubmitting}
            className="w-full sm:w-auto h-11 bg-accent hover:bg-accent-light text-black font-bold px-6 rounded-lg text-sm cursor-pointer transition-all duration-200 border-none shadow-[0_0_15px_rgba(159,232,112,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-black" />
                Registrando Aceite...
              </span>
            ) : (
              'Aceitar e Continuar'
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
