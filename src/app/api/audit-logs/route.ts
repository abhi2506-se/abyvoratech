import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, toApiError } from "@/lib/authz";
import type { Prisma } from "@prisma/client";

// Admin-only: agents must never be able to read or filter the audit trail,
// including their own entries — enforced server-side, not just hidden in the UI.
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q"); // matches actor name or email
    const action = searchParams.get("action");
    const role = searchParams.get("role");
    const entityType = searchParams.get("entityType");
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const format = searchParams.get("format"); // "csv" for export
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "50")));

    const where: Prisma.AuditLogWhereInput = {
      ...(q
        ? {
            OR: [
              { actorName: { contains: q, mode: "insensitive" } },
              { actorEmail: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(role ? { actorRole: role as any } : {}),
      ...(entityType ? { entityType } : {}),
      ...(status ? { status: status as any } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    if (format === "csv") {
      const rows = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const header = [
        "createdAt",
        "actorName",
        "actorEmail",
        "actorRole",
        "action",
        "entityType",
        "entityId",
        "description",
        "status",
        "ipAddress",
      ];
      const csvRows = rows.map((r) =>
        [
          r.createdAt.toISOString(),
          r.actorName ?? "",
          r.actorEmail ?? "",
          r.actorRole,
          r.action,
          r.entityType,
          r.entityId ?? "",
          (r.description ?? "").replace(/"/g, '""'),
          r.status,
          r.ipAddress ?? "",
        ]
          .map((v) => `"${String(v)}"`)
          .join(",")
      );
      const csv = [header.join(","), ...csvRows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, pageSize });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
