import { describe, it, expect } from "vitest";
import {
  executeBootstrapProfileCommand,
  bootstrapProfileSchema,
  capabilitiesFor,
  accountTypeFor,
} from "../../src/server/accountBootstrap.ts";
import { BadRequestError, ConflictError } from "../../src/server/httpErrors.ts";

function createMockFirestore() {
  const store: Record<string, any> = {};

  const db: any = {
    _store: store,
    collection: (col: string) => ({
      doc: (id: string) => ({
        id,
        path: `${col}/${id}`,
        async get() {
          const data = store[`${col}/${id}`];
          return {
            id,
            exists: data !== undefined,
            data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
          };
        },
      }),
    }),
    runTransaction: async (fn: any) => {
      const transaction = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: any, options?: any) => {
          const current = store[ref.path];
          if (options?.merge && current) {
            store[ref.path] = { ...current, ...JSON.parse(JSON.stringify(data)) };
          } else {
            store[ref.path] = JSON.parse(JSON.stringify(data));
          }
        },
        update: (ref: any, data: any) => {
          const current = store[ref.path];
          if (!current) throw new Error(`Document ${ref.path} does not exist`);
          store[ref.path] = { ...current, ...JSON.parse(JSON.stringify(data)) };
        },
      };
      return fn(transaction);
    },
  };

  return db;
}

describe("PL-02: Server-Authoritative Account Profile Initialization", () => {
  it("successfully creates a homeowner user profile with server-controlled defaults", async () => {
    const mockDb = createMockFirestore();
    const caller = { uid: "user_homeowner_1", email: "homeowner@example.com" };

    const result = await executeBootstrapProfileCommand(
      mockDb,
      caller,
      {
        role: "homeowner",
        name: "Jane Doe",
        phone: "07123456789",
        postcode: "SW1A 1AA",
        city: "London",
      },
      "127.0.0.1"
    );

    expect(result.success).toBe(true);
    expect(result.uid).toBe("user_homeowner_1");

    const createdUser = mockDb._store["users/user_homeowner_1"];
    expect(createdUser).toBeDefined();
    expect(createdUser.role).toBe("homeowner");
    expect(createdUser.accountType).toBe("consumer");
    expect(createdUser.capabilities).toEqual(["homeowner"]);
    expect(createdUser.tierId).toBe("Standard Homeowner");
    expect(createdUser.verificationStatus).toBe("unverified");
    expect(createdUser.fairnessScore).toBe(100);
    expect(createdUser.postcode).toBe("SW1A1AA");
  });

  it("successfully creates tradesperson and projects sanitized public_profiles doc", async () => {
    const mockDb = createMockFirestore();
    const caller = { uid: "user_trader_1", email: "trader@example.com" };

    const result = await executeBootstrapProfileCommand(
      mockDb,
      caller,
      {
        role: "tradesperson",
        name: "Bob Plumber",
        phone: "07987654321",
        postcode: "M1 1AE",
        city: "Manchester",
        trades: ["Plumbing"],
        subcategories: ["Emergency Repairs"],
      },
      "127.0.0.1"
    );

    expect(result.success).toBe(true);

    const createdUser = mockDb._store["users/user_trader_1"];
    expect(createdUser.role).toBe("tradesperson");
    expect(createdUser.accountType).toBe("service_provider");
    expect(createdUser.tierId).toBe("Free Explorer");

    const publicProfile = mockDb._store["public_profiles/user_trader_1"];
    expect(publicProfile).toBeDefined();
    expect(publicProfile.name).toBe("Bob Plumber");
    expect(publicProfile.role).toBe("tradesperson");
    expect(publicProfile.trades).toEqual(["Plumbing"]);
    expect(publicProfile.verificationStatus).toBe("unverified");
    expect(publicProfile.rating).toBe(0);
  });

  it("sets fleet_driver with driverApproved=false (fail-closed, PL-09)", async () => {
    const mockDb = createMockFirestore();
    const caller = { uid: "user_driver_1", email: "driver@example.com" };

    const result = await executeBootstrapProfileCommand(
      mockDb,
      caller,
      {
        role: "fleet_driver",
        name: "Dan Driver",
        phone: "07111222333",
        vehicleCategories: ["standard", "xl"],
        isPetFriendly: true,
      },
      "127.0.0.1"
    );

    expect(result.success).toBe(true);

    const createdUser = mockDb._store["users/user_driver_1"];
    expect(createdUser.role).toBe("fleet_driver");
    expect(createdUser.accountType).toBe("driver");
    expect(createdUser.driverApproved).toBe(false);
  });

  it("rejects unauthorized client-supplied role like admin (strict schema)", async () => {
    const mockDb = createMockFirestore();
    const caller = { uid: "user_attacker_1", email: "attacker@evil.com" };

    await expect(
      executeBootstrapProfileCommand(
        mockDb,
        caller,
        {
          role: "admin",
          name: "Attacker",
        },
        "127.0.0.1"
      )
    ).rejects.toThrow(BadRequestError);
  });

  it("rejects extra disallowed fields in payload (strict mode)", async () => {
    const mockDb = createMockFirestore();
    const caller = { uid: "user_attacker_2", email: "attacker2@evil.com" };

    await expect(
      executeBootstrapProfileCommand(
        mockDb,
        caller,
        {
          role: "homeowner",
          name: "Attacker",
          tierId: "Gotham Enterprise VIP", // Disallowed client field
        },
        "127.0.0.1"
      )
    ).rejects.toThrow(BadRequestError);
  });

  it("rejects duplicate profile creation with ConflictError", async () => {
    const mockDb = createMockFirestore();
    const caller = { uid: "user_existing_1", email: "existing@example.com" };

    await executeBootstrapProfileCommand(
      mockDb,
      caller,
      {
        role: "homeowner",
        name: "Existing User",
      },
      "127.0.0.1"
    );

    await expect(
      executeBootstrapProfileCommand(
        mockDb,
        caller,
        {
          role: "homeowner",
          name: "Existing User Again",
        },
        "127.0.0.1"
      )
    ).rejects.toThrow(ConflictError);
  });

  it("gracefully falls back to client when server Firestore encounters PERMISSION_DENIED (code 7)", async () => {
    const errorDb: any = {
      collection: () => ({
        doc: () => ({}),
      }),
      runTransaction: async () => {
        const err: any = new Error("7 PERMISSION_DENIED: Missing or insufficient permissions.");
        err.code = 7;
        throw err;
      },
    };

    const caller = { uid: "user_fallback_1", email: "user@example.com" };
    const result: any = await executeBootstrapProfileCommand(
      errorDb,
      caller,
      {
        role: "homeowner",
        name: "Fallback User",
        postcode: "E1 6AN",
      },
      "127.0.0.1"
    );

    expect(result.success).toBe(true);
    expect(result.uid).toBe("user_fallback_1");
    expect(result.fallbackToClient).toBe(true);
    expect(result.profileData).toBeDefined();
    expect(result.profileData.name).toBe("Fallback User");
    expect(result.profileData.role).toBe("homeowner");
  });
});
