# Releasing

Releases go out from CI. When `main` has a version in `package.json` that npm doesn't have
yet, the `publish` job in [`ci.yml`](.github/workflows/ci.yml) publishes it, once the checks
and tests pass. It then tags the commit `vX.Y.Z` and makes a GitHub release from the version's
section in [`CHANGELOG.md`](CHANGELOG.md). A merge that doesn't change the version publishes
nothing.

npm trusts the workflow through [trusted publishing](https://docs.npmjs.com/trusted-publishers),
so no npm token is stored in GitHub, and every version gets a provenance statement linking it
to the commit and run that built it.

## Releasing a version

1. On a branch, bump the version without tagging. CI makes the tag.

   ```bash
   npm version minor --no-git-tag-version   # or patch, major, or e.g. 0.3.0-beta.1
   ```

2. In `CHANGELOG.md`, rename `## [Unreleased]` to the new version and start an empty
   `## [Unreleased]` above it. The job refuses to publish a version with no section.
3. Open a pull request, and merge it once CI is green.

The run on `main` publishes the version, then tags and releases it. A version with a
prerelease part (`0.3.0-beta.1`) goes to npm under the `next` tag, so `npm install leafthrough`
still gets the latest stable one. On GitHub it's marked as a prerelease.

If a run fails partway, fix the cause and re-run the job (or run the CI workflow on `main` from
the Actions tab). Each step checks what's missing, so nothing happens twice.

## One-time setup

npm only lets you set up trusted publishing for a package that already exists, so the first
version is published by hand.

1. **Publish 0.1.0 from your machine.** You need an npm account with two-factor
   authentication. From an up-to-date `main` with no local changes:

   ```bash
   npm login
   npm ci
   npm publish   # builds first (prepublishOnly)
   ```

2. **Trust the workflow.** On npmjs.com, open the package's **Settings**, then **Trusted
   publishing**. Choose **GitHub Actions** and enter:

   | Field             | Value         |
   | ----------------- | ------------- |
   | Organization/user | `dmtrbrl`     |
   | Repository        | `leafthrough` |
   | Workflow filename | `ci.yml`      |
   | Environment       | `npm`         |

   Under **Allowed actions**, tick **Allow npm publish**. Without it npm only lets the
   workflow stage versions for approval, and its `npm publish` is refused. Leave **Allow
   npm dist-tag** unticked: the workflow sets the tag as part of publishing.

3. **Turn off tokens.** In the same settings, under **Publishing access**, choose **Require
   two-factor authentication and disallow bypass 2fa tokens**. Trusted publishing keeps
   working, and a leaked token can't publish.
4. **Release 0.1.0 on GitHub.** In the repository's **Actions** tab, run the **CI** workflow
   on `main`. It finds 0.1.0 already on npm, so it only tags and releases it.

The workflow's first run creates the `npm` environment in GitHub
(**Settings → Environments**). To make sure only `main` can publish, set its **Deployment
branches and tags** to `main`. To approve each release by hand, add yourself as a
**Required reviewer** there.
