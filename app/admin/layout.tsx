import { LgpdGuard } from '@/components/lgpd-guard';

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LgpdGuard>{children}</LgpdGuard>;
}
