'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, Mail, ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/app/actions/crm';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);

  // Estados do fluxo de recuperação de senha
  const [mode, setMode] = React.useState<'login' | 'forgot' | 'success'>('login');
  const [recoveryEmail, setRecoveryEmail] = React.useState('');
  const [recoverySuccessMessage, setRecoverySuccessMessage] = React.useState('');
  const [debugLink, setDebugLink] = React.useState<string | null>(null);

  // Captura erros passados via URL pelo NextAuth (ex: AccessDenied)
  React.useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'AccessDenied') {
      setError('Acesso negado: Você não possui as permissões necessárias.');
    } else if (errorParam === 'CredentialsSignin') {
      setError('E-mail ou senha incorretos.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error || 'Credenciais inválidas.');
        setIsPending(false);
      } else {
        router.push('/project');
        router.refresh();
      }
    } catch (err) {
      setError('Ocorreu um erro ao tentar entrar. Tente novamente.');
      setIsPending(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    setDebugLink(null);

    try {
      const result = await requestPasswordReset(recoveryEmail);
      if (result.success) {
        setRecoverySuccessMessage(result.message);
        if (result.debugLink) {
          setDebugLink(result.debugLink);
        }
        setMode('success');
      } else {
        setError(result.message || 'Erro ao processar a solicitação.');
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro inesperado ao solicitar redefinição.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Logo do No Front Scale com Efeitos Tecnológicos */}
      <div className="relative mb-8 flex flex-col items-center">
        {/* Glow neon de fundo pulsante */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: [0.15, 0.35, 0.15],
            scale: [1, 1.08, 1],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -inset-4 bg-accent/25 rounded-full blur-xl pointer-events-none"
        />
        {/* Animação de entrada do Logo (escala + desfoque progressivo) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(8px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="relative z-10"
        >
          <img
            src="/logo.svg"
            alt="No Front Scale Logo"
            className="h-14 w-auto object-contain brightness-100 drop-shadow-[0_0_15px_rgba(159,232,112,0.4)]"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </motion.div>
      </div>

      {/* Caixa do Formulário (Glassmorphism) com transição de conteúdo suave */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className="w-full bg-glass-1 backdrop-blur-md border border-border-subtle border-l-[rgba(159,232,112,0.3)] rounded-2xl p-8 shadow-2xl overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {mode === 'login' && (
            <motion.div
              key="login-form"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.3 }}
            >
              {/* Título com Tracking Reveal */}
              <motion.h1
                initial={{ letterSpacing: '0.05em', opacity: 0 }}
                animate={{ letterSpacing: '-0.02em', opacity: 1 }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="text-2xl font-extrabold text-white mb-2 font-display text-center uppercase tracking-tight"
              >
                NO FRONT MONEY
              </motion.h1>
              <p className="text-sm text-text-secondary text-center mb-8 font-medium">
                Chegou a hora de vender!
              </p>

              <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
                {/* Campo de Email */}
                <div className="flex flex-col gap-1.5 relative">
                  <label htmlFor="email" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-4 w-4 text-text-tertiary" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      placeholder="seu@email.com"
                      autoComplete="email"
                      disabled={isPending}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 bg-glass-1 border-border-subtle focus:border-accent text-white"
                    />
                  </div>
                </div>

                {/* Campo de Senha com o link Esqueci Senha */}
                <div className="flex flex-col gap-1.5 relative">
                  <div className="flex justify-between items-center">
                    <label htmlFor="password" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMode('forgot');
                      }}
                      className="text-xs font-medium text-accent hover:text-accent-light transition-colors cursor-pointer"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-4 w-4 text-text-tertiary" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={isPending}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 bg-glass-1 border-border-subtle focus:border-accent text-white"
                    />
                  </div>
                </div>

                {/* Notificação de Erro */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-medium text-danger text-center bg-danger/10 border border-danger/20 rounded-lg p-3"
                  >
                    {error}
                  </motion.div>
                )}

                {/* Botão de Submit */}
                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-11 bg-accent hover:bg-accent-light text-black font-bold rounded-lg cursor-pointer transition-all duration-200 border-none shadow-[0_0_15px_rgba(159,232,112,0.2)]"
                >
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-black" />
                      Autenticando...
                    </span>
                  ) : (
                    'Acessar Painel'
                  )}
                </Button>
              </form>
            </motion.div>
          )}

          {mode === 'forgot' && (
            <motion.div
              key="forgot-form"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.3 }}
            >
              <h1 className="text-2xl font-bold text-white mb-2 font-display text-center">
                Recuperar Senha
              </h1>
              <p className="text-sm text-text-secondary text-center mb-8">
                Informe seu e-mail cadastrado e enviaremos as instruções para você redefinir sua senha.
              </p>

              <form onSubmit={handleRecoverySubmit} className="w-full flex flex-col gap-5">
                {/* Campo de Email para Recuperação */}
                <div className="flex flex-col gap-1.5 relative">
                  <label htmlFor="recoveryEmail" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    E-mail cadastrado
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-4 w-4 text-text-tertiary" />
                    <Input
                      id="recoveryEmail"
                      name="recoveryEmail"
                      type="email"
                      required
                      placeholder="seu@email.com"
                      disabled={isPending}
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="w-full pl-10 bg-glass-1 border-border-subtle focus:border-accent text-white"
                    />
                  </div>
                </div>

                {/* Notificação de Erro */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-medium text-danger text-center bg-danger/10 border border-danger/20 rounded-lg p-3"
                  >
                    {error}
                  </motion.div>
                )}

                {/* Botões de Ação */}
                <div className="flex flex-col gap-3 mt-2">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full h-11 bg-accent hover:bg-accent-light text-black font-bold rounded-lg cursor-pointer transition-all duration-200 border-none shadow-[0_0_15px_rgba(159,232,112,0.2)]"
                  >
                    {isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-black" />
                        Processando...
                      </span>
                    ) : (
                      'Recuperar Senha'
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode('login');
                    }}
                    className="flex items-center justify-center gap-2 text-sm text-text-secondary hover:text-white transition-colors py-2 cursor-pointer mt-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar ao Login
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {mode === 'success' && (
            <motion.div
              key="success-form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center text-center"
            >
              <CheckCircle2 className="h-16 w-16 text-accent mb-4 drop-shadow-[0_0_10px_rgba(159,232,112,0.4)]" />
              <h1 className="text-2xl font-bold text-white mb-2 font-display">
                Instruções Enviadas!
              </h1>
              <p className="text-sm text-text-secondary mb-6">
                {recoverySuccessMessage}
              </p>

              {/* Bloco de simulação de e-mail local */}
              {debugLink && (
                <div className="w-full bg-[rgba(245,158,11,0.03)] border border-amber-500/20 rounded-xl p-5 mb-6 text-left">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider mb-2">
                    <ShieldAlert className="h-4 w-4" />
                    Ambiente Local (Simulação de E-mail)
                  </div>
                  <p className="text-xs text-text-secondary mb-3">
                    Como não há servidor de e-mail configurado localmente, clique no botão de desenvolvimento abaixo para redefinir a senha:
                  </p>
                  <a
                    href={debugLink}
                    className="inline-block w-full text-center bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold text-xs py-2 px-3 rounded-lg transition-all duration-200"
                  >
                    Redefinir Senha de Teste
                  </a>
                </div>
              )}

              <Button
                type="button"
                onClick={() => {
                  setRecoveryEmail('');
                  setDebugLink(null);
                  setMode('login');
                }}
                className="w-full h-11 bg-accent hover:bg-accent-light text-black font-bold rounded-lg cursor-pointer transition-all duration-200 border-none shadow-[0_0_15px_rgba(159,232,112,0.2)]"
              >
                Voltar ao Login
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

