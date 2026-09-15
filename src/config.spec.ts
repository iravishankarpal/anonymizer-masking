import { describe, expect, test } from 'vitest'

import type { Access, CollectionConfig, Config } from 'payload'

import { adminOnly, authenticated } from '../dev/adminOnly.js'
import { createAnonymizationRequestsCollection } from './collections/AnonymizationRequests.js'
import { createAnonymizationLogsCollection } from './collections/AnonymizationLogs.js'
import { createAnonymizationKeyCollection } from './collections/AnonymizationKey.js'
import { createIsAnonymizedField } from './fields/isAnonymized.js'
import { anonymizerMasking } from './index.js'

const findField = (collection: CollectionConfig, name: string) =>
  collection.fields.find(
    (field) => typeof field === 'object' && field !== null && 'name' in field && field.name === name,
  )

describe('anonymizer-masking configurable fields & access', () => {
  test('defaults `user` and `approvedBy` relationship fields to the users collection', () => {
    const collection = createAnonymizationRequestsCollection({}, adminOnly)

    expect(findField(collection, 'user')).toMatchObject({
      name: 'user',
      relationTo: 'users',
      required: true,
      type: 'relationship',
    })
    expect(findField(collection, 'approvedBy')).toMatchObject({
      name: 'approvedBy',
      relationTo: 'users',
      type: 'relationship',
    })

    // Built-in defaults: authenticated can create, only admins can manage.
    expect(collection.access?.admin).toBe(adminOnly)
    expect(collection.access?.create).toBe(authenticated)
    expect(collection.access?.read).toBe(adminOnly)
    expect(collection.access?.update).toBe(adminOnly)
    expect(collection.access?.delete).toBe(adminOnly)
  })

  test('lets the relationship targets come from config', () => {
    const collection = createAnonymizationRequestsCollection({
      approvedByRelationTo: 'staff',
      userRelationTo: 'customers',
    })

    expect((findField(collection, 'user') as { relationTo?: string }).relationTo).toBe('customers')
    expect((findField(collection, 'approvedBy') as { relationTo?: string }).relationTo).toBe('staff')
  })

  test('lets the admin access control come from config', () => {
    const gatekeeperAdmin: Access = ({ req }) =>
      Boolean((req.user as { roles?: string[] } | null)?.roles?.includes('superadmin'))

    const collection = createAnonymizationRequestsCollection({}, gatekeeperAdmin)

    expect(collection.access?.admin).toBe(gatekeeperAdmin)
    expect(collection.access?.read).toBe(gatekeeperAdmin)
    expect(collection.access?.update).toBe(gatekeeperAdmin)
    expect(collection.access?.delete).toBe(gatekeeperAdmin)
  })

  test('lets per-operation access be overridden for requests', () => {
    const allowAll: Access = () => true
    const collection = createAnonymizationRequestsCollection({
      access: { create: allowAll, read: allowAll },
    }, adminOnly)

    expect(collection.access?.create).toBe(allowAll)
    expect(collection.access?.read).toBe(allowAll)
    expect(collection.access?.update).toBe(adminOnly)
    expect(collection.access?.admin).toBe(adminOnly)
  })

  test('uses the configured admin access for logs, keys and the isAnonymized field', () => {
    const gatekeeperAdmin: Access = () => false

    expect(createAnonymizationLogsCollection(gatekeeperAdmin).access?.read).toBe(gatekeeperAdmin)
    expect(createAnonymizationKeyCollection(gatekeeperAdmin).access?.admin).toBe(gatekeeperAdmin)
    expect(createIsAnonymizedField(gatekeeperAdmin).access?.create).toBe(gatekeeperAdmin)
    expect(createIsAnonymizedField(gatekeeperAdmin).access?.update).toBe(gatekeeperAdmin)
  })

  test('wires every configured option through the plugin entry point', () => {
    const gatekeeperAdmin: Access = ({ req }) =>
      Boolean((req.user as { roles?: string[] } | null)?.roles?.includes('superadmin'))
    const usersCollection: CollectionConfig = { slug: 'users', fields: [] }

    const config = anonymizerMasking({
      collections: {
        users: { userField: 'id', fields: { name: null } },
      },
      requests: {
        approvedByRelationTo: 'staff',
        userRelationTo: 'customers',
      },
      access: {
        admin: gatekeeperAdmin,
      },
    })({ collections: [usersCollection], secret: 'test' } as unknown as Config)

    const requestsCollection = config.collections?.find(
      (c): c is CollectionConfig => typeof c === 'object' && c !== null && c.slug === 'anonymization-requests',
    )
    expect(requestsCollection).toBeDefined()
    expect((findField(requestsCollection!, 'user') as { relationTo?: string }).relationTo).toBe('customers')
    expect((findField(requestsCollection!, 'approvedBy') as { relationTo?: string }).relationTo).toBe('staff')
    expect(requestsCollection!.access?.read).toBe(gatekeeperAdmin)
    expect(requestsCollection!.access?.update).toBe(gatekeeperAdmin)

    // The configured collections receive the `isAnonymized` field guarded by
    // the configured admin access.
    const injectedField = findField(usersCollection, 'isAnonymized')
    expect(injectedField).toBeDefined()
    expect((injectedField as { access?: { create?: Access } }).access?.create).toBe(gatekeeperAdmin)
    expect(usersCollection.access?.read).toBeTypeOf('function')
  })
})