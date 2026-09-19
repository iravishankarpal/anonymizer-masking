import type { Access, CollectionConfig, CollectionSlug } from 'payload'

/** Any logged-in user may submit an anonymization request. */
const authenticated: Access = ({ req }) => Boolean(req.user)

/**
 * Per-operation access-control overrides for the plugin-managed
 * `anonymization-requests` collection. Any operation not listed here falls
 * back to the plugin defaults:
 *
 * - `create` → `authenticated` (any logged-in user)
 * - `read`, `update`, `delete` and the admin-sidebar gate `admin` → the
 *   configured `access.admin` (defaults to the built-in `adminOnly`)
 */
export type AnonymizationRequestsAccessConfig = {
    admin?: Access
    create?: Access
    delete?: Access
    read?: Access
    update?: Access
}

/**
 * Configuration for the `anonymization-requests` collection registered by the
 * plugin. Use it to point the `user` / `approvedBy` relationship fields at a
 * custom collection (instead of the hard-coded `'users'`) and to override the
 * collection's access control.
 */
export type AnonymizationRequestsConfig = {
    /**
     * The collection slug the `user` relationship field on
     * `anonymization-requests` points to.
     *
     * @default 'users'
     */
    userRelationTo?: string
    /**
     * The collection slug the `approvedBy` relationship field on
     * `anonymization-requests` points to.
     *
     * @default 'users'
     */
    approvedByRelationTo?: string
    /**
     * Per-operation access-control overrides for the collection. When omitted,
     * `create` allows any authenticated user and every other operation is
     * restricted to `defaultAdmin` (the plugin's `access.admin`).
     */
    access?: AnonymizationRequestsAccessConfig
}

export const createAnonymizationRequestsCollection = (
    config: AnonymizationRequestsConfig = {},
    defaultAdmin: Access,
): CollectionConfig => {
    const { access = {}, approvedByRelationTo = 'users', userRelationTo = 'users' } = config
    const admin = access.admin ?? defaultAdmin

    return {
        slug: 'anonymization-requests',
        admin: {
            defaultColumns: ['user', 'status', 'createdAt'],
            useAsTitle: 'status',
        },
        access: {
            admin: async (args) => Boolean(await admin(args)),
            create: access.create ?? authenticated,
            delete: access.delete ?? admin,
            read: access.read ?? admin,
            update: access.update ?? admin,
        },
        fields: [
            {
                name: 'user',
                type: 'relationship',
                relationTo: userRelationTo as CollectionSlug,
                required: true,
            },
            {
                name: 'status',
                type: 'select',
                defaultValue: 'pending',
                options: ['pending', 'approved', 'processing', 'completed', 'rejected'],
                required: true,
            },
            {
                name: 'approvedBy',
                type: 'relationship',
                relationTo: approvedByRelationTo as CollectionSlug,
            },
            {
                name: 'anonymizedRecord',
                type: 'relationship',
                relationTo: 'anonymized-identities',
            },
        ],
        hooks: {
            afterChange: [],
        },
    }
}
