import type { Access, CollectionConfig } from 'payload'

import { adminOnly } from '../access/adminOnly.js'

export const createAnonymizationKeyCollection = (
    defaultAdmin: Access = adminOnly,
): CollectionConfig => ({
    slug: 'anonymization-key',
    admin: {
        hidden: true,
    },
    access: {
        admin: defaultAdmin,
        create: () => false,
        delete: () => false,
        read: () => false,
        update: () => false,
    },
    fields: [
        {
            name: 'keyFragment',
            type: 'text',
            required: true,
            unique: true,
            admin: {
                hidden: true,
            },
            access: {
                create: () => false,
                read: () => false,
                update: () => false,
            },
        },
    ],
})
