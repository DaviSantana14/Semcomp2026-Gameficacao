import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionType,
  PrismaClient,
  UserRole,
  type Prisma,
} from '@prisma/client';
import { Pool } from 'pg';
import { buildDatabaseUrl } from '../src/prisma/database-url';

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({
      connectionString: buildDatabaseUrl(),
    }),
  ),
});

const adminUser = {
  name: 'Semcomp Admin',
  cpf: '11111111111',
  email: 'admin@semcomp.dev',
  role: UserRole.ADMIN,
} satisfies Prisma.UserCreateInput;

const sampleParticipant = {
  name: 'Participante Demo',
  cpf: '22222222222',
  email: 'participante@semcomp.dev',
  role: UserRole.PARTICIPANT,
} satisfies Prisma.UserCreateInput;

const sampleActions = [
  {
    name: 'Check-in Dia 1',
    description: 'Presença registrada no primeiro dia da Semcomp.',
    type: ActionType.CHECKIN,
    points: 10,
    isActive: true,
  },
  {
    name: 'Visita ao Stand Principal',
    description: 'Participante visitou o stand principal do evento.',
    type: ActionType.STAND_VISIT,
    points: 15,
    isActive: true,
  },
  {
    name: 'Pergunta em Palestra',
    description: 'Participante realizou uma pergunta durante uma palestra.',
    type: ActionType.QUESTION,
    points: 30,
    isActive: true,
  },
] satisfies Prisma.ActionCreateInput[];

async function upsertUser(user: Prisma.UserCreateInput) {
  return prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name,
      cpf: user.cpf,
      role: user.role,
      isActive: true,
    },
    create: user,
  });
}

async function upsertAction(action: Prisma.ActionCreateInput) {
  const existingAction = await prisma.action.findFirst({
    where: {
      name: action.name,
      type: action.type,
    },
  });

  if (existingAction) {
    return prisma.action.update({
      where: { id: existingAction.id },
      data: action,
    });
  }

  return prisma.action.create({
    data: action,
  });
}

async function main() {
  await upsertUser(adminUser);
  await upsertUser(sampleParticipant);

  for (const action of sampleActions) {
    await upsertAction(action);
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
