import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

const orgs = [
  { name: "Lahore Dental Clinic", slug: "lahore-dental", prefix: "Dental Checkup" },
  { name: "Peak Fitness Studio", slug: "peak-fitness", prefix: "Training Session" },
  { name: "Zenith Coworking", slug: "zenith-coworking", prefix: "Meeting Room" },
];

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  for (const org of orgs) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: org.slug },
      update: {},
      create: { name: org.name, slug: org.slug },
    });

    const roles: Record<string, string> = {};
    for (const name of ["OWNER", "ADMIN", "MEMBER"]) {
      const r = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name } },
        update: {},
        create: { tenantId: tenant.id, name },
      });
      roles[name] = r.id;
    }

    const people = [
      { email: "owner@example.com", name: "Owner", role: "OWNER" },
      { email: "admin@example.com", name: "Admin", role: "ADMIN" },
      { email: "ali@example.com", name: "Ali", role: "MEMBER" },
      { email: "sara@example.com", name: "Sara", role: "MEMBER" },
    ];

    const users = [];
    for (const p of people) {
      users.push(
        await prisma.user.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email: p.email } },
          update: {},
          create: {
            tenantId: tenant.id,
            roleId: roles[p.role],
            email: p.email,
            name: p.name,
            passwordHash,
          },
        })
      );
    }

    const existing = await prisma.booking.count({ where: { tenantId: tenant.id } });
    if (existing === 0) {
      const statuses = ["CONFIRMED", "PENDING", "CANCELLED"];
      for (let i = 0; i < 12; i++) {
        const start = new Date();
        start.setDate(start.getDate() + i - 3);
        start.setHours(9 + (i % 8), 0, 0, 0);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        await prisma.booking.create({
          data: {
            tenantId: tenant.id,
            userId: users[i % users.length].id,
            title: `${org.prefix} #${i + 1}`,
            startsAt: start,
            endsAt: end,
            status: statuses[i % 3],
          },
        });
      }
    }
  }
  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());