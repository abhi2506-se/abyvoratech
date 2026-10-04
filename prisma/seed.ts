import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Tenant-scoped models that gained a nullable `organizationId` column in the
 * Platform Owner / multi-tenant migration. Listed once here so the backfill
 * below and any future tenant-scope tooling stay in sync with the schema.
 */
const TENANT_SCOPED_MODELS = [
  "client", "lead", "project", "payment", "invoice", "refund",
  "supportTicket", "proposal", "task", "commission", "emailThread",
  "document", "websiteAudit", "auditLog",
] as const;

/**
 * Ensures every pre-existing row (created before the multi-tenant layer
 * existed) belongs to a real Organization rather than floating with a null
 * organizationId. This keeps the data model consistent going forward and
 * lets tenant-scoped queries use a single `organizationId: X` filter
 * everywhere instead of a `organizationId: X OR null` special case.
 *
 * Idempotent and safe to re-run: every step only acts on rows that still
 * have organizationId = null, and the Organization/User upserts key off a
 * fixed slug/email so re-running never creates duplicates.
 */
async function backfillDefaultOrganization() {
  const defaultOrg = await prisma.organization.upsert({
    where: { slug: "abyvora-internal" },
    update: {},
    create: {
      name: "ABYVORA Technologies (Internal)",
      legalName: "ABYVORA Technologies",
      slug: "abyvora-internal",
      status: "ACTIVE",
      approvedAt: new Date(),
    },
  });

  // Every pre-existing ADMIN/AGENT/CLIENT/IT_SUPPORT user and all of their
  // records belong, conceptually, to ABYVORA itself acting as its own first
  // tenant. Backfilling them keeps old and new code paths consistent.
  const userResult = await prisma.user.updateMany({
    where: { organizationId: null, role: { in: ["ADMIN", "AGENT", "CLIENT", "IT_SUPPORT"] } },
    data: { organizationId: defaultOrg.id },
  });

  const results: Record<string, number> = { user: userResult.count };
  for (const model of TENANT_SCOPED_MODELS) {
    // @ts-expect-error — dynamic model access by name, all of these share
    // the same `organizationId: string | null` shape being backfilled here.
    const result = await prisma[model].updateMany({
      where: { organizationId: null },
      data: { organizationId: defaultOrg.id },
    });
    results[model] = result.count;
  }

  console.log("Backfilled default Organization:", defaultOrg.slug);
  console.table(results);
  return defaultOrg;
}

async function seedPlatformOwner() {
  const email = process.env.SEED_PLATFORM_OWNER_EMAIL;
  const password = process.env.SEED_PLATFORM_OWNER_PASSWORD;
  const name = process.env.SEED_PLATFORM_OWNER_NAME || "Platform Owner";

  if (!email || !password) {
    console.log(
      "SEED_PLATFORM_OWNER_EMAIL / SEED_PLATFORM_OWNER_PASSWORD not set — skipping Platform Owner seed."
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Platform Owner ${email} already exists — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // Platform Owner is intentionally NOT attached to any Organization
  // (organizationId stays null) — it is the one role with cross-tenant
  // visibility, enforced server-side in lib/authz.ts, never by this flag
  // alone.
  await prisma.user.create({
    data: { email, name, passwordHash, role: "PLATFORM_OWNER", status: "ACTIVE" },
  });
  console.log(`Created Platform Owner: ${email}`);
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Platform Admin";

  if (!email || !password) {
    console.error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables before running the seed."
    );
    process.exit(1);
  }

  const defaultOrg = await backfillDefaultOrganization();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists — skipping.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        organizationId: defaultOrg.id,
      },
    });

    console.log(`Created admin user: ${email}`);
  }

  await seedPlatformOwner();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
