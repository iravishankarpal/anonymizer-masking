import type { CollectionAfterChangeHook } from 'payload'

import type { AnonymizationCollectionConfig, AnonymizationMetadataConfig } from '../index.js'

type AnonymizationRequest = {
  id: string
  user: string | number | { id: string | number }
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected'
}

export const createAnonymizeApprovedRequest = (
  configuredCollections: Record<string, AnonymizationCollectionConfig>,
  metadataConfig?: AnonymizationMetadataConfig,
): CollectionAfterChangeHook<AnonymizationRequest> => async ({ context, doc, previousDoc, req }) => {
  // Only trigger when status changes from pending → approved
  if (
    context.anonymizationInProgress ||
    doc.status !== 'approved' ||
    previousDoc?.status !== 'pending'
  ) {
    return doc
  }

  try {
    // Update status to 'processing' immediately to notify admin.
    // NOTE: We MUST pass `req` so this nested update joins the SAME database
    // transaction as the outer update. Without it Payload starts a new
    // transaction on another pooled connection, which then blocks forever
    // on the row-lock held by the outer (uncommitted) UPDATE.
    await req.payload.update({
      collection: 'anonymization-requests',
      id: doc.id,
      data: {
        approvedBy: req.user?.id,
        status: 'processing',
      },
      overrideAccess: true,
      req,
      context: {
        ...context,
        anonymizationInProgress: true,
      },
    })

    // Queue the background job to perform the heavy lifting.
    // NOTE: do NOT pass `req` here. The job row must be committed on its own
    // connection so it is immediately visible to any runner. If it were queued
    // inside the outer (still uncommitted) update transaction, a subsequent
    // `jobs.runByID()` would not be able to find it and would silently no-op.
    const job = await req.payload.jobs.queue({
      task: 'anonymizeDataTask',
      input: {
        requestId: String(doc.id),
        encryptionKey: metadataConfig?.encryptionKey,
        metadataEnabled: metadataConfig?.enabled === true,
      },
    })

    console.log(`✓ Anonymization job queued for request ${doc.id}`)

    // In development we want the job to run right away. It cannot run
    // synchronously from inside this hook:
    //
    //  1. the outer update transaction has not committed yet, so the job row
    //     would not be visible to a runner on another connection, and
    //  2. the outer transaction still holds a row-lock on the request
    //     document, so the task's own UPDATE of that row (status →
    //     'completed') would deadlock.
    //
    // Defer the drain until the outer transaction has committed. The job row
    // itself is already committed (no `req` above), so the runner will find
    // it.
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        void req.payload.jobs
          .runByID({ id: job.id })
          .catch((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error(`✗ Failed to run queued anonymization job: ${errorMessage}`)
          })
      }, 1500)
    }
    return doc
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`✗ Failed to queue anonymization job: ${errorMessage}`)

    // Revert status to 'pending' if job queuing fails.
    // Joining the same transaction means these changes are rolled back with the
    // outer transaction (keeping the previously committed 'pending' state).
    try {
      await req.payload.update({
        collection: 'anonymization-requests',
        id: doc.id,
        data: {
          status: 'pending',
        },
        overrideAccess: true,
        req,
      })
    } catch (revertError) {
      console.error('Failed to revert status:', revertError)
    }

    throw error
  }
}