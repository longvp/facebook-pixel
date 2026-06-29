import { PrismaClient } from "@prisma/client";

// Clean slate before each E2E run so assertions don't see pixels left over from
// previous runs (the E2E DB persists between runs).
export default async function globalSetup() {
  const url =
    process.env.E2E_DATABASE_URL ??
    "mysql://root:@127.0.0.1:3306/facebook_pixel_e2e";
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.pixel.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}
