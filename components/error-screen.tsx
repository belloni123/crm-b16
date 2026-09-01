'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Home,
  LogOut,
  RefreshCw,
  SearchX,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';

type ErrorScreenVariant = 'forbidden' | 'not-found' | 'unexpected';

interface ErrorScreenProps {
  variant: ErrorScreenVariant;
  eyebrow: string;
  title: string;
  description: string;
  guidance?: string;
  reference?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  onRetry?: () => void;
}

const VARIANT_STYLES = {
  forbidden: {
    icon: ShieldAlert,
    iconClass: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    glowClass: 'bg-amber-400/15',
  },
  'not-found': {
    icon: SearchX,
    iconClass: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
    glowClass: 'bg-sky-400/12',
  },
  unexpected: {
    icon: TriangleAlert,
    iconClass: 'border-red-400/25 bg-red-400/10 text-red-300',
    glowClass: 'bg-red-400/12',
  },
} as const;

export function ErrorScreen({
  variant,
  eyebrow,
  title,
  description,
  guidance,
  reference,
  primaryHref = '/project',
  primaryLabel = 'Voltar aos projetos',
  secondaryHref = '/',
  secondaryLabel = 'Ir para o início',
  onRetry,
}: ErrorScreenProps) {
  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-bg-base px-5 py-10 text-text-primary">
      <div aria-hidden="true" className={`absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${style.glowClass}`} />
      <div aria-hidden="true" className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />

      <section className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-border-subtle bg-bg-elevated/85 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />
        <div className="p-7 sm:p-10">
          <div className="mb-10 flex items-center justify-between gap-4">
            <Link href="/" aria-label="Ir para o início do CRM" className="relative block h-9 w-28">
              <Image src="/logo-white.png" alt="CRM B16" fill sizes="112px" className="logo-theme-white object-contain object-left" priority />
              <Image src="/logo-dark.png" alt="CRM B16" fill sizes="112px" className="logo-theme-dark object-contain object-left" priority />
            </Link>
            <span className="rounded-full border border-border-subtle bg-glass-3 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-text-secondary">
              {eyebrow}
            </span>
          </div>

          <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border ${style.iconClass}`}>
            <Icon className="h-7 w-7" aria-hidden="true" />
          </div>

          <h1 className="max-w-xl font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-text-secondary sm:text-base">
            {description}
          </p>

          {guidance && (
            <div className="mt-6 rounded-2xl border border-border-subtle bg-glass-2 p-4 text-sm leading-6 text-text-secondary">
              <span className="font-semibold text-text-primary">O que fazer agora: </span>
              {guidance}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-black transition hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Tentar novamente
              </button>
            ) : (
              <Link
                href={primaryHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-black transition hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
              >
                {variant === 'not-found' ? <Home className="h-4 w-4" aria-hidden="true" /> : <ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                {primaryLabel}
              </Link>
            )}

            <Link
              href={secondaryHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-glass-2 px-5 text-sm font-semibold text-text-primary transition hover:border-accent/40 hover:bg-glass-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {variant === 'forbidden' ? <LogOut className="h-4 w-4" aria-hidden="true" /> : <ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              {secondaryLabel}
            </Link>
          </div>

          {reference && (
            <p className="mt-7 break-all font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
              Referência para o suporte: {reference}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
