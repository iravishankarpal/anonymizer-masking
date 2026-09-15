import { randomBytes } from 'node:crypto'

import type { Access, AccessResult, CheckboxField, CollectionConfig, Config } from 'payload'

import { anonymizedRead } from './access/anonymizedRead.js'
import { createAnonymizationRequestsCollection } from './collections/AnonymizationRequests.js'
import type { AnonymizationRequestsConfig } from './collections/AnonymizationRequests.js'
import { AnonymizedIdentities } from './collections/AnonymizedIdentities.js'
import { createAnonymizationLogsCollection } from './collections/AnonymizationLogs.js'
import { createAnonymizationKeyCollection } from './collections/AnonymizationKey.js'
import { AnonymizationMetadata } from './collections/AnonymizationMetadata.js'
import { createIsAnonymizedField } from './fields/isAnonymized.js'
import { createAnonymizeApprovedRequest } from './hooks/anonymizeApprovedRequest.js'
import { createAnonymizeTask } from './tasks/anonymizeTask.js'

// The default access-control helpers, re-exported so plugin consumers can use
// them as the building block for their own `access.admin` implementation.
export type {
  AnonymizationRequestsAccessConfig,
  AnonymizationRequestsConfig,
} from './collections/AnonymizationRequests.js'

export type AnonymizationValue =
  | boolean
  | null
  | number
  | string
  | ((context: { anonymousId: string }) => unknown)

export type AnonymizationCollectionConfig = {
  userField: string
  fields: Record<string, AnonymizationValue>
}

export type AnonymizationMetadataConfig = {
  enabled?: boolean
  encryptionKey?: string
}

export type AnonymizerMaskingAutoRunConfig = {
  /**
   * The cron expression for how often queued anonymization jobs are processed.
   *
   * @default '* * * * *'
   */
  cron?: string
  /**
   * Process jobs from all queues. When `false`, only `queue` is processed.
   *
   * @default true
   */
  allQueues?: boolean
  /**
   * The queue to process when `allQueues` is `false`.
   *
   * @default 'default'
   */
  queue?: string
  /**
   * The maximum number of jobs processed per cron tick.
   *
   * @default 10
   */
  limit?: number
  /**
   * Disable automatic scheduling for tasks/workflows that declare a `schedule`.
   *
   * @default false
   */
  disableScheduling?: boolean
  /**
   * Silence the job-system console output (both info and error logs).
   *
   * @default false
   */
  silent?: boolean
}

export type AnonymizerMaskingJobsConfig = {
  /**
   * Toggle the Payload job system. When `false`, no tasks run and no cron is
   * registered. This is separate from `autoRun` (which only controls the cron).
   *
   * @default true
   */
  enabled?: boolean
  /**
   * Control how queued anonymization jobs are auto-processed.
   *
   * - Omit or pass an object to customize the cron (defaults to running every
   *   minute and processing all queues).
   * - Pass `false` to disable the cron entirely; jobs only run when you call
   *   `payload.jobs.run()` (or the admin Jobs panel) yourself.
   *
   * @default { allQueues: true, cron: '* * * * *' }
   */
  autoRun?: AnonymizerMaskingAutoRunConfig | false
}

export type AnonymizerMaskingAccessConfig = {
  /**
   * The `Access` function used anywhere the plugin gates a resource behind an
   * administrator:
   *
   * - `anonymization-requests` — `read`, `update`, `delete` (overridable per
   *   operation via `requests.access`) and the admin-sidebar gate `admin`
   * - `anonymization-logs` and `anonymization-key` — every operation
   * - the injected `isAnonymized` checkbox field (`create` / `update`)
   *
   * This is **required** — provide your own `Access` function (e.g. one
   * exported by a gatekeeper plugin, or your own RBAC check) and every
   * admin-gated operation the plugin registers will honor it.
   */
  admin: Access
}

export type AnonymizerMaskingConfig = {
  collections: Record<string, AnonymizationCollectionConfig>
  metadata?: AnonymizationMetadataConfig
  jobs?: AnonymizerMaskingJobsConfig
  /**
   * Configuration for the plugin-managed `anonymization-requests` collection:
   * which collection the `user` / `approvedBy` relationship fields point to,
   * and optional per-operation access-control overrides.
   */
  requests?: AnonymizationRequestsConfig
  /**
   * Access control used by the plugin for admin-gated resources and fields.
   * Must include an `admin` Access function.
   */
  access: AnonymizerMaskingAccessConfig
  disabled?: boolean
}

const DEFAULT_AUTORUN_CRON = '* * * * *'

/**
 * Combine two `AccessResult` values using AND logic.
 *
 * - `false`/falsy (incl. `null`/`undefined`) acts as a deny.
 * - `true` is neutral (returns the other constraint).
 * - Two `Where` constraints are wrapped in `and`.
 */
const andAccessResults = (a: AccessResult, b: AccessResult): AccessResult => {
  if (a === false || a === null || a === undefined) return false
  if (b === false || b === null || b === undefined) return false
  if (a === true) return b
  if (b === true) return a
  return { and: [a, b] }
}

/**
 * Combine an existing `read` access with the anonymized guard using AND logic.
 * The pre-existing access result is preserved (boolean or query constraint)
 * and ANDed with the guard's constraint.
 */
const guardReadAccess = (existing: Access | undefined, guard: Access): Access => {
  if (!existing) return guard
  return async (args) => {
    const existingResult = await existing(args)
    const guardResult = await guard(args)
    return andAccessResults(existingResult, guardResult)
  }
}

/** Inject the `isAnonymized` field + read guard into every configured collection. */
const applyAnonymizationGuards = (
  config: Config,
  configuredCollections: Record<string, unknown>,
  isAnonymizedField: CheckboxField,
) => {
  for (const slug of Object.keys(configuredCollections)) {
    const collection = config.collections?.find(
      (c): c is CollectionConfig => typeof c === 'object' && c !== null && c.slug === slug,
    )
    if (!collection) continue

    // 1. Inject the `isAnonymized` checkbox field (if it isn't already present).
    const fieldAlreadyPresent = collection.fields?.some(
      (f) => typeof f === 'object' && 'name' in f && f.name === isAnonymizedField.name,
    )
    if (!fieldAlreadyPresent) {
      collection.fields = [...(collection.fields || []), { ...isAnonymizedField }]
    }

    // 2. Guard `read` so anonymized documents are never exposed.
    collection.access = {
      ...collection.access,
      read: guardReadAccess(collection.access?.read, anonymizedRead),
    }
  }
}

export const anonymizerMasking =
  (pluginOptions: AnonymizerMaskingConfig) =>
    (config: Config): Config => {
      if (Object.keys(pluginOptions.collections).length === 0) {
        throw new Error('anonymizerMasking requires at least one configured collection')
      }

      // Kill-switch: don't modify the incoming config at all when disabled
      if (pluginOptions.disabled) {
        return config
      }

      // No validation needed - encryption is optional when metadata is enabled

      // The admin access function used across every resource the plugin
      // registers. Consumers must provide their own implementation via
      // `access.admin`.
      const adminAccess = pluginOptions.access.admin

      const anonymizationRequests = createAnonymizationRequestsCollection(
        pluginOptions.requests,
        adminAccess,
      )

      anonymizationRequests.hooks = {
        ...anonymizationRequests.hooks,
        afterChange: [
          ...(anonymizationRequests.hooks?.afterChange || []),
          createAnonymizeApprovedRequest(pluginOptions.collections, pluginOptions.metadata),
        ],
      }

      if (!config.collections) config.collections = []

      config.collections.push(
        anonymizationRequests,
        AnonymizedIdentities,
        createAnonymizationLogsCollection(adminAccess),
      )

      if (pluginOptions.metadata?.enabled === true) {
        config.collections.push(createAnonymizationKeyCollection(adminAccess), AnonymizationMetadata)
      }

      // Inject the `isAnonymized` checkbox + read guard into every configured
      // collection so anonymized documents are never exposed on reads.
      applyAnonymizationGuards(
        config,
        pluginOptions.collections,
        createIsAnonymizedField(adminAccess),
      )

      // Register the anonymization task in the jobs queue
      if (!config.jobs) {
        config.jobs = {}
      }
      if (!config.jobs.tasks) {
        config.jobs.tasks = []
      }
      config.jobs.tasks.push(
        createAnonymizeTask(pluginOptions.collections),
      )

      // Optional toggle for the Payload job system itself
      if (typeof pluginOptions.jobs?.enabled === 'boolean') {
        // `enabled` is applied during config sanitization but isn't declared on
        // the raw `JobsConfig`, so cast to keep strict TS happy.
        ; (config.jobs as { enabled?: boolean }).enabled = pluginOptions.jobs.enabled
      }

      // The auto-run cron is fully configurable via the plugin options.
      // Pass `autoRun: false` to disable the cron so queued jobs only run when
      // drained manually (e.g. `payload.jobs.run()` from your own scheduler).
      if (pluginOptions.jobs?.autoRun === false) {
        delete config.jobs.autoRun
      } else {
        const autoRun = pluginOptions.jobs?.autoRun ?? {}
        config.jobs.autoRun = [
          {
            allQueues: autoRun.allQueues ?? true,
            cron: autoRun.cron ?? DEFAULT_AUTORUN_CRON,
            ...(autoRun.queue !== undefined ? { queue: autoRun.queue } : {}),
            ...(autoRun.limit !== undefined ? { limit: autoRun.limit } : {}),
            ...(autoRun.disableScheduling !== undefined
              ? { disableScheduling: autoRun.disableScheduling }
              : {}),
            ...(autoRun.silent !== undefined ? { silent: autoRun.silent } : {}),
          },
        ]
      }

      const incomingOnInit = config.onInit
      config.onInit = async (payload) => {
        if (incomingOnInit) await incomingOnInit(payload)

        if (pluginOptions.metadata?.enabled) {
          const { totalDocs } = await payload.count({
            collection: 'anonymization-key',
          })

          if (totalDocs === 0) {
            await payload.create({
              collection: 'anonymization-key',
              data: {
                keyFragment: randomBytes(32).toString('base64'),
              },
              overrideAccess: true,
            })
          }
        }
      }

      return config
    }
