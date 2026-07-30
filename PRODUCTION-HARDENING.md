# ETIB Community Connect production hardening

## Current security model

The directory is intentionally read-only:

- no public account system
- no passwords or authentication tokens
- no business or review submission endpoints
- no administrator dashboard
- no runtime catalog writes
- no database dependency
- no cross-origin API requirement

Business changes require a reviewed GitHub code change and a new deployment.

## Enforced controls

- Helmet security headers and a same-origin content security policy
- `GET` and `HEAD` only under `/api`
- `405 Method Not Allowed` for every API write attempt
- strict catalog validation before the server starts
- safe URL validation for every website and social link
- unique stable IDs, legacy IDs, and featured ranks
- inactive records excluded from all public results and direct lookups
- escaped dynamic content in the browser
- no inline scripts or third-party front-end dependencies

## Operational controls

1. Gather information using `BUSINESS-INTAKE-GUIDE.md`.
2. Verify ownership or blind-community service claims.
3. Record concrete accessibility details and known limitations.
4. Review every contact link.
5. Run the full test and dependency-audit suite.
6. Use a pull request so the catalog change has a clear history.
7. Confirm the live record after Render deploys it.

## Remaining manual verification

Automated checks do not prove real-world accessibility or the truth of a business claim. ETIB should periodically:

- contact listed businesses
- confirm services and contact information
- retest websites and communication channels with assistive technology
- update `lastVerified`
- deactivate records that cannot be confirmed

## Legacy data safety

The former SQLite database is no longer used. Its attached Render disk should remain in place until ETIB has retained any desired backup and completed a stable release cycle on the code-managed catalog.
