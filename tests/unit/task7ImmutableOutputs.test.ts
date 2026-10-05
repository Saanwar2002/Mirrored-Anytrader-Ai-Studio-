import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildVersionId,
  computeSha256,
  INTELLIGENCE_PIPELINE_VERSION,
  INTELLIGENCE_SCHEMA_VERSION,
} from '../../src/server/intelligence/provenance';
import {
  immutableIntelligenceStore,
  computeExtractionHash,
  FirestoreDbLike,
} from '../../src/server/intelligence/immutableStore';
import {
  qualityReviewService,
  buildQualityReviewId,
} from '../../src/server/intelligence/qualityReview';
import {
  IntelligenceExtraction,
  CanonicalIntelligenceEvent,
  QualityReview,
  IntelligenceEvidence,
} from '../../src/server/intelligence/types';
import { createInMemoryTestDb } from '../../src/server/intelligence/testDoubles';

describe('Task 7: Immutable Intelligence Outputs & Explicit Versioning Unit Suite', () => {
  let db: any;

  beforeEach(() => {
    db = createInMemoryTestDb();
  });

  const validEvidence1: IntelligenceEvidence = {
    evidenceId: 'ev_job_101_1',
    aggregateType: 'job',
    aggregateId: 'job_101',
    sourceType: 'job',
    sourceId: 'job_101',
    sourceVersion: 1,
    evidenceType: 'document',
    evidenceCategory: 'DOCUMENT',
    contentHash: 'a'.repeat(64),
    byteSize: 256,
    schemaVersion: 'v8.1.0',
    integrityStatus: 'verified',
    verified: true,
    sourceRef: 'jobs/job_101/doc_1',
    createdAt: new Date().toISOString(),
    metadata: {},
  };

  const validEvidence2: IntelligenceEvidence = {
    evidenceId: 'ev_job_101_2',
    aggregateType: 'job',
    aggregateId: 'job_101',
    sourceType: 'job',
    sourceId: 'job_101',
    sourceVersion: 2,
    evidenceType: 'document',
    evidenceCategory: 'DOCUMENT',
    contentHash: 'b'.repeat(64),
    byteSize: 512,
    schemaVersion: 'v8.1.0',
    integrityStatus: 'verified',
    verified: true,
    sourceRef: 'jobs/job_101/doc_2',
    createdAt: new Date().toISOString(),
    metadata: {},
  };

  const seedEvidence = async (evidence: IntelligenceEvidence) => {
    await db.collection('intelligence_evidence').doc(evidence.evidenceId).set(evidence);
  };

  // ============================================================
  // 1. DETERMINISTIC VERSION ID VERIFICATION
  // ============================================================
  describe('1. Deterministic Version Identity (buildVersionId)', () => {
    it('generates identical versionId for identical inputs', () => {
      const v1 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      expect(v1).toBe(v2);
      expect(v1).toMatch(/^ver_job_job_101_[a-f0-9]{16}$/);
    });

    it('changes versionId when sourceVersion changes', () => {
      const v1 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('job', 'job_101', 2, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      expect(v1).not.toBe(v2);
    });

    it('changes versionId when pipelineVersion changes', () => {
      const v1 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('job', 'job_101', 1, 'v8.2.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      expect(v1).not.toBe(v2);
    });

    it('changes versionId when modelVersion changes', () => {
      const v1 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-1.5-pro', 'prompt_v1', 'v8.1.0');
      expect(v1).not.toBe(v2);
    });

    it('changes versionId when promptVersion changes', () => {
      const v1 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v2', 'v8.1.0');
      expect(v1).not.toBe(v2);
    });

    it('changes versionId when schemaVersion changes', () => {
      const v1 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.2.0');
      expect(v1).not.toBe(v2);
    });

    it('changes versionId when aggregateType changes', () => {
      const v1 = buildVersionId('job', 'entity_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('property', 'entity_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      expect(v1).not.toBe(v2);
    });

    it('changes versionId when aggregateId changes', () => {
      const v1 = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2 = buildVersionId('job', 'job_102', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      expect(v1).not.toBe(v2);
    });
  });

  // ============================================================
  // 2. IMMUTABILITY, REPLAY & COLLISION HARD FAILURE
  // ============================================================
  describe('2. Historical Immutability & Replay Defense (persistOutput)', () => {
    const now = '2026-10-05T12:00:00.000Z';
    const versionId = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');

    const baseExtraction: IntelligenceExtraction = {
      extractionId: versionId,
      versionId,
      aggregateType: 'job',
      aggregateId: 'job_101',
      sourceType: 'job',
      sourceAggregateId: 'job_101',
      sourceVersion: 1,
      pipelineVersion: 'v8.1.0',
      modelVersion: 'gemini-2.5-flash',
      promptVersion: 'prompt_v1',
      schemaVersion: 'v8.1.0',
      provider: 'google_genai',
      evidenceIds: ['ev_job_101_1'],
      rawManifest: {
        sha256: 'manifest_hash_1',
        encoding: 'gzip',
        originalBytes: 100,
        compressedBytes: 50,
        compressionRatio: 2.0,
        schemaVersion: 'v8.1.0',
        storagePath: 'raw/1.json.gz',
        createdAt: now,
      },
      structuredCandidate: {
        category: 'Plumbing',
        component: 'Boiler',
        issue: 'Low pressure fault',
      },
      confidence: {
        overall: 0.95,
        extraction: 0.95,
        evidenceQuality: 0.95,
        classification: 0.95,
        temporalFreshness: 0.95,
        method: 'deterministic_heuristic',
      },
      provenance: {
        source: 'jobs/job_101',
        evidenceIds: ['ev_job_101_1'],
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'prompt_v1',
        generatedAt: now,
        sourceContentHash: 'src_hash_1',
      },
      generatedAt: now,
      createdAt: now,
    };

    const baseEvent: CanonicalIntelligenceEvent = {
      eventId: 'event_job_101_v1',
      aggregateType: 'job',
      aggregateId: 'job_101',
      eventType: 'JOB_ANALYSIS_COMPLETED',
      schemaVersion: 'v8.1.0',
      pipelineVersion: 'v8.1.0',
      modelVersion: 'gemini-2.5-flash',
      promptVersion: 'prompt_v1',
      createdAt: now,
      source: 'jobs/job_101',
      evidenceIds: ['ev_job_101_1'],
      confidence: baseExtraction.confidence,
      provenance: baseExtraction.provenance,
      status: 'valid',
      payload: { category: 'Plumbing' },
    };

    const baseSummary = {
      jobId: 'job_101',
      category: 'Plumbing',
      component: 'Boiler',
    };

    it('persists first write successfully (isNew: true) and creates Firestore extraction document', async () => {
      await seedEvidence(validEvidence1);

      const res = await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId,
        extraction: baseExtraction,
        event: baseEvent,
        summaryProjection: baseSummary,
      });

      expect(res.isNew).toBe(true);
      expect(res.versionId).toBe(versionId);

      const savedDoc = await immutableIntelligenceStore.getVersionById(db, versionId);
      expect(savedDoc).toBeDefined();
      expect(savedDoc?.structuredCandidate.category).toBe('Plumbing');
      expect(savedDoc?.structuredCandidate.issue).toBe('Low pressure fault');
    });

    it('replays identical extraction idempotently without mutation (isNew: false)', async () => {
      await seedEvidence(validEvidence1);

      // Write 1
      const res1 = await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId,
        extraction: baseExtraction,
        event: baseEvent,
        summaryProjection: baseSummary,
      });
      expect(res1.isNew).toBe(true);

      // Replay identical write
      const res2 = await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId,
        extraction: baseExtraction,
        event: baseEvent,
        summaryProjection: baseSummary,
      });
      expect(res2.isNew).toBe(false);
      expect(res2.versionId).toBe(versionId);
      expect(res2.extraction.structuredCandidate.issue).toBe('Low pressure fault');

      // Verify no duplicate extraction documents
      const versions = await immutableIntelligenceStore.getVersionsForAggregate(db, 'job', 'job_101');
      expect(versions.length).toBe(1);
    });

    it('rejects conflicting structuredCandidate under existing versionId with [Intelligence Immutability Error]', async () => {
      await seedEvidence(validEvidence1);

      await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId,
        extraction: baseExtraction,
        event: baseEvent,
        summaryProjection: baseSummary,
      });

      const tamperedCandidateExtraction: IntelligenceExtraction = {
        ...baseExtraction,
        structuredCandidate: {
          category: 'Plumbing',
          component: 'Boiler',
          issue: 'TAMPERED ISSUE: Broken Heat Exchanger',
        },
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_101',
          versionId,
          extraction: tamperedCandidateExtraction,
          event: baseEvent,
          summaryProjection: baseSummary,
        })
      ).rejects.toThrow(/\[Intelligence Immutability Error\] Cannot mutate historical intelligence version/);

      // Verify original record was NOT mutated
      const original = await immutableIntelligenceStore.getVersionById(db, versionId);
      expect(original?.structuredCandidate.issue).toBe('Low pressure fault');
    });

    it('rejects tampered evidenceIds under existing versionId with [Intelligence Immutability Error]', async () => {
      await seedEvidence(validEvidence1);
      await seedEvidence({ ...validEvidence1, evidenceId: 'ev_job_101_tampered' });

      await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId,
        extraction: baseExtraction,
        event: baseEvent,
        summaryProjection: baseSummary,
      });

      const tamperedEvidenceExtraction: IntelligenceExtraction = {
        ...baseExtraction,
        evidenceIds: ['ev_job_101_tampered'],
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_101',
          versionId,
          extraction: tamperedEvidenceExtraction,
          event: baseEvent,
          summaryProjection: baseSummary,
        })
      ).rejects.toThrow(/\[Intelligence Immutability Error\] Cannot mutate historical intelligence version/);
    });

    it('rejects tampered confidence under existing versionId with [Intelligence Immutability Error]', async () => {
      await seedEvidence(validEvidence1);

      await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId,
        extraction: baseExtraction,
        event: baseEvent,
        summaryProjection: baseSummary,
      });

      const tamperedConfidenceExtraction: IntelligenceExtraction = {
        ...baseExtraction,
        confidence: {
          ...baseExtraction.confidence,
          overall: 0.1, // tampered confidence score
        },
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_101',
          versionId,
          extraction: tamperedConfidenceExtraction,
          event: baseEvent,
          summaryProjection: baseSummary,
        })
      ).rejects.toThrow(/\[Intelligence Immutability Error\] Cannot mutate historical intelligence version/);
    });

    it('rejects tampered provenance under existing versionId with [Intelligence Immutability Error]', async () => {
      await seedEvidence(validEvidence1);

      await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId,
        extraction: baseExtraction,
        event: baseEvent,
        summaryProjection: baseSummary,
      });

      const tamperedProvenanceExtraction: IntelligenceExtraction = {
        ...baseExtraction,
        provenance: {
          ...baseExtraction.provenance,
          sourceContentHash: 'tampered_source_hash_999',
        },
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_101',
          versionId,
          extraction: tamperedProvenanceExtraction,
          event: baseEvent,
          summaryProjection: baseSummary,
        })
      ).rejects.toThrow(/\[Intelligence Immutability Error\] Cannot mutate historical intelligence version/);
    });

    it('rejects direct in-place mutation attempts via attemptMutateVersion', async () => {
      await expect(
        immutableIntelligenceStore.attemptMutateVersion(db, versionId, { issue: 'direct mutation' })
      ).rejects.toThrow(/\[Intelligence Immutability Error\] Direct modification of historical extraction '.*' is prohibited/);
    });
  });

  // ============================================================
  // 3. CURRENT POINTER IS THE ONLY MUTABLE LAYER
  // ============================================================
  describe('3. Mutable Current-Pointer / Immutable Historical Projections', () => {
    it('advances currentVersionId pointer V1 -> V2 while historical V1 remains unchanged and queryable', async () => {
      await seedEvidence(validEvidence1);
      await seedEvidence(validEvidence2);

      const v1Id = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');
      const v2Id = buildVersionId('job', 'job_101', 2, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');

      const extractionV1: IntelligenceExtraction = {
        extractionId: v1Id,
        versionId: v1Id,
        aggregateType: 'job',
        aggregateId: 'job_101',
        sourceType: 'job',
        sourceAggregateId: 'job_101',
        sourceVersion: 1,
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'prompt_v1',
        schemaVersion: 'v8.1.0',
        provider: 'google_genai',
        evidenceIds: ['ev_job_101_1'],
        rawManifest: { sha256: 'h1', encoding: 'gzip', originalBytes: 10, compressedBytes: 10, compressionRatio: 1.0, schemaVersion: 'v8.1.0', storagePath: 'p1', createdAt: '2026-10-05T12:00:00Z' },
        structuredCandidate: { phase: 'Initial Inspection', score: 80 },
        confidence: { overall: 0.8, extraction: 0.8, evidenceQuality: 0.8, classification: 0.8, temporalFreshness: 0.8, method: 'deterministic_heuristic' },
        provenance: { source: 'job_101', evidenceIds: ['ev_job_101_1'], pipelineVersion: 'v8.1.0', modelVersion: 'gemini-2.5-flash', promptVersion: 'prompt_v1', generatedAt: '2026-10-05T12:00:00Z', sourceContentHash: 'hash1' },
        generatedAt: '2026-10-05T12:00:00Z',
        createdAt: '2026-10-05T12:00:00Z',
      };

      const eventV1: CanonicalIntelligenceEvent = {
        eventId: 'event_job_101_v1',
        aggregateType: 'job',
        aggregateId: 'job_101',
        eventType: 'JOB_ANALYSIS_COMPLETED',
        schemaVersion: 'v8.1.0',
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'prompt_v1',
        createdAt: '2026-10-05T12:00:00Z',
        source: 'jobs/job_101',
        evidenceIds: ['ev_job_101_1'],
        confidence: extractionV1.confidence,
        provenance: extractionV1.provenance,
        status: 'valid',
        payload: { phase: 'Initial Inspection' },
      };

      // 1. Persist V1
      await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId: v1Id,
        extraction: extractionV1,
        event: eventV1,
        summaryProjection: { jobId: 'job_101', phase: 'Initial Inspection' },
      });

      const pointer1: any = await immutableIntelligenceStore.getCurrentPointer(db, 'job', 'job_101');
      expect(pointer1.currentVersionId).toBe(v1Id);
      expect(pointer1.phase).toBe('Initial Inspection');

      // 2. Persist V2 (sourceVersion 2)
      const extractionV2: IntelligenceExtraction = {
        ...extractionV1,
        extractionId: v2Id,
        versionId: v2Id,
        sourceVersion: 2,
        evidenceIds: ['ev_job_101_2'],
        structuredCandidate: { phase: 'Work Completed & Verified', score: 100 },
        provenance: { ...extractionV1.provenance, sourceContentHash: 'hash2' },
        generatedAt: '2026-10-05T13:00:00Z',
        createdAt: '2026-10-05T13:00:00Z',
      };

      const eventV2: CanonicalIntelligenceEvent = {
        ...eventV1,
        eventId: 'event_job_101_v2',
        evidenceIds: ['ev_job_101_2'],
        createdAt: '2026-10-05T13:00:00Z',
        payload: { phase: 'Work Completed & Verified' },
      };

      await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId: v2Id,
        extraction: extractionV2,
        event: eventV2,
        summaryProjection: { jobId: 'job_101', phase: 'Work Completed & Verified' },
      });

      // Pointer moved to V2
      const pointer2: any = await immutableIntelligenceStore.getCurrentPointer(db, 'job', 'job_101');
      expect(pointer2.currentVersionId).toBe(v2Id);
      expect(pointer2.phase).toBe('Work Completed & Verified');

      // Historical V1 remains completely untouched in Firestore
      const v1Fetch = await immutableIntelligenceStore.getVersionById(db, v1Id);
      expect(v1Fetch).toBeDefined();
      expect(v1Fetch?.structuredCandidate.phase).toBe('Initial Inspection');
      expect(v1Fetch?.sourceVersion).toBe(1);

      // Historical V2 exists independently
      const v2Fetch = await immutableIntelligenceStore.getVersionById(db, v2Id);
      expect(v2Fetch).toBeDefined();
      expect(v2Fetch?.structuredCandidate.phase).toBe('Work Completed & Verified');
      expect(v2Fetch?.sourceVersion).toBe(2);

      // Both versions returned in aggregate history query in chronological order
      const history = await immutableIntelligenceStore.getVersionsForAggregate(db, 'job', 'job_101');
      expect(history.length).toBe(2);
      expect(history[0].versionId).toBe(v1Id);
      expect(history[1].versionId).toBe(v2Id);
    });
  });

  // ============================================================
  // 4. HUMAN REVIEW / QUALITY CORRECTION DECOUPLING
  // ============================================================
  describe('4. Human Review & Quality Correction Decoupling (qualityReview)', () => {
    it('creates an independent quality review document without mutating target historical extraction', async () => {
      await seedEvidence(validEvidence1);

      const targetVersionId = buildVersionId('job', 'job_101', 1, 'v8.1.0', 'gemini-2.5-flash', 'prompt_v1', 'v8.1.0');

      const originalExtraction: IntelligenceExtraction = {
        extractionId: targetVersionId,
        versionId: targetVersionId,
        aggregateType: 'job',
        aggregateId: 'job_101',
        sourceType: 'job',
        sourceAggregateId: 'job_101',
        sourceVersion: 1,
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'prompt_v1',
        schemaVersion: 'v8.1.0',
        provider: 'google_genai',
        evidenceIds: ['ev_job_101_1'],
        rawManifest: { sha256: 'h', encoding: 'gzip', originalBytes: 10, compressedBytes: 10, compressionRatio: 1.0, schemaVersion: 'v8.1.0', storagePath: 'p', createdAt: '2026-10-05T12:00:00Z' },
        structuredCandidate: { category: 'Plumbing', problem: 'Faulty boiler valve' },
        confidence: { overall: 0.85, extraction: 0.85, evidenceQuality: 0.85, classification: 0.85, temporalFreshness: 0.85, method: 'deterministic_heuristic' },
        provenance: { source: 'job_101', evidenceIds: ['ev_job_101_1'], pipelineVersion: 'v8.1.0', modelVersion: 'gemini-2.5-flash', promptVersion: 'prompt_v1', generatedAt: '2026-10-05T12:00:00Z', sourceContentHash: 'hash1' },
        generatedAt: '2026-10-05T12:00:00Z',
        createdAt: '2026-10-05T12:00:00Z',
      };

      await immutableIntelligenceStore.persistOutput({
        db,
        aggregateType: 'job',
        aggregateId: 'job_101',
        versionId: targetVersionId,
        extraction: originalExtraction,
        event: {
          eventId: 'ev_orig',
          aggregateType: 'job',
          aggregateId: 'job_101',
          eventType: 'JOB_ANALYSIS_COMPLETED',
          schemaVersion: 'v8.1.0',
          pipelineVersion: 'v8.1.0',
          modelVersion: 'gemini-2.5-flash',
          promptVersion: 'prompt_v1',
          createdAt: '2026-10-05T12:00:00Z',
          source: 'jobs/job_101',
          evidenceIds: ['ev_job_101_1'],
          confidence: originalExtraction.confidence,
          provenance: originalExtraction.provenance,
          status: 'valid',
          payload: {},
        },
      });

      // Apply human review correction
      qualityReviewService.setFirestoreDb(db);
      const { review, auditEvent } = await qualityReviewService.applyAndPersistReview({
        qualityId: 'qr_review_test_101',
        targetCollection: 'intelligence_jobs',
        targetId: 'job_101',
        targetVersionId,
        action: 'correct',
        reviewerId: 'admin_auditor_sarah',
        reason: 'Incorrect problem classification: was expansion vessel, not valve',
        originalCandidate: originalExtraction.structuredCandidate,
        correctedResult: { category: 'Plumbing', problem: 'Faulty expansion vessel' },
      });

      expect(review.qualityId).toBe('qr_review_test_101');
      expect(review.targetVersionId).toBe(targetVersionId);
      expect(review.action).toBe('correct');
      expect(auditEvent.eventType).toBe('QUALITY_REVIEW_APPLIED');

      // Verify quality review record exists in intelligence_quality collection
      const savedReview = await qualityReviewService.getReviewByIdAsync('qr_review_test_101');
      expect(savedReview).toBeDefined();
      expect(savedReview?.reason).toContain('expansion vessel');

      // Original AI extraction in intelligence_extractions remains completely UNCHANGED
      const unmutatedExtraction = await immutableIntelligenceStore.getVersionById(db, targetVersionId);
      expect(unmutatedExtraction?.structuredCandidate.problem).toBe('Faulty boiler valve');
    });

    it('rejects conflicting re-submission of quality review with [Quality Review Immutability Error]', async () => {
      const sampleReview: QualityReview = {
        qualityId: 'qr_perm_immutable_1',
        targetCollection: 'intelligence_jobs',
        targetId: 'job_200',
        targetVersionId: 'ver_200',
        action: 'approve',
        reviewerId: 'auditor_1',
        reviewedAt: '2026-10-05T12:00:00Z',
        reason: 'All checks passed',
        originalCandidate: { cat: 'Plumbing' },
        correctionProvenance: { reviewerId: 'auditor_1', timestamp: '2026-10-05T12:00:00Z', hash: 'hash1' },
      };

      const sampleEvent: CanonicalIntelligenceEvent = {
        eventId: 'ie_qr_perm_1',
        aggregateType: 'job',
        aggregateId: 'job_200',
        eventType: 'QUALITY_REVIEW_APPLIED',
        schemaVersion: 'v8.1.0',
        pipelineVersion: 'v8.1.0',
        modelVersion: 'human_reviewer',
        promptVersion: 'admin_review_v8.1',
        createdAt: '2026-10-05T12:00:00Z',
        source: 'admin_review/auditor_1',
        evidenceIds: [],
        confidence: { overall: 1.0, extraction: 1.0, evidenceQuality: 1.0, classification: 1.0, temporalFreshness: 1.0, method: 'human_verified' },
        provenance: { source: 'auditor_1', generatedAt: '2026-10-05T12:00:00Z' },
        status: 'valid',
        payload: {},
      };

      // Initial write
      await immutableIntelligenceStore.persistQualityReview({
        db,
        review: sampleReview,
        auditEvent: sampleEvent,
      });

      // Conflicting rewrite
      const conflictingReview = {
        ...sampleReview,
        reason: 'TAMPERED REASON AFTER THE FACT',
      };

      await expect(
        immutableIntelligenceStore.persistQualityReview({
          db,
          review: conflictingReview,
          auditEvent: sampleEvent,
        })
      ).rejects.toThrow(/\[Quality Review Immutability Error\] Cannot mutate historical quality review/);
    });
  });

  // ============================================================
  // 5. FAIL-CLOSED PERSISTENCE INVARIANTS
  // ============================================================
  describe('5. Fail-Closed Invariants & Lineage Enforcement', () => {
    it('fails closed when Firestore database is null or unconfigured', async () => {
      const dummyExtraction = {} as any;
      const dummyEvent = {} as any;

      await expect(
        immutableIntelligenceStore.persistOutput({
          db: null,
          aggregateType: 'job',
          aggregateId: 'job_999',
          versionId: 'v999',
          extraction: dummyExtraction,
          event: dummyEvent,
        })
      ).rejects.toThrow(/\[ImmutableStore\] Firestore database is not configured or ready. Operational failure \(Fail Closed\)/);
    });

    it('fails closed when Firestore lacks runTransaction capability', async () => {
      const dummyDb = { collection: () => ({ doc: () => ({}) }) } as any;

      await expect(
        immutableIntelligenceStore.persistOutput({
          db: dummyDb,
          aggregateType: 'job',
          aggregateId: 'job_999',
          versionId: 'v999',
          extraction: { evidenceIds: ['ev1'] } as any,
          event: {} as any,
        })
      ).rejects.toThrow(/\[ImmutableStore\] Firestore transaction capability \(runTransaction\) is required/);
    });

    it('fails closed when extraction provides empty evidence references', async () => {
      const noEvidenceExtraction: IntelligenceExtraction = {
        extractionId: 'ver_no_ev',
        versionId: 'ver_no_ev',
        aggregateType: 'job',
        aggregateId: 'job_999',
        sourceType: 'job',
        sourceAggregateId: 'job_999',
        sourceVersion: 1,
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'p1',
        schemaVersion: 'v8.1.0',
        provider: 'google_genai',
        evidenceIds: [], // VIOLATION: Empty evidence
        rawManifest: { sha256: 'h', encoding: 'gzip', originalBytes: 10, compressedBytes: 10, compressionRatio: 1.0, schemaVersion: 'v8.1.0', storagePath: 'p', createdAt: '' },
        structuredCandidate: {},
        confidence: { overall: 0.5, extraction: 0.5, evidenceQuality: 0.5, classification: 0.5, temporalFreshness: 0.5, method: 'deterministic_heuristic' },
        provenance: {},
        generatedAt: '',
        createdAt: '',
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_999',
          versionId: 'ver_no_ev',
          extraction: noEvidenceExtraction,
          event: {} as any,
        })
      ).rejects.toThrow(/\[EvidenceLineage Violation\] No evidence provided/);
    });

    it('fails closed when referenced evidence does not exist in authoritative store', async () => {
      const missingEvExtraction: IntelligenceExtraction = {
        extractionId: 'ver_missing_ev',
        versionId: 'ver_missing_ev',
        aggregateType: 'job',
        aggregateId: 'job_999',
        sourceType: 'job',
        sourceAggregateId: 'job_999',
        sourceVersion: 1,
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'p1',
        schemaVersion: 'v8.1.0',
        provider: 'google_genai',
        evidenceIds: ['ev_nonexistent_999'], // VIOLATION: Does not exist in DB
        rawManifest: { sha256: 'h', encoding: 'gzip', originalBytes: 10, compressedBytes: 10, compressionRatio: 1.0, schemaVersion: 'v8.1.0', storagePath: 'p', createdAt: '' },
        structuredCandidate: {},
        confidence: { overall: 0.5, extraction: 0.5, evidenceQuality: 0.5, classification: 0.5, temporalFreshness: 0.5, method: 'deterministic_heuristic' },
        provenance: {},
        generatedAt: '',
        createdAt: '',
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_999',
          versionId: 'ver_missing_ev',
          extraction: missingEvExtraction,
          event: {} as any,
        })
      ).rejects.toThrow(/\[EvidenceLineage Violation\] Referenced evidence 'ev_nonexistent_999' does not exist/);
    });

    it('fails closed when evidence belongs to a different aggregate (cross-entity contamination)', async () => {
      // Evidence belongs to job_888
      await seedEvidence({
        ...validEvidence1,
        evidenceId: 'ev_job_888_1',
        aggregateId: 'job_888',
        sourceId: 'job_888',
      });

      // Extraction is for job_101
      const contaminatedExtraction: IntelligenceExtraction = {
        extractionId: 'ver_contam',
        versionId: 'ver_contam',
        aggregateType: 'job',
        aggregateId: 'job_101',
        sourceType: 'job',
        sourceAggregateId: 'job_101',
        sourceVersion: 1,
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'p1',
        schemaVersion: 'v8.1.0',
        provider: 'google_genai',
        evidenceIds: ['ev_job_888_1'], // VIOLATION: Cross-entity contamination
        rawManifest: { sha256: 'h', encoding: 'gzip', originalBytes: 10, compressedBytes: 10, compressionRatio: 1.0, schemaVersion: 'v8.1.0', storagePath: 'p', createdAt: '' },
        structuredCandidate: {},
        confidence: { overall: 0.5, extraction: 0.5, evidenceQuality: 0.5, classification: 0.5, temporalFreshness: 0.5, method: 'deterministic_heuristic' },
        provenance: {},
        generatedAt: '',
        createdAt: '',
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_101',
          versionId: 'ver_contam',
          extraction: contaminatedExtraction,
          event: {} as any,
        })
      ).rejects.toThrow(/\[EvidenceLineage Violation\] Same-type aggregate mismatch rejected/);
    });

    it('fails closed when evidence is an AI self-claim (anti-AI circularity violation)', async () => {
      // Seed circular AI output evidence
      await seedEvidence({
        ...validEvidence1,
        evidenceId: 'ev_ai_self_1',
        sourceType: 'ai_output' as any, // VIOLATION: AI output acting as raw evidence
      });

      const circularExtraction: IntelligenceExtraction = {
        extractionId: 'ver_circular',
        versionId: 'ver_circular',
        aggregateType: 'job',
        aggregateId: 'job_101',
        sourceType: 'job',
        sourceAggregateId: 'job_101',
        sourceVersion: 1,
        pipelineVersion: 'v8.1.0',
        modelVersion: 'gemini-2.5-flash',
        promptVersion: 'p1',
        schemaVersion: 'v8.1.0',
        provider: 'google_genai',
        evidenceIds: ['ev_ai_self_1'],
        rawManifest: { sha256: 'h', encoding: 'gzip', originalBytes: 10, compressedBytes: 10, compressionRatio: 1.0, schemaVersion: 'v8.1.0', storagePath: 'p', createdAt: '' },
        structuredCandidate: {},
        confidence: { overall: 0.5, extraction: 0.5, evidenceQuality: 0.5, classification: 0.5, temporalFreshness: 0.5, method: 'deterministic_heuristic' },
        provenance: {},
        generatedAt: '',
        createdAt: '',
      };

      await expect(
        immutableIntelligenceStore.persistOutput({
          db,
          aggregateType: 'job',
          aggregateId: 'job_101',
          versionId: 'ver_circular',
          extraction: circularExtraction,
          event: {} as any,
        })
      ).rejects.toThrow(/\[EvidenceLineage Violation\] Anti-AI Circularity Violation/);
    });
  });
});
