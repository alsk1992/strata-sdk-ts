# Contributing

Open an issue before making a breaking public-contract change. Small fixes may
go directly to a pull request.

Pull requests must preserve strict response validation, atomic-string money
semantics, the read-only safety boundary, and composition-opaque Sonar wording.
Do not add private service names, infrastructure details, routing composition,
credentials, wallet handling, or transaction submission.

Run the repository checks before requesting review:

```sh
npm ci
npm run ci
```

Every release is built and published from this public repository. Version and
contract changes require a maintainer-reviewed release note.
