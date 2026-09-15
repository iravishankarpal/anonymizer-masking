import type { Access, CollectionConfig } from 'payload'

export const createAnonymizationKeyCollection = (
    defaultAdmin: Access,
): CollectionConfig => ({
    slug: 'anonymization-key',
    admin: {
        hidden: true,
    },
    access: {
        admin: async (args) => Boolean(await defaultAdmin(args)),
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
