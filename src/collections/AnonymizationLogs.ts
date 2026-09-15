import type { Access, CollectionConfig } from 'payload'

export const createAnonymizationLogsCollection = (
    defaultAdmin: Access,
): CollectionConfig => ({
    slug: 'anonymization-logs',
    admin: {
        defaultColumns: ['request', 'status', 'totalCollections', 'totalDocuments', 'startedAt'],
        useAsTitle: 'status',
    },
    access: {
        admin: async (args) => Boolean(await defaultAdmin(args)),
        create: async (args) => Boolean(await defaultAdmin(args)),
        delete: async (args) => Boolean(await defaultAdmin(args)),
        read: async (args) => Boolean(await defaultAdmin(args)),
        update: async (args) => Boolean(await defaultAdmin(args)),
    },
    fields: [
        {
            name: 'request',
            type: 'relationship',
            relationTo: 'anonymization-requests',
            required: true,
        },
        {
            name: 'status',
            type: 'select',
            options: ['started', 'completed', 'failed'],
            required: true,
        },
        {
            name: 'anonymousId',
            type: 'text',
        },
        {
            name: 'startedAt',
            type: 'date',
            required: true,
            admin: {
                date: {
                    pickerAppearance: 'dayAndTime',
                },
            },
        },
        {
            name: 'completedAt',
            type: 'date',
            admin: {
                date: {
                    pickerAppearance: 'dayAndTime',
                },
            },
        },
        {
            name: 'durationMs',
            type: 'number',
        },
        {
            name: 'totalCollections',
            type: 'number',
            defaultValue: 0,
        },
        {
            name: 'totalDocuments',
            type: 'number',
            defaultValue: 0,
        },
        {
            name: 'collectionResults',
            type: 'json',
        },
        {
            name: 'errorMessage',
            type: 'textarea',
        },
    ],
})
