import type { Access, CheckboxField } from 'payload'

import { adminOnly } from '../access/adminOnly.js'

/**
 * Builds the `isAnonymized` checkbox field injected into every configured
 * collection.
 *
 * - Defaults to `false`.
 * - Only admins may toggle it, so regular users can't un-anonymize data.
 * - When `true`, the `anonymizedRead` collection access guard hides the
 *   document from all reads (admin panel, REST, GraphQL and the Local API
 *   unless `overrideAccess` is set).
 *
 * The admin gate is not hard-coded: it accepts the plugin's configured
 * `access.admin` function (defaulting to the built-in `adminOnly`) so a
 * gatekeeper plugin or custom RBAC is honored here as well.
 */
export const createIsAnonymizedField = (defaultAdmin: Access = adminOnly): CheckboxField => ({
    name: 'isAnonymized',
    type: 'checkbox',
    label: 'Anonymized?',
    defaultValue: false,
    admin: {
        description: 'When enabled, this record is anonymized and hidden from reads.',
        position: 'sidebar',
    },
    access: {
        create: defaultAdmin,
        update: defaultAdmin,
    },
})
