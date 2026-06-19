import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

export type AuthResult =
  | { authenticated: true; projectId: string; prefix: string }
  | { authenticated: false; error: string; status: number };

// Helper para obter/criar o store global do rate limiter (evitando reset no dev hot-reload)
const globalRef = globalThis as any;
if (!globalRef.rateLimitStore) {
  globalRef.rateLimitStore = new Map<string, number[]>();
}
const rateLimitStore: Map<string, number[]> = globalRef.rateLimitStore;

/**
 * Autentica uma requisição com base no header de API Key
 */
export async function authenticateApiKey(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('x-api-key') || '';
  
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    token = authHeader.trim();
  }

  if (!token) {
    return {
      authenticated: false,
      error: 'Chave de API não fornecida nos headers (Authorization ou x-api-key).',
      status: 401
    };
  }

  if (token.length < 12 || (!token.startsWith('b16_') && !token.startsWith('nfs_'))) {
    return {
      authenticated: false,
      error: 'Formato de chave de API inválido. Deve começar com "b16_" ou "nfs_".',
      status: 401
    };
  }

  // Extrai o prefixo (primeiros 12 caracteres, ex: nfs_a1b2c3d4)
  const prefix = token.substring(0, 12);

  // Busca o projeto pelo prefixo indexado
  const project = await prisma.project.findUnique({
    where: { apiKeyPrefix: prefix },
    select: { id: true, apiKeyHash: true }
  });

  if (!project || !project.apiKeyHash) {
    return {
      authenticated: false,
      error: 'Chave de API inválida ou revogada.',
      status: 401
    };
  }

  // Compara a chave completa recebida com o hash bcrypt salvo
  const isMatch = bcrypt.compareSync(token, project.apiKeyHash);
  if (!isMatch) {
    return {
      authenticated: false,
      error: 'Chave de API inválida.',
      status: 401
    };
  }

  return {
    authenticated: true,
    projectId: project.id,
    prefix
  };
}

/**
 * Aplica limitação de requisições baseada em janela deslizante (Sliding Window)
 * Limite padrão: 60 requisições por minuto
 */
export function isRateLimited(prefix: string, limitPerMinute: number = 60): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  
  let requests = rateLimitStore.get(prefix) || [];
  
  // Filtra timestamps fora da janela de 1 minuto
  requests = requests.filter(timestamp => now - timestamp < windowMs);
  
  if (requests.length >= limitPerMinute) {
    const oldestTimestamp = requests[0];
    const msToWait = windowMs - (now - oldestTimestamp);
    const retryAfter = Math.ceil(msToWait / 1000);
    
    return {
      allowed: false,
      retryAfter: retryAfter > 0 ? retryAfter : 1
    };
  }
  
  // Adiciona a requisição atual
  requests.push(now);
  rateLimitStore.set(prefix, requests);
  
  return {
    allowed: true
  };
}
