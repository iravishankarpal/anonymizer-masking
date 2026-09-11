import type { Access } from 'payload'

/**
 * Collection read guard for the anonymizer-masking plugin.
 *
 * Returns a query constraint that only allows documents where `isAnonymized`
 * is NOT `true` — i.e. it is `false` or `undefined`/`null`. Documents flagged
 * as anonymized (`isAnonymized === true`) are excluded from every read path:
 * list queries, counts, and `findByID` (Payload ANDs this constraint with the
 * requested document ID).
 *
 * @note In Payload 3.84 the read access function does not receive the document,
 * so a query constraint is the only reliable way to deny reads per-document.
 */
export const anonymizedRead: Access = () => ({
  isAnonymized: { not_equals: true },
})
