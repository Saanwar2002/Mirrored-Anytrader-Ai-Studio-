/**
 * Domain Event Dispatcher & Audit Log Layer for AnyTrader V6
 * Records immutable, structured business events for state transitions and auditability.
 */
import crypto from "crypto";

export type DomainEventType =
  | "JOB_CREATED"
  | "JOB_CANCELLED"
  | "JOB_ACCEPTED"
  | "JOB_STARTED"
  | "JOB_COMPLETED"
  | "JOB_DISPUTED"
  | "QUOTE_CREATED"
  | "QUOTE_SUBMITTED"
  | "QUOTE_UPDATED"
  | "QUOTE_WITHDRAWN"
  | "QUOTE_REJECTED"
  | "REQUOTE_REQUESTED"
  | "REQUOTE_RESPONDED"
  | "QUOTE_ACCEPTED"
  | "MILESTONE_FUNDED"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_RELEASED"
  | "PAYMENT_INITIATED"
  | "PAYMENT_CAPTURED"
  | "FUNDS_DISBURSED"
  | "REFUND_PROCESSED"
  | "DRIVER_PAYOUT_INITIATED"
  | "PROVIDER_PAYOUT_INITIATED"
  | "REVIEW_SUBMITTED"
  | "DISPUTE_OPENED"
  | "DISPUTE_RESOLVED"
  | "RIDE_REQUESTED"
  | "RIDE_ACCEPTED"
  | "RIDE_COMPLETED"
  | "SECURITY_BREACH_DETECTED";

export interface DomainEvent<T = any> {
  eventId: string;
  eventType: DomainEventType;
  aggregateId: string;
  actorId: string;
  payload: T;
  timestamp: string;
  correlationId?: string;
}

export type DomainEventHandler = (event: DomainEvent<any>) => Promise<void> | void;

class DomainEventEmitter {
  private handlers = new Map<DomainEventType, Set<DomainEventHandler>>();

  public on(eventType: DomainEventType, handler: DomainEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  public off(eventType: DomainEventType, handler: DomainEventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  public async dispatch<T = Record<string, any>>(
    eventType: DomainEventType,
    aggregateId: string,
    actorId: string,
    payload: T,
    correlationId?: string,
    firestoreDb?: any
  ): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      eventId: correlationId
        ? `evt_${crypto.createHash("sha256").update(eventType + ":" + aggregateId + ":" + correlationId).digest("hex").substring(0, 32)}`
        : `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      eventType,
      aggregateId,
      actorId,
      payload,
      timestamp: new Date().toISOString(),
      correlationId: correlationId || `corr_${Date.now()}`,
    };

    console.log(`[DomainEvent: ${eventType}] Aggregate: ${aggregateId} | Actor: ${actorId}`);

    // Persist correlated events once. A stable event ID plus a transaction prevents
    // webhook retries from creating duplicate audit records or re-running handlers.
    if (firestoreDb) {
      try {
        const eventRef = firestoreDb.collection("domain_events").doc(event.eventId);
        if (correlationId && typeof firestoreDb.runTransaction === "function") {
          const created = await firestoreDb.runTransaction(async (transaction: any) => {
            const existing = await transaction.get(eventRef);
            if (existing.exists) return false;
            // set() is supported by both Firestore transactions and the lightweight
            // transaction adapters used by callers/tests. The preceding read makes
            // this deterministic-ID write concurrency-safe for correlated events.
            transaction.set(eventRef, event);
            return true;
          });
          if (!created) return event;
        } else {
          await eventRef.set(event);
        }
      } catch (dbErr: any) {
        if (correlationId) {
          // Correlated financial/business events must be durable before the caller
          // acknowledges success; propagate so Stripe or the caller can retry.
          throw dbErr;
        }
        console.warn(`[DomainEvent Persistence Notice] Failed to persist event ${event.eventId}:`, dbErr?.message);
      }
    }

    // Trigger in-process registered listeners asynchronously
    const registered = this.handlers.get(eventType);
    if (registered && registered.size > 0) {
      for (const handler of registered) {
        try {
          await handler(event);
        } catch (handlerErr: any) {
          console.error(`[DomainEvent Handler Error] Failed processing ${eventType}:`, handlerErr);
        }
      }
    }

    return event;
  }
}

export const domainEvents = new DomainEventEmitter();
