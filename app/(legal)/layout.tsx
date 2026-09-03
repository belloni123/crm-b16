import type { Metadata } from 'next';

export function generateMetadata(): Metadata {
  return { robots: process.env.DEPLOYMENT_ENV === 'production' ? { index: true, follow: true } : { index: false, follow: false } };
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#090b0a] px-5 py-12 text-zinc-200"><article className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 leading-7 shadow-2xl sm:p-10">{children}</article></main>;
}
