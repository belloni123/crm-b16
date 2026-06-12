FROM node:20-slim

WORKDIR /app

# Instala openssl e ferramentas essenciais para compilação
RUN apt-get update -y && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copia arquivos de definição de dependências
COPY package.json package-lock.json* ./

# Instala dependências em produção
RUN npm install --legacy-peer-deps

# Copia os arquivos de código
COPY . .

# Executa o generate do Prisma
RUN npx prisma generate

# Executa o build da aplicação Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN NODE_OPTIONS="--max-old-space-size=1536" npm run build

# Expõe a porta que a aplicação roda
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Comando para iniciar (sincroniza o banco de dados antes de subir o servidor)
CMD ["sh", "-c", "npx prisma db push && npm run start"]
