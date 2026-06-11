import { LgpdGuard } from '@/components/lgpd-guard';

export default function ProjectRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LgpdGuard>{children}</LgpdGuard>;
}
