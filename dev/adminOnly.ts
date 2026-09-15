import type { Access, PayloadRequest } from 'payload'

/**
 * The plugin's built-in admin access control.
 *
 * It grants access to any user whose `roles` array contains `'admin'` (the
 * same role the Payload admin palette uses). This is the default for every
 * admin-gated operation the plugin registers (`anonymization-requests`,
 * `anonymization-logs`, `anonymization-key` and the `isAnonymized` field).
 *
 * It is NOT baked in: it can be swapped for any `Access` function through the
 * plugin's `access.admin` option — e.g. a gatekeeper plugin or your own RBAC —
 * so nothing here is hard-coded into the collections the plugin creates.
 *
 * @param args - The Payload access arguments (contains `req.user`).
 * @returns `true` when the user has the `admin` role, `false` otherwise.
 */
export const adminOnly: Access = ({ req }: { req: PayloadRequest }): boolean => {
  const roles = (req.user as { roles?: string[] } | null | undefined)?.roles

  return Array.isArray(roles) && roles.includes('admin')
}

/**
 * Default `create` access for `anonymization-requests`: any authenticated
 * user may submit an anonymization request for themselves.
 */
export const authenticated: Access = ({ req }) => Boolean(req.user)
