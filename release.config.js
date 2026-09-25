/**
 * Release config — GIT IS THE SOURCE OF TRUTH FOR THE VERSION.
 *
 *   - The `version` field in package.json is *derived* here from git tags plus
 *     commit messages, and committed back by @semantic-release/git after every
 *     release. Do not hand-edit it to "prepare" a release.
 *   - The last released version is whatever the highest `v*` tag points at.
 *     Publishing a version by hand without tagging it makes the next automated
 *     release collide with it (npm: "You cannot publish over the previously
 *     published versions").
 *   - Commit types that trigger a release (exact, case-sensitive match):
 *       fix:  -> patch        feat: -> minor        (also ALL-CAPS FIX: / FEAT:)
 *     Mixed case (`Fix:`, `Feat:`) or a space before the colon (`FIX : ...`)
 *     matches no rule and releases nothing. `docs:`/`chore:`/`ci:` never release.
 *   - Baseline: tag `v1.0.5` marks everything up to it as released, so the first
 *     automated release starts at 1.0.6.
 */

/** @type {import('semantic-release').Options} */
export default {
  branches: ['master'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        assets: [],
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
}
