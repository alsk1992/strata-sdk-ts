# Releasing

Releases are built from this public repository so npm provenance resolves to the
source users can audit.

1. Merge through protected `main` with CI passing.
2. Update the package version and release notes in a reviewed pull request.
3. Create a signed `vX.Y.Z` tag on the reviewed commit.
4. Publish the matching GitHub release.
5. Approve the `npm-release` environment deployment.

The `publish.yml` workflow uses npm trusted publishing with GitHub OIDC and no
long-lived publish token. Configure the npm trusted publisher with owner
`alsk1992`, repository `strata-sdk-ts`, workflow `publish.yml`, environment
`npm-release`, and publish permission.

The package does not yet exist in npm. Bootstrap version `0.1.0` once from the
reviewed public tag using an owner-controlled interactive npm session. Then
configure trusted publishing, disallow token publishing, and use only the
workflow for later versions.
