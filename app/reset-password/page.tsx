'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, CheckCircle2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { resetPassword } from '@/app/actions/crm';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Token de redefinição inválido ou ausente.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsPending(true);

    try {
      const result = await resetPassword(token, password);
      if (result.success) {
        setIsSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao redefinir a senha. O token pode ter expirado.');
    } finally {
      setIsPending(false);
    }
  };

  if (!token) {
    return (
      <div className="w-full text-center">
        <div className="w-full bg-[rgba(239,68,68,0.03)] border border-red-500/20 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-center gap-2 text-red-400 font-semibold text-xs uppercase tracking-wider mb-2">
            <ShieldAlert className="h-5 w-5" />
            Token Ausente
          </div>
          <p className="text-xs text-text-secondary">
            Este link de redefinição é inválido ou expirou. Por favor, solicite uma nova redefinição de senha na tela de login.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => router.push('/')}
          className="w-full h-11 bg-accent hover:bg-accent-light text-black font-bold rounded-lg cursor-pointer transition-all"
        >
          Voltar ao Login
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!isSuccess ? (
          <motion.div
            key="reset-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-2xl font-bold text-white mb-2 font-display text-center">
              Criar Nova Senha
            </h1>
            <p className="text-sm text-text-secondary text-center mb-8">
              Digite e confirme a sua nova senha de acesso.
            </p>

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
              {/* Nova Senha */}
              <div className="flex flex-col gap-1.5 relative">
                <label htmlFor="password" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-text-tertiary" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    placeholder="Mínimo de 6 caracteres"
                    disabled={isPending}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 bg-glass-1 border-border-subtle focus:border-accent text-white"
                  />
                </div>
              </div>

              {/* Confirmar Senha */}
              <div className="flex flex-col gap-1.5 relative">
                <label htmlFor="confirmPassword" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-text-tertiary" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    placeholder="Confirme a nova senha"
                    disabled={isPending}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                      Redefinindo...
                    </span>
                  ) : (
                    'Salvar Nova Senha'
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="flex items-center justify-center gap-2 text-sm text-text-secondary hover:text-white transition-colors py-2 cursor-pointer mt-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Cancelar e Voltar
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="success-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center text-center"
          >
            <CheckCircle2 className="h-16 w-16 text-accent mb-4 drop-shadow-[0_0_10px_rgba(159,232,112,0.4)]" />
            <h1 className="text-2xl font-bold text-white mb-2 font-display">
              Senha Redefinida!
            </h1>
            <p className="text-sm text-text-secondary mb-6">
              Sua senha foi redefinida com sucesso. Agora você já pode entrar na plataforma com a sua nova senha.
            </p>

            <Button
              type="button"
              onClick={() => router.push('/')}
              className="w-full h-11 bg-accent hover:bg-accent-light text-black font-bold rounded-lg cursor-pointer transition-all duration-200 border-none shadow-[0_0_15px_rgba(159,232,112,0.2)]"
            >
              Ir para o Login
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main 
      className="flex-1 flex flex-col items-center justify-center p-6 bg-cover bg-center bg-no-repeat relative min-h-screen"
      style={{ backgroundImage: "url('/login-bg.jpg')" }}
    >
      {/* Dark overlay for contrast and premium look */}
      <div className="absolute inset-0 bg-[#050505]/75 pointer-events-none z-0" />

      <div className="w-full max-w-[420px] px-6 py-12 flex flex-col items-center justify-center relative z-10">
        {/* Logo superior */}
        <div className="relative mb-8 flex flex-col items-center">
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
          <div className="relative z-10">
            <img
              src="/logo.svg"
              alt="No Front Scale Logo"
              className="h-14 w-auto object-contain brightness-100 drop-shadow-[0_0_15px_rgba(159,232,112,0.4)]"
            />
          </div>
        </div>

        {/* Caixa do Formulário (Glassmorphism) */}
        <div className="w-full bg-glass-1 backdrop-blur-md border border-border-subtle border-l-[rgba(159,232,112,0.3)] rounded-2xl p-8 shadow-2xl overflow-hidden">
          <React.Suspense fallback={
            <div className="flex flex-col items-center justify-center text-text-secondary text-xs gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              Carregando formulário...
            </div>
          }>
            <ResetPasswordForm />
          </React.Suspense>
        </div>
      </div>
    </main>
  );
}
