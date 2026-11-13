import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import http from "http";
import { generateFinancialReconciliationReport } from "../../src/server/reconciliationReport.ts";
import { sendHttpError, UnauthorizedError, ForbiddenError } from "../../src/server/httpErrors.ts";

describe("FIN-05: Route-Level Financial Reconciliation Report Express Security Suite", () => {
  let app: express.Express;
  let server: http.Server;
  let serverUrl: string;
  let mockDb: any;

  const mockRequireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: missing or invalid token" });
    }
    const token = authHeader.split("Bearer ")[1];
    if (token === "token_unauthenticated_invalid") {
      return res.status(401).json({ error: "Unauthorized: invalid token" });
    }
    if (token === "token_regular_user") {
      (req as any).user = { uid: "user_regular_123", isAdmin: false };
      return next();
    }
    if (token === "token_admin_user") {
      (req as any).user = { uid: "admin_super_456", isAdmin: true };
      return next();
    }
    return res.status(401).json({ error: "Unauthorized" });
  };

  const mockRequireAdmin = [
    mockRequireAuth,
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Forbidden: requires admin privileges" });
      }
      next();
    },
  ];

  beforeEach(async () => {
    const docs = [
      {
        id: "doc_1",
        data: {
          jobId: "job_route_101",
          idempotencyKey: "release:job_route_101:q1:m1:key1",
          verifiedAmount: 10000,
          transferStatus: "completed",
          stripeTransferId: "tr_stripe_secret_9988776655443322",
          createdAt: "2026-11-10T10:00:00Z",
        },
      },
    ];

    mockDb = {
      collection: (colName: string) => {
        if (colName === "payment_ledger") {
          return {
            limit: (lim: number) => ({
              get: async () => ({
                docs: docs.slice(0, lim).map((d) => ({
                  id: d.id,
                  data: () => ({ ...d.data }),
                })),
              }),
            }),
          };
        }
        throw new Error(`Collection ${colName} not mocked`);
      },
    };

    app = express();
    app.use(express.json());

    app.get("/api/admin/financial-reconciliation/report", mockRequireAdmin, async (req, res) => {
      try {
        const caller = (req as any).user;
        const report = await generateFinancialReconciliationReport(mockDb, req.query, {
          uid: caller.uid,
          isAdmin: true,
        });
        res.json({ success: true, ...report });
      } catch (err: any) {
        sendHttpError(res, err, req);
      }
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr: any = server.address();
        serverUrl = `http://127.0.0.1:${addr.port}/api/admin/financial-reconciliation/report`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("Scenario 1: Unauthenticated request (missing/invalid token) is REJECTED with HTTP 401", async () => {
    const resNoAuth = await fetch(serverUrl);
    expect(resNoAuth.status).toBe(401);

    const resInvalidToken = await fetch(serverUrl, {
      headers: { Authorization: "Bearer token_unauthenticated_invalid" },
    });
    expect(resInvalidToken.status).toBe(401);
  });

  it("Scenario 2: Authenticated non-admin user request is REJECTED with HTTP 403 Forbidden", async () => {
    const resRegularUser = await fetch(serverUrl, {
      headers: { Authorization: "Bearer token_regular_user" },
    });
    expect(resRegularUser.status).toBe(403);
    const json = await resRegularUser.json();
    expect(json.error).toContain("Forbidden");
  });

  it("Scenario 3: Verified Admin user receives bounded, sanitized reconciliation report with masked identifiers", async () => {
    const resAdmin = await fetch(serverUrl, {
      headers: { Authorization: "Bearer token_admin_user" },
    });

    expect(resAdmin.status).toBe(200);
    const report = await resAdmin.json();

    expect(report.success).toBe(true);
    expect(report.isReadOnly).toBe(true);
    expect(report.recordsCount).toBe(1);

    const rec = report.records[0];
    expect(rec.jobId).toBe("job_route_101");
    expect(rec.formattedAmount).toBe("£100.00");

    const jsonString = JSON.stringify(report);
    expect(jsonString).not.toContain("tr_stripe_secret_9988776655443322");
    expect(rec.stripeTransferIdMasked).toBe("tr_s...3322");
  });

  it("Scenario 4: Invalid limit query parameters (> 100 or negative) fail closed with HTTP 400", async () => {
    const resOverLimit = await fetch(`${serverUrl}?limit=200`, {
      headers: { Authorization: "Bearer token_admin_user" },
    });
    expect(resOverLimit.status).toBe(400);

    const resNegative = await fetch(`${serverUrl}?limit=-5`, {
      headers: { Authorization: "Bearer token_admin_user" },
    });
    expect(resNegative.status).toBe(400);
  });
});
