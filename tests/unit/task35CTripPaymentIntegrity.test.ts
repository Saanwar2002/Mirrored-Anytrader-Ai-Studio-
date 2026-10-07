import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  executeCreateTripPaymentCommand,
} from "../../src/server/tripPaymentAuthorization.ts";
import {
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
} from "../../src/server/httpErrors.ts";

describe("Task 35-C: Trip Payment Recipient Integrity & Server-Authoritative Payee Resolution", () => {
  let mockDb: any;
  let mockStripe: any;
  let createdSessionPayloads: any[];

  beforeEach(() => {
    createdSessionPayloads = [];

    const store: Record<string, any> = {
      "users/driver_alice": {
        uid: "driver_alice",
        role: "driver",
        isDriver: true,
        stripeAccountId: "acct_alice_stripe_12345",
      },
      "users/driver_bob": {
        uid: "driver_bob",
        role: "driver",
        isDriver: true,
        stripeAccountId: "acct_bob_stripe_67890",
      },
      "users/driver_no_stripe": {
        uid: "driver_no_stripe",
        role: "driver",
        isDriver: true,
      },
      "users/attacker_user": {
        uid: "attacker_user",
        role: "consumer",
        stripeAccountId: "acct_attacker_stripe_99999",
      },
      "users/passenger_charlie": {
        uid: "passenger_charlie",
        role: "consumer",
      },
      "users/passenger_eve": {
        uid: "passenger_eve",
        role: "consumer",
      },
      "ride_requests/ride_trip_1": {
        rideId: "ride_trip_1",
        passengerId: "passenger_charlie",
        driverId: "driver_alice",
        assignedDriverId: "driver_alice",
        status: "in_transit",
        fare: 25.5,
        estimatedFare: 25.5,
      },
      "ride_requests/ride_trip_2": {
        rideId: "ride_trip_2",
        passengerId: "passenger_eve",
        driverId: "driver_bob",
        assignedDriverId: "driver_bob",
        status: "completed",
        fare: 40.0,
      },
      "ride_requests/ride_no_driver": {
        rideId: "ride_no_driver",
        passengerId: "passenger_charlie",
        status: "pending",
        fare: 15.0,
      },
      "ride_requests/ride_unonboarded_driver": {
        rideId: "ride_unonboarded_driver",
        passengerId: "passenger_charlie",
        driverId: "driver_no_stripe",
        assignedDriverId: "driver_no_stripe",
        status: "in_transit",
        fare: 30.0,
      },
      "ride_requests/ride_conflicting_drivers": {
        rideId: "ride_conflicting_drivers",
        passengerId: "passenger_charlie",
        driverId: "driver_alice",
        assignedDriverId: "driver_bob", // Conflicting!
        status: "in_transit",
        fare: 50.0,
      },
      "ride_requests/ride_no_fare": {
        rideId: "ride_no_fare",
        passengerId: "passenger_charlie",
        driverId: "driver_alice",
        assignedDriverId: "driver_alice",
        status: "in_transit",
        fare: 0,
      },
      "ride_requests/ride_hundred": {
        rideId: "ride_hundred",
        passengerId: "passenger_charlie",
        driverId: "driver_alice",
        assignedDriverId: "driver_alice",
        status: "completed",
        fare: 100.0,
      },
    };

    mockDb = {
      collection(colName: string) {
        return {
          doc(docId: string) {
            const fullPath = `${colName}/${docId}`;
            return {
              id: docId,
              path: fullPath,
              async get() {
                const data = store[fullPath];
                return {
                  id: docId,
                  exists: data !== undefined && data !== null,
                  data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
                };
              },
            };
          },
        };
      },
    };

    mockStripe = {
      checkout: {
        sessions: {
          create: vi.fn(async (params: any) => {
            createdSessionPayloads.push(params);
            return {
              id: `cs_test_${Date.now()}`,
              url: `https://checkout.stripe.com/c/pay/cs_test_${Date.now()}`,
              payment_intent: `pi_test_${Date.now()}`,
            };
          }),
        },
      },
    };
  });

  it("Test A — Legitimate payment: Valid authorized trip payment succeeds and uses actual authoritative recipient", async () => {
    const result = await executeCreateTripPaymentCommand({
      db: mockDb,
      caller: { uid: "passenger_charlie" },
      body: {
        rideId: "ride_trip_1",
        tipAmount: 5,
      },
      stripeClient: mockStripe,
      appUrl: "https://anytrader.test",
    });

    expect(result.success).toBe(true);
    expect(result.rideId).toBe("ride_trip_1");
    expect(result.driverId).toBe("driver_alice");
    expect(result.recipientId).toBe("driver_alice");
    expect(result.stripeAccountId).toBe("acct_alice_stripe_12345");
    expect(result.effectiveBaseFare).toBe(25.5);
    expect(result.sanitizedTip).toBe(5);
    expect(result.totalAmount).toBe(30.5);

    // Verify Stripe payload was created strictly for driver_alice's Stripe Connect account
    expect(createdSessionPayloads.length).toBe(1);
    const session = createdSessionPayloads[0];
    expect(session.payment_intent_data.transfer_data.destination).toBe("acct_alice_stripe_12345");
    expect(session.metadata.driverId).toBe("driver_alice");
    expect(session.metadata.recipientId).toBe("driver_alice");
    expect(session.metadata.stripeAccountId).toBe("acct_alice_stripe_12345");
    expect(session.metadata.passengerId).toBe("passenger_charlie");
    expect(session.line_items[0].price_data.unit_amount).toBe(3050); // £30.50 in pence
  });

  it("Test B — Arbitrary recipient: Client attempts recipientId='attacker-user'", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_trip_1",
          recipientId: "attacker_user",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(ForbiddenError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test C — Another driver's ID: Client attempts driverId='driver_bob' on a ride assigned to driver_alice", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_trip_1",
          driverId: "driver_bob",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(ForbiddenError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test D — Another Stripe account: Client attempts stripeAccountId='acct_attacker_stripe_99999'", async () => {
    const result = await executeCreateTripPaymentCommand({
      db: mockDb,
      caller: { uid: "passenger_charlie" },
      body: {
        rideId: "ride_trip_1",
        stripeAccountId: "acct_attacker_stripe_99999",
      },
      stripeClient: mockStripe,
    });

    expect(result.success).toBe(true);
    // Verified that client-supplied stripeAccountId is ignored and authoritative destination is used
    expect(result.stripeAccountId).toBe("acct_alice_stripe_12345");
    expect(createdSessionPayloads[0].payment_intent_data.transfer_data.destination).toBe("acct_alice_stripe_12345");
  });

  it("Test E — Connected account substitution: Client attempts connectedAccountId / destinationAccountId overrides", async () => {
    const result = await executeCreateTripPaymentCommand({
      db: mockDb,
      caller: { uid: "passenger_charlie" },
      body: {
        rideId: "ride_trip_1",
        connectedAccountId: "acct_attacker_stripe_99999",
        destinationAccountId: "acct_attacker_stripe_99999",
        transferDestination: "acct_attacker_stripe_99999",
      },
      stripeClient: mockStripe,
    });

    expect(result.success).toBe(true);
    expect(result.stripeAccountId).toBe("acct_alice_stripe_12345");
    expect(createdSessionPayloads[0].payment_intent_data.transfer_data.destination).toBe("acct_alice_stripe_12345");
  });

  it("Test F — Conflicting recipient: Supply a valid driver ID that conflicts with authoritative trip driver", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_trip_1",
          driverUid: "driver_bob",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(ForbiddenError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test G — Missing recipient: Client provides rideId without driverId or recipientId", async () => {
    const result = await executeCreateTripPaymentCommand({
      db: mockDb,
      caller: { uid: "passenger_charlie" },
      body: {
        rideId: "ride_trip_1",
      },
      stripeClient: mockStripe,
    });

    expect(result.success).toBe(true);
    expect(result.driverId).toBe("driver_alice");
    expect(result.recipientId).toBe("driver_alice");
    expect(result.stripeAccountId).toBe("acct_alice_stripe_12345");
    expect(createdSessionPayloads[0].payment_intent_data.transfer_data.destination).toBe("acct_alice_stripe_12345");
  });

  it("Test H — Cross-trip recipient: Attempting to process ride_trip_2 using ride_trip_1 driverId", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_eve" },
        body: {
          rideId: "ride_trip_2",
          driverId: "driver_alice", // ride_trip_2 belongs to driver_bob
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(ForbiddenError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test I — Unauthorized caller: Third-party user cannot trigger trip payment for another user's ride", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "attacker_user" },
        body: {
          rideId: "ride_trip_1",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(ForbiddenError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test J — Unauthenticated caller: Fails with UnauthorizedError", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: null as any,
        body: {
          rideId: "ride_trip_1",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("Test K — Driver without completed Stripe onboarding is rejected", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_unonboarded_driver",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("Test L — Non-existent ride is rejected", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "non_existent_ride_999",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("Test M — Ride without assigned driver is rejected", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_no_driver",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("Test 1 (R1) — Conflicting driverId and assignedDriverId cannot silently select a recipient (fails closed)", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_conflicting_drivers",
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(BadRequestError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test 2 (R1) — Missing authoritative fare + client amount is rejected", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_no_fare",
          amount: 1,
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(BadRequestError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test 3 (R1) — Missing authoritative fare + client baseFare is rejected", async () => {
    await expect(
      executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_charlie" },
        body: {
          rideId: "ride_no_fare",
          baseFare: 1,
        },
        stripeClient: mockStripe,
      })
    ).rejects.toThrow(BadRequestError);

    expect(createdSessionPayloads.length).toBe(0);
  });

  it("Test 4 (R1) — Client amount cannot override an existing authoritative fare (£100 ride with client amount £1)", async () => {
    const result = await executeCreateTripPaymentCommand({
      db: mockDb,
      caller: { uid: "passenger_charlie" },
      body: {
        rideId: "ride_hundred",
        amount: 1,
        baseFare: 1,
      },
      stripeClient: mockStripe,
    });

    expect(result.success).toBe(true);
    expect(result.effectiveBaseFare).toBe(100.0);
    expect(result.totalAmount).toBe(100.0);

    // Verify Stripe line item is strictly £100 (10000 pence), NOT £1 (100 pence)
    expect(createdSessionPayloads.length).toBe(1);
    expect(createdSessionPayloads[0].line_items[0].price_data.unit_amount).toBe(10000);
  });
});
