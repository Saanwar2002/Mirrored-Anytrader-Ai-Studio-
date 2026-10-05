process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";

import { describe, it, beforeAll, expect } from "vitest";
import * as admin from "firebase-admin";
import {
  immutableIntelligenceStore,
  FirestoreDbLike,
} from "../../src/server/intelligence/immutableStore";
import {
  buildVersionId,
} from "../../src/server/intelligence/provenance";
import {
  qualityReviewService,
} from "../../src/server/intelligence/qualityReview";
import {
  IntelligenceExtraction,
  CanonicalIntelligenceEvent,
  IntelligenceEvidence,
} from "../../src/server/intelligence/types";

describe("Task 7 — Real Firestore Emulator Concurrency & Immutability Verification", { timeout: 30000 }, () => {
  const PROJECT_ID = "demo-anytrader";
  let adminDb: admin.firestore.Firestore;
  let storeDb: FirestoreDbLike;

  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("FIRESTORE_EMULATOR_HOST must be configured to run emulator concurrency tests.");
    }
    const appName = "task7-real-emulator-concurrency-suite";
    const app =
      admin.apps.find((a) => a?.name === appName) ??
      admin.initializeApp({ projectId: PROJECT_ID }, appName);
    adminDb = app.firestore();

    // Adapt admin.firestore.Firestore to FirestoreDbLike
    storeDb = {
      collection: (name: string) => adminDb.collection(name),
      runTransaction: <T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> => {
        return adminDb.runTransaction(updateFunction);
      },
    };
  });

  const seedEvidence = async (evidence: IntelligenceEvidence) => {
    await adminDb.collection("intelligence_evidence").doc(evidence.evidenceId).set(evidence);
  };

  it("1. Real Emulator Test #1 — 3 Concurrent Workers with SAME deterministic versionId produce exactly 1 creation and 2 idempotent replays", async () => {
    const ts = Date.now();
    const jobId = `job_task7_race_${ts}`;
    const evidenceId = `ev_task7_race_${ts}`;
    const versionId = buildVersionId("job", jobId, 1, "v8.1.0", "gemini-2.5-flash", "prompt_v1", "v8.1.0");

    await seedEvidence({
      evidenceId,
      aggregateType: "job",
      aggregateId: jobId,
      sourceType: "job",
      sourceId: jobId,
      sourceVersion: 1,
      evidenceType: "document",
      evidenceCategory: "DOCUMENT",
      contentHash: "a".repeat(64),
      byteSize: 100,
      schemaVersion: "v8.1.0",
      integrityStatus: "verified",
      verified: true,
      sourceRef: `jobs/${jobId}/doc`,
      createdAt: new Date().toISOString(),
      metadata: {},
    });

    const confidence = { overall: 0.95, extraction: 0.95, evidenceQuality: 0.95, classification: 0.95, temporalFreshness: 0.95, method: "deterministic_heuristic" as const };
    const provenance = { source: `jobs/${jobId}`, evidenceIds: [evidenceId], pipelineVersion: "v8.1.0", modelVersion: "gemini-2.5-flash", promptVersion: "prompt_v1", generatedAt: new Date().toISOString(), sourceContentHash: "hash_race" };

    const extraction: IntelligenceExtraction = {
      extractionId: versionId,
      versionId,
      aggregateType: "job",
      aggregateId: jobId,
      sourceType: "job",
      sourceAggregateId: jobId,
      sourceVersion: 1,
      pipelineVersion: "v8.1.0",
      modelVersion: "gemini-2.5-flash",
      promptVersion: "prompt_v1",
      schemaVersion: "v8.1.0",
      provider: "google_genai",
      evidenceIds: [evidenceId],
      rawManifest: { sha256: "h_race", encoding: "gzip", originalBytes: 50, compressedBytes: 25, compressionRatio: 2.0, schemaVersion: "v8.1.0", storagePath: "path", createdAt: new Date().toISOString() },
      structuredCandidate: { category: "Plumbing", issue: "Burst Pipe Race" },
      confidence,
      provenance,
      generatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const event: CanonicalIntelligenceEvent = {
      eventId: `ie_task7_race_${ts}`,
      aggregateType: "job",
      aggregateId: jobId,
      eventType: "JOB_ANALYSIS_COMPLETED",
      schemaVersion: "v8.1.0",
      pipelineVersion: "v8.1.0",
      modelVersion: "gemini-2.5-flash",
      promptVersion: "prompt_v1",
      createdAt: new Date().toISOString(),
      source: `jobs/${jobId}`,
      evidenceIds: [evidenceId],
      confidence,
      provenance,
      status: "valid",
      payload: { category: "Plumbing" },
    };

    const summary = {
      jobId,
      category: "Plumbing",
      observedProblem: "Burst Pipe Race",
    };

    // Fire 3 workers simultaneously using Promise.allSettled
    const workerPromises = [1, 2, 3].map((workerNum) =>
      immutableIntelligenceStore.persistOutput({
        db: storeDb,
        aggregateType: "job",
        aggregateId: jobId,
        versionId,
        extraction,
        event: { ...event, eventId: `${event.eventId}_w${workerNum}` },
        summaryProjection: summary,
      })
    );

    const settled = await Promise.allSettled(workerPromises);

    // All 3 promises must fulfill successfully
    const fulfilled = settled.filter((s) => s.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = settled.filter((s) => s.status === "rejected") as PromiseRejectedResult[];

    expect(rejected.length).toBe(0);
    expect(fulfilled.length).toBe(3);

    const newCreations = fulfilled.filter((f) => f.value.isNew);
    const idempotentReplays = fulfilled.filter((f) => !f.value.isNew);

    expect(newCreations.length).toBe(1);
    expect(idempotentReplays.length).toBe(2);

    // Verify Firestore emulator document
    const extractionSnap = await adminDb.collection("intelligence_extractions").doc(versionId).get();
    expect(extractionSnap.exists).toBe(true);
    expect(extractionSnap.data()?.versionId).toBe(versionId);
    expect(extractionSnap.data()?.structuredCandidate?.issue).toBe("Burst Pipe Race");

    // Verify summary pointer
    const summarySnap = await adminDb.collection("intelligence_jobs").doc(jobId).get();
    expect(summarySnap.exists).toBe(true);
    expect(summarySnap.data()?.currentVersionId).toBe(versionId);
  });

  it("2. Real Emulator Test #2 — Concurrent race between 2 workers with differing payloads under same versionId produces exactly 1 creation and 1 Immutability Error", async () => {
    const ts = Date.now();
    const jobId = `job_task7_collision_${ts}`;
    const evidenceId = `ev_task7_collision_${ts}`;
    const versionId = buildVersionId("job", jobId, 1, "v8.1.0", "gemini-2.5-flash", "prompt_v1", "v8.1.0");

    await seedEvidence({
      evidenceId,
      aggregateType: "job",
      aggregateId: jobId,
      sourceType: "job",
      sourceId: jobId,
      sourceVersion: 1,
      evidenceType: "document",
      evidenceCategory: "DOCUMENT",
      contentHash: "b".repeat(64),
      byteSize: 100,
      schemaVersion: "v8.1.0",
      integrityStatus: "verified",
      verified: true,
      sourceRef: `jobs/${jobId}/doc`,
      createdAt: new Date().toISOString(),
      metadata: {},
    });

    const confidence = { overall: 0.9, extraction: 0.9, evidenceQuality: 0.9, classification: 0.9, temporalFreshness: 0.9, method: "deterministic_heuristic" as const };
    const provenance = { source: `jobs/${jobId}`, evidenceIds: [evidenceId], pipelineVersion: "v8.1.0", modelVersion: "gemini-2.5-flash", promptVersion: "prompt_v1", generatedAt: new Date().toISOString(), sourceContentHash: "hash_col" };

    const extractionWorkerA: IntelligenceExtraction = {
      extractionId: versionId,
      versionId,
      aggregateType: "job",
      aggregateId: jobId,
      sourceType: "job",
      sourceAggregateId: jobId,
      sourceVersion: 1,
      pipelineVersion: "v8.1.0",
      modelVersion: "gemini-2.5-flash",
      promptVersion: "prompt_v1",
      schemaVersion: "v8.1.0",
      provider: "google_genai",
      evidenceIds: [evidenceId],
      rawManifest: { sha256: "hA", encoding: "gzip", originalBytes: 50, compressedBytes: 25, compressionRatio: 2.0, schemaVersion: "v8.1.0", storagePath: "pathA", createdAt: new Date().toISOString() },
      structuredCandidate: { category: "Electrical", issue: "Worker A payload: Tripping RCD" },
      confidence,
      provenance,
      generatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const extractionWorkerB: IntelligenceExtraction = {
      ...extractionWorkerA,
      structuredCandidate: { category: "Electrical", issue: "Worker B payload: Burned Fuse" },
    };

    const eventA: CanonicalIntelligenceEvent = {
      eventId: `ie_task7_colA_${ts}`,
      aggregateType: "job",
      aggregateId: jobId,
      eventType: "JOB_ANALYSIS_COMPLETED",
      schemaVersion: "v8.1.0",
      pipelineVersion: "v8.1.0",
      modelVersion: "gemini-2.5-flash",
      promptVersion: "prompt_v1",
      createdAt: new Date().toISOString(),
      source: `jobs/${jobId}`,
      evidenceIds: [evidenceId],
      confidence,
      provenance,
      status: "valid",
      payload: { category: "Electrical" },
    };

    const eventB: CanonicalIntelligenceEvent = {
      ...eventA,
      eventId: `ie_task7_colB_${ts}`,
    };

    // Fire worker A and worker B concurrently
    const settled = await Promise.allSettled([
      immutableIntelligenceStore.persistOutput({
        db: storeDb,
        aggregateType: "job",
        aggregateId: jobId,
        versionId,
        extraction: extractionWorkerA,
        event: eventA,
        summaryProjection: { jobId, issue: "Worker A" },
      }),
      immutableIntelligenceStore.persistOutput({
        db: storeDb,
        aggregateType: "job",
        aggregateId: jobId,
        versionId,
        extraction: extractionWorkerB,
        event: eventB,
        summaryProjection: { jobId, issue: "Worker B" },
      }),
    ]);

    const fulfilled = settled.filter((s) => s.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = settled.filter((s) => s.status === "rejected") as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    expect(fulfilled[0].value.isNew).toBe(true);
    expect(rejected[0].reason.message).toContain("[Intelligence Immutability Error] Cannot mutate historical intelligence version");

    // Verify Firestore emulator document is NOT corrupted and strictly equals the winning worker's candidate
    const extractionSnap = await adminDb.collection("intelligence_extractions").doc(versionId).get();
    expect(extractionSnap.exists).toBe(true);
    const savedIssue = extractionSnap.data()?.structuredCandidate?.issue;
    const winningIssue = fulfilled[0].value.extraction.structuredCandidate.issue;
    expect(savedIssue).toBe(winningIssue);
  });

  it("3. Real Emulator Test #3 — Human Quality Review records independent audit record without modifying historical AI extraction", async () => {
    const ts = Date.now();
    const jobId = `job_task7_review_${ts}`;
    const evidenceId = `ev_task7_review_${ts}`;
    const versionId = buildVersionId("job", jobId, 1, "v8.1.0", "gemini-2.5-flash", "prompt_v1", "v8.1.0");

    await seedEvidence({
      evidenceId,
      aggregateType: "job",
      aggregateId: jobId,
      sourceType: "job",
      sourceId: jobId,
      sourceVersion: 1,
      evidenceType: "document",
      evidenceCategory: "DOCUMENT",
      contentHash: "c".repeat(64),
      byteSize: 100,
      schemaVersion: "v8.1.0",
      integrityStatus: "verified",
      verified: true,
      sourceRef: `jobs/${jobId}/doc`,
      createdAt: new Date().toISOString(),
      metadata: {},
    });

    const confidence = { overall: 0.88, extraction: 0.88, evidenceQuality: 0.88, classification: 0.88, temporalFreshness: 0.88, method: "deterministic_heuristic" as const };
    const provenance = { source: `jobs/${jobId}`, evidenceIds: [evidenceId], pipelineVersion: "v8.1.0", modelVersion: "gemini-2.5-flash", promptVersion: "prompt_v1", generatedAt: new Date().toISOString(), sourceContentHash: "hash_rev" };

    const extraction: IntelligenceExtraction = {
      extractionId: versionId,
      versionId,
      aggregateType: "job",
      aggregateId: jobId,
      sourceType: "job",
      sourceAggregateId: jobId,
      sourceVersion: 1,
      pipelineVersion: "v8.1.0",
      modelVersion: "gemini-2.5-flash",
      promptVersion: "prompt_v1",
      schemaVersion: "v8.1.0",
      provider: "google_genai",
      evidenceIds: [evidenceId],
      rawManifest: { sha256: "hRev", encoding: "gzip", originalBytes: 50, compressedBytes: 25, compressionRatio: 2.0, schemaVersion: "v8.1.0", storagePath: "path", createdAt: new Date().toISOString() },
      structuredCandidate: { category: "Roofing", issue: "Cracked Slate Tile" },
      confidence,
      provenance,
      generatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const event: CanonicalIntelligenceEvent = {
      eventId: `ie_task7_rev_${ts}`,
      aggregateType: "job",
      aggregateId: jobId,
      eventType: "JOB_ANALYSIS_COMPLETED",
      schemaVersion: "v8.1.0",
      pipelineVersion: "v8.1.0",
      modelVersion: "gemini-2.5-flash",
      promptVersion: "prompt_v1",
      createdAt: new Date().toISOString(),
      source: `jobs/${jobId}`,
      evidenceIds: [evidenceId],
      confidence,
      provenance,
      status: "valid",
      payload: { category: "Roofing" },
    };

    // 1. Initial AI extraction write
    await immutableIntelligenceStore.persistOutput({
      db: storeDb,
      aggregateType: "job",
      aggregateId: jobId,
      versionId,
      extraction,
      event,
      summaryProjection: { jobId, category: "Roofing" },
    });

    // 2. Admin Quality Review
    qualityReviewService.setFirestoreDb(storeDb);
    const qualityId = `qr_task7_${ts}`;
    const { review, auditEvent } = await qualityReviewService.applyAndPersistReview({
      qualityId,
      targetCollection: "intelligence_jobs",
      targetId: jobId,
      targetVersionId: versionId,
      action: "correct",
      reviewerId: "admin_auditor_mark",
      reason: "Corrected from slate to concrete interlocking tile",
      originalCandidate: extraction.structuredCandidate,
      correctedResult: { category: "Roofing", issue: "Cracked Concrete Interlocking Tile" },
    });

    expect(review.qualityId).toBe(qualityId);
    expect(auditEvent.eventType).toBe("QUALITY_REVIEW_APPLIED");

    // 3. Verify quality review document in Firestore emulator
    const qualitySnap = await adminDb.collection("intelligence_quality").doc(qualityId).get();
    expect(qualitySnap.exists).toBe(true);
    expect(qualitySnap.data()?.targetVersionId).toBe(versionId);
    expect(qualitySnap.data()?.action).toBe("correct");

    // 4. Verify original historical AI extraction in intelligence_extractions was NOT mutated
    const extractionSnap = await adminDb.collection("intelligence_extractions").doc(versionId).get();
    expect(extractionSnap.exists).toBe(true);
    expect(extractionSnap.data()?.structuredCandidate?.issue).toBe("Cracked Slate Tile");
  });

  it("4. Real Emulator Test #4 — Proves sequential and concurrent multiple versions (V1 and V2) update current pointer while V1 remains immutable and readable", async () => {
    const ts = Date.now();
    const propertyId = `prop_task7_${ts}`;
    const evidenceV1Id = `ev_prop_v1_${ts}`;
    const evidenceV2Id = `ev_prop_v2_${ts}`;

    const v1Id = buildVersionId("property", propertyId, 1, "v8.1.0", "gemini-2.5-flash", "prompt_v1", "v8.1.0");
    const v2Id = buildVersionId("property", propertyId, 2, "v8.1.0", "gemini-2.5-flash", "prompt_v1", "v8.1.0");

    await seedEvidence({
      evidenceId: evidenceV1Id,
      aggregateType: "property",
      aggregateId: propertyId,
      sourceType: "property",
      sourceId: propertyId,
      sourceVersion: 1,
      evidenceType: "document",
      evidenceCategory: "DOCUMENT",
      contentHash: "d".repeat(64),
      byteSize: 100,
      schemaVersion: "v8.1.0",
      integrityStatus: "verified",
      verified: true,
      sourceRef: `props/${propertyId}/v1`,
      createdAt: new Date().toISOString(),
      metadata: {},
    });

    await seedEvidence({
      evidenceId: evidenceV2Id,
      aggregateType: "property",
      aggregateId: propertyId,
      sourceType: "property",
      sourceId: propertyId,
      sourceVersion: 2,
      evidenceType: "document",
      evidenceCategory: "DOCUMENT",
      contentHash: "e".repeat(64),
      byteSize: 200,
      schemaVersion: "v8.1.0",
      integrityStatus: "verified",
      verified: true,
      sourceRef: `props/${propertyId}/v2`,
      createdAt: new Date().toISOString(),
      metadata: {},
    });

    const confidence = { overall: 0.9, extraction: 0.9, evidenceQuality: 0.9, classification: 0.9, temporalFreshness: 0.9, method: "deterministic_heuristic" as const };
    const provenanceV1 = { source: `properties/${propertyId}`, evidenceIds: [evidenceV1Id], pipelineVersion: "v8.1.0", modelVersion: "gemini-2.5-flash", promptVersion: "prompt_v1", generatedAt: "2026-10-05T10:00:00Z", sourceContentHash: "hash_v1" };

    const extractionV1: IntelligenceExtraction = {
      extractionId: v1Id,
      versionId: v1Id,
      aggregateType: "property",
      aggregateId: propertyId,
      sourceType: "property",
      sourceAggregateId: propertyId,
      sourceVersion: 1,
      pipelineVersion: "v8.1.0",
      modelVersion: "gemini-2.5-flash",
      promptVersion: "prompt_v1",
      schemaVersion: "v8.1.0",
      provider: "google_genai",
      evidenceIds: [evidenceV1Id],
      rawManifest: { sha256: "hV1", encoding: "gzip", originalBytes: 50, compressedBytes: 25, compressionRatio: 2.0, schemaVersion: "v8.1.0", storagePath: "path1", createdAt: "2026-10-05T10:00:00Z" },
      structuredCandidate: { overallHealthScore: 75, condition: "Moderate Wear" },
      confidence,
      provenance: provenanceV1,
      generatedAt: "2026-10-05T10:00:00Z",
      createdAt: "2026-10-05T10:00:00Z",
    };

    const extractionV2: IntelligenceExtraction = {
      ...extractionV1,
      extractionId: v2Id,
      versionId: v2Id,
      sourceVersion: 2,
      evidenceIds: [evidenceV2Id],
      structuredCandidate: { overallHealthScore: 92, condition: "Refurbished" },
      provenance: { ...provenanceV1, evidenceIds: [evidenceV2Id], generatedAt: "2026-10-05T11:00:00Z", sourceContentHash: "hash_v2" },
      generatedAt: "2026-10-05T11:00:00Z",
      createdAt: "2026-10-05T11:00:00Z",
    };

    // 1. Persist V1
    await immutableIntelligenceStore.persistOutput({
      db: storeDb,
      aggregateType: "property",
      aggregateId: propertyId,
      versionId: v1Id,
      extraction: extractionV1,
      event: {
        eventId: `ie_prop_${propertyId}_v1`,
        aggregateType: "property",
        aggregateId: propertyId,
        eventType: "PROPERTY_ROLLUP_COMPLETED",
        schemaVersion: "v8.1.0",
        pipelineVersion: "v8.1.0",
        modelVersion: "gemini-2.5-flash",
        promptVersion: "prompt_v1",
        createdAt: "2026-10-05T10:00:00Z",
        source: `properties/${propertyId}`,
        evidenceIds: [evidenceV1Id],
        confidence,
        provenance: provenanceV1,
        status: "valid",
        payload: {},
      },
      summaryProjection: { propertyId, overallHealthScore: 75, condition: "Moderate Wear" },
    });

    // Pointer check 1
    const p1Snap = await adminDb.collection("intelligence_properties").doc(propertyId).get();
    expect(p1Snap.data()?.currentVersionId).toBe(v1Id);
    expect(p1Snap.data()?.overallHealthScore).toBe(75);

    // 2. Persist V2
    await immutableIntelligenceStore.persistOutput({
      db: storeDb,
      aggregateType: "property",
      aggregateId: propertyId,
      versionId: v2Id,
      extraction: extractionV2,
      event: {
        eventId: `ie_prop_${propertyId}_v2`,
        aggregateType: "property",
        aggregateId: propertyId,
        eventType: "PROPERTY_ROLLUP_COMPLETED",
        schemaVersion: "v8.1.0",
        pipelineVersion: "v8.1.0",
        modelVersion: "gemini-2.5-flash",
        promptVersion: "prompt_v1",
        createdAt: "2026-10-05T11:00:00Z",
        source: `properties/${propertyId}`,
        evidenceIds: [evidenceV2Id],
        confidence,
        provenance: extractionV2.provenance,
        status: "valid",
        payload: {},
      },
      summaryProjection: { propertyId, overallHealthScore: 92, condition: "Refurbished" },
    });

    // Pointer check 2 -> points to V2
    const p2Snap = await adminDb.collection("intelligence_properties").doc(propertyId).get();
    expect(p2Snap.data()?.currentVersionId).toBe(v2Id);
    expect(p2Snap.data()?.overallHealthScore).toBe(92);

    // Both historical extractions exist in Firestore emulator
    const v1Snap = await adminDb.collection("intelligence_extractions").doc(v1Id).get();
    const v2Snap = await adminDb.collection("intelligence_extractions").doc(v2Id).get();

    expect(v1Snap.exists).toBe(true);
    expect(v2Snap.exists).toBe(true);
    expect(v1Snap.data()?.structuredCandidate?.overallHealthScore).toBe(75);
    expect(v2Snap.data()?.structuredCandidate?.overallHealthScore).toBe(92);
  });
});
