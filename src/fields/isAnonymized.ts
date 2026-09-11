import type { CheckboxField } from 'payload'

import { adminOnly } from '../access/adminOnly.js'

/**
 * Flags a document as anonymized.
 *
 * - Defaults to `false`.
 * - Only admins may toggle it, so regular users can't un-anonymize data.
 * - When `true`, the `anonymizedRead` collection access guard hides the
 *   document from all reads (admin panel, REST, GraphQL and the Local API
 *   unless `overrideAccess` is set).
 */
export const isAnonymizedField: CheckboxField = {
  name: 'isAnonymized',
  type: 'checkbox',
  label: 'Anonymized?',
  defaultValue: false,
  admin: {
    description: 'When enabled, this record is anonymized and hidden from reads.',
    position: 'sidebar',
  },
  access: {
    create: adminOnly,
    update: adminOnly,
  },
}
