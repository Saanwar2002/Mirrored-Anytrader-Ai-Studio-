import { describe, it, expect, beforeEach, vi } from "vitest";
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

describe("Task 35-B: Driver Authorization & Ride Claiming Security Remediation", () => {
  let mockUsersStore: Map<string, any>;
  let mockRidesStore: Map<string, any>;
  let mockDriverStatusStore: Map<string, any>;
  let mockDb: any;

  beforeEach(() => {
    mockUsersStore = new Map();
    mockRidesStore = new Map();
    mockDriverStatusStore = new Map();

    const makeDocRef = (colName: string, docId: string) => ({
      _colName: colName,
      _docId: docId,
      get: async () => {
        let data = null;
        if (colName === "users") data = mockUsersStore.get(docId);
        if (colName === "ride_requests") data = mockRidesStore.get(docId);
        if (colName === "driver_status") data = mockDriverStatusStore.get(docId);
        return {
          exists: !!data,
          data: () => (data ? { ...data } : null),
        };
      },
      set: async (data: any, _options?: any) => {
        if (colName === "driver_status") mockDriverStatusStore.set(docId, data);
        if (colName === "ride_requests") mockRidesStore.set(docId, data);
        return { id: docId };
      },
      update: async (data: any) => {
        if (colName === "ride_requests") {
          const current = mockRidesStore.get(docId) || {};
          mockRidesStore.set(docId, { ...current, ...data });
        }
        return { id: docId };
      },
    });

    let txChain = Promise.resolve();

    mockDb = {
      collection: (colName: string) => ({
        doc: (docId: string) => makeDocRef(colName, docId),
      }),
      runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
        const executeTx = async () => {
          const txWrapper = {
            get: async (docRef: any) => docRef.get(),
            update: (docRef: any, data: any) => {
              if (docRef._colName === "ride_requests") {
                const current = mockRidesStore.get(docRef._docId) || {};
                mockRidesStore.set(docRef._docId, { ...current, ...data });
              } else if (docRef._colName === "driver_status") {
                const current = mockDriverStatusStore.get(docRef._docId) || {};
                mockDriverStatusStore.set(docRef._docId, { ...current, ...data });
              }
            },
            set: (docRef: any, data: any, options?: any) => {
              if (docRef._colName === "driver_status") {
                const current = options?.merge ? (mockDriverStatusStore.get(docRef._docId) || {}) : {};
                mockDriverStatusStore.set(docRef._docId, { ...current, ...data });
              } else if (docRef._colName === "ride_requests") {
                const current = options?.merge ? (mockRidesStore.get(docRef._docId) || {}) : {};
                mockRidesStore.set(docRef._docId, { ...current, ...data });
              }
            },
          };

          return await updateFunction(txWrapper);
        };

        const resultPromise = txChain.then(() => executeTx());
        txChain = resultPromise.catch(() => {});
        return await resultPromise;
      },
    };

    // Seed test data
    mockUsersStore.set("driver_legit", {
      uid: "driver_legit",
      role: "driver",
      isDriver: true,
      isDisabled: false,
      isSuspended: false,
      status: "active",
    });

    mockUsersStore.set("driver_suspended", {
      uid: "driver_suspended",
      role: "driver",
      isDriver: true,
      isDisabled: true,
      isSuspended: true,
      status: "suspended",
    });

    mockUsersStore.set("consumer_alice", {
      uid: "consumer_alice",
      role: "consumer",
      isDriver: false,
      isDisabled: false,
    });

    mockRidesStore.set("ride_available_1", {
      rideId: "ride_available_1",
      passengerId: "consumer_alice",
      status: "pending",
      pickupAddress: "10 Downing St",
      dropoffAddress: "Heathrow Airport",
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

    const updatedRide = mockRidesStore.get("ride_available_1");
    expect(updatedRide.status).toBe("accepted");
    expect(updatedRide.driverId).toBe("driver_legit");

    const driverStatus = mockDriverStatusStore.get("driver_legit");
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
    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
    expect(rideDoc.driverId).toBeUndefined();
  });

  it("Test C — Client attempts isDriver=true in request body", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "consumer_alice" },
        body: { rideId: "ride_available_1", isDriver: true },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
    expect(rideDoc.driverId).toBeUndefined();
  });

  it("Test D — Client attempts role=driver in request body", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "consumer_alice" },
        body: { rideId: "ride_available_1", role: "driver" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
    expect(rideDoc.driverId).toBeUndefined();
  });

  it("Test E — User attempts to pass another driver's ID in request body", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "consumer_alice" },
        body: { rideId: "ride_available_1", driverId: "driver_legit" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
    expect(rideDoc.driverId).toBeUndefined();
  });

  it("Test F — Legitimate driver attempts to impersonate another driver ID", async () => {
    mockUsersStore.set("driver_bob", {
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

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
    expect(rideDoc.driverId).toBeUndefined();
  });

  it("Test G — Suspended or disabled driver cannot accept a ride", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: { uid: "driver_suspended" },
        body: { rideId: "ride_available_1" },
      })
    ).rejects.toThrow(ForbiddenError);

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
    expect(rideDoc.driverId).toBeUndefined();
  });

  it("Test H — Missing or invalid authentication token", async () => {
    await expect(
      executeAcceptRideCommand({
        db: mockDb,
        caller: null as any,
        body: { rideId: "ride_available_1" },
      })
    ).rejects.toThrow(UnauthorizedError);

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
    expect(rideDoc.driverId).toBeUndefined();
  });

  it("Test I — Concurrency: racing claims on same ride permit exactly 1 successful claim", async () => {
    mockUsersStore.set("driver_2", {
      uid: "driver_2",
      role: "driver",
      isDriver: true,
      isDisabled: false,
    });

    const [res1, res2] = await Promise.allSettled([
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

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejected = [res1, res2].filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const finalRideDoc = mockRidesStore.get("ride_available_1");
    expect(finalRideDoc.status).toBe("accepted");
    expect(["driver_legit", "driver_2"]).toContain(finalRideDoc.driverId);
  });

  it("Test J — Admin user without driver role cannot accept a ride", async () => {
    mockUsersStore.set("admin_user", {
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

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
  });

  it("Test K — User with memberId heuristic but without driver role is rejected", async () => {
    mockUsersStore.set("member_heuristic_user", {
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

    const rideDoc = mockRidesStore.get("ride_available_1");
    expect(rideDoc.status).toBe("pending");
  });
});
