import { randomUUID } from 'node:crypto'

import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload

afterAll(async () => {
  if (payload) await payload.destroy()
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

const createUser = async (roles: string[], prefix: string) =>
  payload.create({
    collection: 'users',
    data: {
      address: '123 Example Street',
      email: `${prefix}-${randomUUID()}@payloadcms.com`,
      name: `${prefix} name`,
      password: 'test',
      phone: '123-456-7890',
      roles,
    },
    overrideAccess: true,
  })

describe('Plugin integration tests', () => {
  test('anonymizes a user and related private records via queued job', async () => {
    const admin = await createUser(['admin'], 'admin')
    const target = await createUser(['admin'], 'target')

    const address = await payload.create({
      collection: 'user-addresses',
      data: {
        addressLine1: '123 Example Street',
        city: 'Private City',
        postalCode: '12345',
        user: target.id,
      },
    })
    const creditCard = await payload.create({
      collection: 'user-credit-cards',
      data: {
        cardNumber: '4111111111111111',
        cardholderName: 'Private Person',
        cvv: '123',
        expiry: '12/30',
        user: target.id,
      },
    })
    const transaction = await payload.create({
      collection: 'transactions',
      data: {
        amount: 125.5,
        paymentMethod: 'card',
        privateNote: 'Private purchase note',
        user: target.id,
      },
    })

    const request = await payload.create({
      collection: 'anonymization-requests',
      data: {
        requestedBy: admin.id,
        user: target.id,
      },
      overrideAccess: false,
      user: admin,
    })

    await payload.update({
      collection: 'anonymization-requests',
      data: { status: 'approved' },
      id: request.id,
      overrideAccess: false,
      user: admin,
    })

    // The afterChange hook queues `anonymizeDataTask` and sets the request to
    // 'processing'. In the running app the `jobs.autoRun` cron drains the queue
    // every minute. In tests we drain it on demand via the Local API.
    const processingRequest = await payload.findByID({
      collection: 'anonymization-requests',
      id: request.id,
      depth: 0,
    })
    expect(processingRequest.status).toBe('processing')

    await payload.jobs.run({ allQueues: true })

    const anonymizedUser = await payload.findByID({
      collection: 'users',
      id: target.id,
    })
    const anonymizedAddress = await payload.findByID({
      collection: 'user-addresses',
      id: address.id,
    })
    const anonymizedCreditCard = await payload.findByID({
      collection: 'user-credit-cards',
      id: creditCard.id,
    })
    const preservedTransaction = await payload.findByID({
      collection: 'transactions',
      id: transaction.id,
    })
    const completedRequest = await payload.findByID({
      collection: 'anonymization-requests',
      id: request.id,
      depth: 0,
    })

    expect(anonymizedUser).toMatchObject({
      address: null,
      email: expect.stringMatching(/^anon-[0-9a-f-]+@anonymized\.local$/),
      name: expect.stringMatching(/^Anonymous User [0-9a-f]{8}$/),
      phone: null,
    })
    // The anonymization job marks the processed documents as anonymized
    expect((anonymizedUser as { isAnonymized?: boolean }).isAnonymized).toBe(true)
    expect((anonymizedCreditCard as { isAnonymized?: boolean }).isAnonymized).toBe(true)
    expect(anonymizedAddress).toMatchObject({
      addressLine1: null,
      city: null,
      postalCode: null,
    })
    expect(anonymizedCreditCard).toMatchObject({
      cardNumber: '0000000000000000',
      cardholderName: 'Anonymous User',
      cvv: null,
      expiry: null,
    })
    expect(preservedTransaction).toMatchObject({
      amount: 125.5,
      paymentMethod: 'card',
      privateNote: null,
    })
    expect(completedRequest.status).toBe('completed')
    expect(completedRequest.approvedBy).toBe(admin.id)
    expect(completedRequest.anonymizedRecord).toBeTruthy()

    const { docs: logs } = await payload.find({
      collection: 'anonymization-logs',
      where: { request: { equals: request.id } },
      depth: 0,
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      status: 'completed',
      totalCollections: 4,
      totalDocuments: 4,
    })
    expect(logs[0].durationMs).toEqual(expect.any(Number))
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(logs[0].collectionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'transactions', documentsMasked: 1 }),
        expect.objectContaining({ collection: 'user-credit-cards', documentsMasked: 1 }),
      ]),
    )

    const identity = await payload.findByID({
      collection: 'anonymized-identities',
      id: completedRequest.anonymizedRecord as string,
    })
    expect(identity).toMatchObject({
      originalCollection: 'users',
      originalDocId: String(target.id),
    })
    expect(
      ((identity.maskedFields as { collections: { users: string[] } }).collections).users,
    ).toEqual(expect.arrayContaining(['name', 'email', 'phone', 'address']))

    const metadataRecords = await payload.find({
      collection: 'anonymization-metadata',
      where: { identity: { equals: completedRequest.anonymizedRecord as string } },
      limit: 1,
      overrideAccess: true,
    })
    // Metadata is stored for the runtime config `metadata: { enabled: true }`.
    // Note: no `encryptionKey` is configured in the dev setup, so it is stored
    // as plaintext `{ capturedAt, collections }`.
    expect(metadataRecords.docs).toHaveLength(1)
    expect(metadataRecords.docs[0].encryptedData).toMatchObject({
      capturedAt: expect.any(String),
      collections: expect.any(Object),
    })
  })

  test('only admins can read anonymization requests', async () => {
    const regularUser = await createUser(['user'], 'regular')
    const request = await payload.create({
      collection: 'anonymization-requests',
      data: {
        requestedBy: regularUser.id,
        user: regularUser.id,
      },
      overrideAccess: true,
    })

    await expect(
      payload.find({
        collection: 'anonymization-requests',
        overrideAccess: false,
        user: regularUser,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'anonymization-requests',
        data: { status: 'rejected' },
        id: request.id,
        overrideAccess: false,
        user: regularUser,
      }),
    ).rejects.toThrow()
  })

  test('queued job can be drained immediately via runByID after approval (dev path)', async () => {
    const admin = await createUser(['admin'], 'runbyid-admin')
    const target = await createUser(['user'], 'runbyid-target')

    const address = await payload.create({
      collection: 'user-addresses',
      data: {
        addressLine1: '77 Dev Lane',
        city: 'Dev Town',
        postalCode: '11111',
        user: target.id,
      },
    })

    const request = await payload.create({
      collection: 'anonymization-requests',
      data: {
        requestedBy: admin.id,
        user: target.id,
      },
      overrideAccess: false,
      user: admin,
    })

    // Approving queues the job WITHOUT `req`, so it is committed immediately
    // and visible to any runner (this is the key fix - the job is no longer
    // created inside the still-uncommitted update transaction).
    await payload.update({
      collection: 'anonymization-requests',
      data: { status: 'approved' },
      id: request.id,
      overrideAccess: false,
      user: admin,
    })

    const { docs: queuedJobs } = await payload.find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: 'anonymizeDataTask' } },
          { processing: { equals: false } },
          { completedAt: { exists: false } },
        ],
      },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })
    expect(queuedJobs.length).toBe(1)

    // In development the hook defers this call until after the outer update
    // transaction has committed. Here we call it directly (transaction is
    // already committed) to prove it finds and runs the job.
    await payload.jobs.runByID({ id: queuedJobs[0].id })

    const anonymizedUser = await payload.findByID({
      collection: 'users',
      id: target.id,
    })
    const anonymizedAddress = await payload.findByID({
      collection: 'user-addresses',
      id: address.id,
    })
    const completedRequest = await payload.findByID({
      collection: 'anonymization-requests',
      id: request.id,
      depth: 0,
    })

    expect(anonymizedUser).toMatchObject({
      address: null,
      name: expect.stringMatching(/^Anonymous User /),
    })
    expect((anonymizedUser as { isAnonymized?: boolean }).isAnonymized).toBe(true)
    expect(anonymizedAddress).toMatchObject({
      addressLine1: null,
      city: null,
      postalCode: null,
    })
    expect(completedRequest.status).toBe('completed')
  })

  test('anonymized documents are hidden from reads unless isAnonymized is false/undefined', async () => {
    const target = await createUser(['user'], 'masked')

    // The injected checkbox defaults to false
    expect((target as { isAnonymized?: boolean }).isAnonymized).toBe(false)

    // A non-anonymized document is readable with access control enforced
    const readable = await payload.findByID({
      collection: 'users',
      id: target.id,
      overrideAccess: false,
    })
    expect(readable.id).toBe(target.id)

    // Flag the document as anonymized (only possible via admin/internal ops)
    await payload.update({
      collection: 'users',
      id: target.id,
      data: { isAnonymized: true },
      overrideAccess: true,
    })

    // It must NOT be readable while access control is enforced
    await expect(
      payload.findByID({
        collection: 'users',
        id: target.id,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Documents missing the flag (undefined) stay readable
    const address = await payload.create({
      collection: 'user-addresses',
      data: {
        addressLine1: '1 Main St',
        city: 'Town',
        postalCode: '00000',
        user: target.id,
      },
    })
    const addressRead = await payload.findByID({
      collection: 'user-addresses',
      id: address.id,
      overrideAccess: false,
    })
    expect(addressRead.addressLine1).toBe('1 Main St')
  })
})