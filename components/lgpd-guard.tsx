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
        await update({ lgpdAccepted: true });
        
        // Recarrega a página para garantir que todos os Server Components
        // no servidor leiam e renderizem com a nova sessão atualizada.
        window.location.reload();
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
            <Shield className="h-6 w-6 text-accent drop-shadow-[0_0_8px_rgba(212,168,67,0.3)]" />
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
              TERMO DE ACEITE, USO E RESPONSABILIDADE DA PLATAFORMA CRM B16
            </p>
            <p>
              Ao acessar ou utilizar a plataforma CRM b16, disponível em <a href="https://crm.crmb16.com.br/" target="_blank" rel="noopener noreferrer" className="text-accent underline">https://crm.crmb16.com.br/</a>, o usuário declara ter lido, compreendido e aceitado integralmente os presentes Termos de Uso e Responsabilidade.
            </p>
            
            <h3 className="text-white font-semibold text-xs uppercase">1. OBJETO</h3>
            <p>
              A CRM b16 disponibiliza ao usuário uma plataforma tecnológica de gestão de relacionamento com clientes (CRM), destinada ao armazenamento, organização, gerenciamento e acompanhamento de contatos, oportunidades comerciais, negociações, documentos, registros e demais informações inseridas pelo próprio usuário.
            </p>
            <p>
              A plataforma constitui exclusivamente uma ferramenta tecnológica de apoio à gestão comercial, não participando das operações comerciais realizadas pelos usuários nem assumindo qualquer responsabilidade pelos negócios, contratos ou relações jurídicas decorrentes de sua utilização.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">2. RESPONSABILIDADE PELOS DADOS INSERIDOS</h3>
            <p>
              Todo e qualquer conteúdo inserido na plataforma é de exclusiva responsabilidade do usuário. Incluem-se, sem limitação: Leads; Dados pessoais; Informações comerciais; Documentos; Anotações; Arquivos; Registros de comunicação; Cadastros de clientes; Cadastros de fornecedores; Informações estratégicas ou confidenciais.
            </p>
            <p>
              O usuário declara possuir autorização legal para coletar, armazenar, utilizar e tratar todos os dados inseridos na plataforma, assumindo integral responsabilidade perante terceiros e perante autoridades administrativas ou judiciais.
            </p>
            <p>
              A CRM b16 não realiza validação prévia, auditoria, fiscalização ou verificação da origem, autenticidade, licitude, exatidão ou atualização dos dados armazenados pelos usuários.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">3. CONFORMIDADE COM A LGPD</h3>
            <p>
              Para todos os fins legais, o usuário é considerado o Controlador dos dados pessoais inseridos na plataforma, nos termos da Lei nº 13.709/2018 (LGPD). A CRM b16 atua exclusivamente como operadora da infraestrutura tecnológica necessária ao funcionamento do sistema.
            </p>
            <p>
              Compete exclusivamente ao usuário:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>I. Obter consentimentos quando exigidos;</li>
              <li>II. Definir as bases legais de tratamento;</li>
              <li>III. Atender solicitações dos titulares dos dados;</li>
              <li>IV. Garantir a legalidade da coleta e utilização das informações;</li>
              <li>V. Responder perante autoridades reguladoras e órgãos de fiscalização.</li>
            </ul>

            <h3 className="text-white font-semibold text-xs uppercase">4. RESPONSABILIDADE PELOS ACESSOS</h3>
            <p>
              O usuário é integralmente responsável pela gestão dos acessos concedidos à plataforma. São de sua responsabilidade: criação de usuários; compartilhamento de credenciais; revogação de acessos; definição de permissões; utilização adequada das contas cadastradas.
            </p>
            <p>
              Toda ação realizada dentro da conta será presumida como realizada pelo próprio usuário ou por pessoa por ele autorizada.
            </p>
            <p>
              A CRM b16 não responderá por acessos indevidos decorrentes de compartilhamento de senhas, falhas internas de segurança do usuário, engenharia social, phishing, vazamento de credenciais ou qualquer outro evento relacionado à administração dos acessos sob responsabilidade do usuário.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">5. USO ADEQUADO DA PLATAFORMA</h3>
            <p>
              É vedada a utilização da plataforma para:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>I. Atividades ilícitas;</li>
              <li>II. Armazenamento de conteúdo ilegal;</li>
              <li>III. Violação de direitos de terceiros;</li>
              <li>IV. Práticas de spam;</li>
              <li>V. Tratamento irregular de dados pessoais;</li>
              <li>VI. Atividades que possam comprometer a estabilidade ou segurança da plataforma.</li>
            </ul>
            <p>
              A CRM b16 poderá suspender ou encerrar imediatamente o acesso de usuários que utilizem a plataforma em desacordo com estes termos ou com a legislação vigente.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">6. DISPONIBILIDADE E MANUTENÇÃO</h3>
            <p>
              A CRM b16 empregará esforços comercialmente razoáveis para manter a plataforma disponível e operacional. Entretanto, o usuário reconhece que poderão ocorrer interrupções temporárias decorrentes de: atualizações; manutenções preventivas; manutenções corretivas; falhas de conectividade; ataques cibernéticos; eventos de força maior; casos fortuitos.
            </p>
            <p>
              Tais situações não caracterizam inadimplemento contratual nem geram direito a indenizações.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">7. BACKUP E PRESERVAÇÃO DOS DADOS</h3>
            <p>
              Embora a CRM b16 adote procedimentos de segurança compatíveis com o mercado, recomenda-se que o usuário mantenha cópias próprias das informações consideradas críticas para suas operações. O usuário reconhece que nenhum sistema computacional é absolutamente imune a falhas, indisponibilidades ou incidentes de segurança.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">8. LIMITAÇÃO DE RESPONSABILIDADE</h3>
            <p>
              Na máxima extensão permitida pela legislação aplicável, a CRM b16 não será responsável por:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>I. Perda de negócios;</li>
              <li>II. Perda de oportunidades comerciais;</li>
              <li>III. Lucros cessantes;</li>
              <li>IV. Danos indiretos;</li>
              <li>V. Danos consequenciais;</li>
              <li>VI. Perda de receitas;</li>
              <li>VII. Perda de dados causada por ação do usuário ou de terceiros por ele autorizados;</li>
              <li>VIII. Utilização inadequada da plataforma;</li>
              <li>IX. Tratamento irregular de dados pessoais realizado pelo usuário.</li>
            </ul>
            <p>
              A responsabilidade da CRM b16 limita-se à disponibilização da infraestrutura tecnológica da plataforma.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">9. INDENIZAÇÃO</h3>
            <p>
              O usuário compromete-se a defender, indenizar e manter a CRM b16, seus sócios, administradores, colaboradores e parceiros livres de quaisquer reclamações, ações judiciais, processos administrativos, multas, condenações, prejuízos ou despesas decorrentes: dos dados inseridos na plataforma; da violação destes termos; da utilização irregular da ferramenta; do descumprimento da legislação aplicável, especialmente da LGPD.
            </p>

            <h3 className="text-white font-semibold text-xs uppercase">10. ACEITE</h3>
            <p>
              Ao utilizar a plataforma, o usuário declara estar ciente de que a CRM b16 atua exclusivamente como fornecedora da infraestrutura tecnológica do sistema, permanecendo sob sua integral responsabilidade os dados armazenados, os acessos concedidos, as operações realizadas e o cumprimento das obsoleta obrigações legais relacionadas à utilização da plataforma.
            </p>
            <p>
              Contato para assuntos relacionados a estes termos:<br />
              E-mail: <a href="mailto:contato@crmb16.com.br" className="text-accent underline">contato@crmb16.com.br</a>
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
            className="w-full sm:w-auto h-11 bg-accent hover:bg-accent-light text-black font-bold px-6 rounded-lg text-sm cursor-pointer transition-all duration-200 border-none shadow-[0_0_15px_rgba(212,168,67,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
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
