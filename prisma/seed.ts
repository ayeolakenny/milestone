import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const purchasesGroup = await prisma.achievementGroup.upsert({
    where: { key: 'purchases' },
    update: {},
    create: { key: 'purchases', name: 'Purchases' },
  });

  await prisma.achievement.createMany({
    data: [
      {
        groupId: purchasesGroup.id,
        key: 'first_purchase',
        name: 'First Purchase',
        threshold: 1,
        order: 1,
      },
      {
        groupId: purchasesGroup.id,
        key: 'five_purchases',
        name: '5 Purchases',
        threshold: 5,
        order: 2,
      },
      {
        groupId: purchasesGroup.id,
        key: 'ten_purchases',
        name: '10 Purchases',
        threshold: 10,
        order: 3,
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seeded achievement groups and achievements');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
