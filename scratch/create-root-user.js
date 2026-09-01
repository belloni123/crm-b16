const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_ROOT_USER_UPDATE !== 'true') {
    throw new Error('Operação bloqueada. Defina ALLOW_ROOT_USER_UPDATE=true explicitamente.');
  }

  const email = process.env.ROOT_USER_EMAIL?.trim();
  const password = process.env.ROOT_USER_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Defina ROOT_USER_EMAIL e ROOT_USER_PASSWORD com pelo menos 12 caracteres.');
  }
  
  console.log(`Verificando se o usuário raiz "${email}" existe...`);
  
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  if (existingUser) {
    console.log('Usuário raiz encontrado. Atualizando senha e garantindo papel SUPERADMIN...');
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        role: 'SUPERADMIN',
      },
    });
    console.log('Usuário raiz atualizado com sucesso.');
  } else {
    console.log('Criando novo usuário raiz com acesso SUPERADMIN...');
    await prisma.user.create({
      data: {
        name: process.env.ROOT_USER_NAME?.trim() || 'Administrador',
        email,
        passwordHash,
        role: 'SUPERADMIN',
      },
    });
    console.log('Usuário raiz criado com sucesso.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
