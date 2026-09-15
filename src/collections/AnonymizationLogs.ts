import type { Access, CollectionConfig } from 'payload'

import { adminOnly } from '../../dev/adminOnly.js'

export const createAnonymizationLogsCollection = (
    defaultAdmin: Access = adminOnly,
): CollectionConfig => ({
    slug: 'anonymization-logs',
    admin: {
        defaultColumns: ['request', 'status', 'totalCollections', 'totalDocuments', 'startedAt'],
        useAsTitle: 'status',
    },
    access: {
        admin: defaultAdmin,
        create: defaultAdmin,
        delete: defaultAdmin,
        read: defaultAdmin,
        update: defaultAdmin,
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
