import { ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPhoneVariants(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return [];

  const variants = new Set<string>();
  variants.add(cleaned);

  // Remove leading zero if present
  let base = cleaned;
  if (base.startsWith('0')) {
    base = base.substring(1);
    variants.add(base);
  }

  // If it starts with 55 (Brazil country code)
  if (base.startsWith('55') && base.length >= 12) {
    const withoutDDI = base.substring(2);
    variants.add(withoutDDI);

    // If it has 13 digits (mobile with 9th digit), e.g., 5511999999999
    if (base.length === 13) {
      const ddd = withoutDDI.substring(0, 2);
      const local = withoutDDI.substring(3); // skip the 9
      const without9 = '55' + ddd + local;
      variants.add(without9);
      variants.add(ddd + local);
    }
    // If it has 12 digits (mobile without 9th digit), e.g., 551199999999
    else if (base.length === 12) {
      const ddd = withoutDDI.substring(0, 2);
      const local = withoutDDI.substring(2);
      // Only mobiles get the 9th digit (first digit of local number is 6, 7, 8, or 9)
      if (['6', '7', '8', '9'].includes(local[0])) {
        const with9 = '55' + ddd + '9' + local;
        variants.add(with9);
        variants.add(ddd + '9' + local);
      }
    }
  } else {
    // Doesn't start with 55. Might be a number with DDD (10 or 11 digits)
    if (base.length === 10 || base.length === 11) {
      const withDDI = '55' + base;
      variants.add(withDDI);

      if (base.length === 11) {
        // Has 9th digit, e.g., 11999999999
        const ddd = base.substring(0, 2);
        const local = base.substring(3); // skip the 9
        variants.add(ddd + local);
        variants.add('55' + ddd + local);
      } else if (base.length === 10) {
        // No 9th digit, e.g., 1199999999
        const ddd = base.substring(0, 2);
        const local = base.substring(2);
        if (['6', '7', '8', '9'].includes(local[0])) {
          variants.add(ddd + '9' + local);
          variants.add('55' + ddd + '9' + local);
        }
      }
    }
  }

  return Array.from(variants);
}

export function isLikelyBrazilianPhoneId(value: string | null | undefined): boolean {
  const cleaned = (value || '').replace(/\D/g, '');
  if (!cleaned) return false;

  if (cleaned.startsWith('55')) {
    return cleaned.length === 12 || cleaned.length === 13;
  }

  return cleaned.length === 10 || cleaned.length === 11;
}

export function normalizeContactName(name: string | null | undefined): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isGenericWhatsAppName(
  name: string | null | undefined,
  whatsappId?: string | null,
  instanceName?: string | null
): boolean {
  const normalizedName = normalizeContactName(name);
  if (!normalizedName) return true;

  return (
    normalizedName === normalizeContactName(whatsappId) ||
    normalizedName === normalizeContactName(instanceName) ||
    normalizedName.includes('/b16') ||
    /^\d+$/.test(normalizedName)
  );
}
