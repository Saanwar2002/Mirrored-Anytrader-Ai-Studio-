import { describe, it, expect, beforeEach } from "vitest";
import {
  executeAcceptRideCommand,
  assertAuthoritativeDriverEligibility,
} from "../../src/server/driverAuthorization.ts";
import {
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "../../src/server/httpErrors.ts";

/**
 * High-fidelity Firestore mock supporting authentic Transaction Isolation,
 * Optimistic Concurrency Control (OCC), document read-version tracking, staged writes,
 * and automatic transaction retry on concurrent write conflict.
 */
function createMockFirestore(initialData: Record<string, any> = {}) {
  const store: Record<string, any> = {};
  let totalConflicts = 0;
  let totalAttempts = 0;

  for (const [key, val] of Object.entries(initialData)) {
    store[key] = {
      ...JSON.parse(JSON.stringify(val)),
      _version: 1,
    };
  }

  const db: any = {
    _store: store,
    getStats: () => ({ totalConflicts, totalAttempts }),
    collection(collectionPath: string) {
      return {
        path: collectionPath,
        doc(docId?: string) {
          const actualDocId = docId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const fullPath = `${collectionPath}/${actualDocId}`;
          return {
            id: actualDocId,
            path: fullPath,
            async get() {
              await new Promise((r) => setTimeout(r, 0));
              const data = store[fullPath];
              return {
                id: actualDocId,
                exists: data !== undefined && data !== null,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
              };
            },
            async set(data: any, options?: { merge?: boolean }) {
              await new Promise((r) => setTimeout(r, 0));
              const current = store[fullPath];
              if (options?.merge && current) {
                store[fullPath] = {
                  ...current,
                  ...JSON.parse(JSON.stringify(data)),
                  _version: (current._version || 1) + 1,
                };
              } else {
                store[fullPath] = {
                  ...JSON.parse(JSON.stringify(data)),
                  _version: (current?._version || 0) + 1,
                };
              }
            },
            async update(data: any) {
              await new Promise((r) => setTimeout(r, 0));
              const current = store[fullPath];
              if (!current) throw new Error(`Document not found: ${fullPath}`);
              store[fullPath] = {
                ...current,
                ...JSON.parse(JSON.stringify(data)),
                _version: (current._version || 1) + 1,
              };
            },
            async delete() {
              await new Promise((r) => setTimeout(r, 0));
              delete store[fullPath];
            },
          };
        },
      };
    },
    async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
      const maxAttempts = 15;
      let attempt = 0;

      while (attempt < maxAttempts) {
        attempt++;
        totalAttempts++;
        const readVersions = new Map<string, number>();
        const pendingWrites: Array<() => void> = [];

        const transaction = {
          async get(docRef: any) {
            const path = docRef.path || `${docRef._colName}/${docRef._docId}`;
            const current = store[path];
            const currentVersion = current ? current._version : 0;
            readVersions.set(path, currentVersion);
            // Delay to simulate async network I/O and ensure concurrent readers capture the snapshot before commit
            await new Promise((r) => setTimeout(r, 15));

            return {
              id: docRef.id || docRef._docId,
              exists: current !== undefined && current !== null,
              data: () => (current ? JSON.parse(JSON.stringify(current)) : undefined),
            };
          },
          set(docRef: any, data: any, options?: { merge?: boolean }) {
            const fullPath = docRef.path || `${docRef._colName}/${docRef._docId}`;
            pendingWrites.push(() => {
              const current = store[fullPath];
              if (options?.merge && current) {
                store[fullPath] = {
                  ...current,
                  ...JSON.parse(JSON.stringify(data)),
                  _version: (current._version || 1) + 1,
                };
              } else {
                store[fullPath] = {
                  ...JSON.parse(JSON.stringify(data)),
                  _version: (current?._version || 0) + 1,
                };
              }
            });
          },
          update(docRef: any, data: any) {
            const fullPath = docRef.path || `${docRef._colName}/${docRef._docId}`;
            pendingWrites.push(() => {
              const current = store[fullPath];
              if (!current) throw new Error(`Document not found: ${fullPath}`);
              store[fullPath] = {
                ...current,
                ...JSON.parse(JSON.stringify(data)),
                _version: (current._version || 1) + 1,
              };
            });
          },
          delete(docRef: any) {
            const fullPath = docRef.path || `${docRef._colName}/${docRef._docId}`;
            pendingWrites.push(() => {
              delete store[fullPath];
            });
          },
        };

        try {
          const result = await updateFunction(transaction);

          // Commit Phase: Verify all read documents have not changed version (Optimistic Concurrency Control)
          let hasConflict = false;
          for (const [readPath, readVer] of readVersions.entries()) {
            const current = store[readPath];
            const currentVer = current ? current._version : 0;
            if (currentVer !== readVer) {
              hasConflict = true;
              break;
            }
          }

          if (hasConflict) {
            totalConflicts++;
            // Concurrent transaction committed first -> OCC Retry
            await new Promise((r) => setTimeout(r, Math.random() * 5 + 1));
            continue;
          }

          // No conflict -> Apply all staged writes atomically
          for (const writeOp of pendingWrites) {
            writeOp();
          }

          return result;
        } catch (err: any) {
          // If error happened, check if a concurrent write modified the documents in the interim.
          let hasConflict = false;
          for (const [readPath, readVer] of readVersions.entries()) {
            const current = store[readPath];
            const currentVer = current ? current._version : 0;
            if (currentVer !== readVer) {
              hasConflict = true;
              break;
            }
          }

          if (hasConflict && attempt < maxAttempts) {
            totalConflicts++;
            await new Promise((r) => setTimeout(r, Math.random() * 5 + 1));
            continue;
          }

          throw err;
        }
      }

      throw new Error("Transaction contention: maximum retry limit exceeded.");
    },
  };

  return db;
}

describe("Task 35-B: Driver Authorization & Ride Claiming Security Remediation", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockFirestore({
      "users/driver_legit": {
        uid: "driver_legit",
        role: "driver",
        isDriver: true,
        driverApproved: true,
        isDisabled: false,
        isSuspended: false,
        status: "active",
      },
      "users/driver_suspended": {
        uid: "driver_suspended",
        role: "driver",
        isDriver: true,
        isDisabled: true,
        isSuspended: true,
        status: "suspended",
      },
      "users/consumer_alice": {
        uid: "consumer_alice",
        role: "consumer",
        isDriver: false,
        isDisabled: false,
      },
      "ride_requests/ride_available_1": {
        rideId: "ride_available_1",
        passengerId: "consumer_alice",
        status: "pending",
        pickupAddress: "10 Downing St",
        dropoffAddress: "Heathrow Airport",
      },
    });
  });

  it("Test A — Legitimate driver can accept an available ride", async () => {
    const result = await executeAcceptRideCommand({
      db: mockDb,
      caller: { uid: "driver_legit" },
      body: { rideId: "ride_available_1" },
    });

    expect(result.success).toBe(true);
    expect(result.rideId).toBe("ride_available_1");
    expect(result.driverId).toBe("driver_legit");

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    const updatedRide = rideDoc.data();
    expect(updatedRide.status).toBe("accepted");
    expect(updatedRide.driverId).toBe("driver_legit");

    const driverStatusDoc = await mockDb.collection("driver_status").doc("driver_legit").get();
    const driverStatus = driverStatusDoc.data();
    expect(driverStatus.status).toBe("busy");
    expect(driverStatus.currentRideId).toBe("ride_available_1");
  });

  it("Test B — Normal consumer user cannot accept a ride", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "consumer_alice" },
        body: { rideId: "ride_available_1" },
      })
    ).rejects.toThrow(ForbiddenError);

    // Ride remains unclaimed
    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
    expect(rideDoc.data().driverId).toBeUndefined();
  });

  it("Test C — Client attempts isDriver=true in request body", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "consumer_alice" },
        body: { rideId: "ride_available_1", isDriver: true },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
    expect(rideDoc.data().driverId).toBeUndefined();
  });

  it("Test D — Client attempts role=driver in request body", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "consumer_alice" },
        body: { rideId: "ride_available_1", role: "driver" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
    expect(rideDoc.data().driverId).toBeUndefined();
  });

  it("Test E — User attempts to pass another driver's ID in request body", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "consumer_alice" },
        body: { rideId: "ride_available_1", driverId: "driver_legit" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
    expect(rideDoc.data().driverId).toBeUndefined();
  });

  it("Test F — Legitimate driver attempts to impersonate another driver ID", async () => {
    await mockDb.collection("users").doc("driver_bob").set({
      uid: "driver_bob",
      role: "driver",
      isDriver: true,
    });

    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "driver_legit" },
        body: { rideId: "ride_available_1", driverId: "driver_bob" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
    expect(rideDoc.data().driverId).toBeUndefined();
  });

  it("Test G — Suspended or disabled driver cannot accept a ride", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "driver_suspended" },
        body: { rideId: "ride_available_1" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
    expect(rideDoc.data().driverId).toBeUndefined();
  });

  it("Test H — Missing or invalid authentication token", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: null as any,
        body: { rideId: "ride_available_1" },
      })
    ).rejects.toThrow(UnauthorizedError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
    expect(rideDoc.data().driverId).toBeUndefined();
  });

  it("Test I — Genuine Concurrency: racing claims on same ride permit exactly 1 successful claim and trigger OCC retry/conflict", async () => {
    await mockDb.collection("users").doc("driver_2").set({
      uid: "driver_2",
      role: "driver",
      isDriver: true,
      driverApproved: true,
      isDisabled: false,
    });

    const contenders = ["driver_legit", "driver_2"];
    expect(contenders.length).toBe(2);

    // Launch genuine concurrent asynchronous ride-claim requests overlapping in the event loop
    const results = await Promise.allSettled([
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "driver_legit" },
        body: { rideId: "ride_available_1" },
      }),
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "driver_2" },
        body: { rideId: "ride_available_1" },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    // 1. Exactly 2 contenders
    expect(results.length).toBe(2);

    // 2. Exactly 1 successful claim
    expect(fulfilled.length).toBe(1);

    // 3. Exactly 1 failed claim
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const winnerDriverId = fulfilled[0].value.driverId;
    const loserDriverId = contenders.find((d) => d !== winnerDriverId)!;

    // 4. Winner is one of the two legitimate contenders
    expect(contenders).toContain(winnerDriverId);

    // 5. Final ride state verification
    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    const finalRideData = rideDoc.data();

    expect(finalRideData.status).toBe("accepted");
    expect(finalRideData.driverId).toBe(winnerDriverId);
    expect(finalRideData.driverId).not.toBe(loserDriverId);

    // 6. Proves loser cannot overwrite winner in driver_status
    const winnerStatusDoc = await mockDb.collection("driver_status").doc(winnerDriverId).get();
    expect(winnerStatusDoc.data()?.status).toBe("busy");
    expect(winnerStatusDoc.data()?.currentRideId).toBe("ride_available_1");

    const loserStatusDoc = await mockDb.collection("driver_status").doc(loserDriverId).get();
    expect(loserStatusDoc.data()?.currentRideId).toBeUndefined();

    // 7. OCC stats verify genuine overlap, conflict detection, and retry occurred
    const stats = mockDb.getStats();
    expect(stats.totalAttempts).toBeGreaterThanOrEqual(3); // 2 initial attempts + at least 1 retry
    expect(stats.totalConflicts).toBeGreaterThanOrEqual(1); // At least 1 OCC conflict detected
  });

  it("Test J — Admin user without driver role cannot accept a ride", async () => {
    await mockDb.collection("users").doc("admin_user").set({
      uid: "admin_user",
      role: "admin",
      isAdmin: true,
      isDriver: false,
    });

    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "admin_user", isAdmin: true },
        body: { rideId: "ride_available_1" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
  });

  it("Test K — User with memberId heuristic but without driver role is rejected", async () => {
    await mockDb.collection("users").doc("member_heuristic_user").set({
      uid: "member_heuristic_user",
      role: "consumer",
      memberId: "D-9999",
      isDriver: false,
    });

    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "member_heuristic_user" },
        body: { rideId: "ride_available_1" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = await mockDb.collection("ride_requests").doc("ride_available_1").get();
    expect(rideDoc.data().status).toBe("pending");
  });
});
