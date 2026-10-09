# ArchPath

ArchPath is a trainee experience log built with Next.js and PostgreSQL.

## Local setup

1. Create a PostgreSQL database and a database user with permission to create tables.
2. Copy `.env.example` to `.env`, set `DATABASE_URL`, and generate a unique `JWT_SECRET` with at least 32 random bytes.
3. Install dependencies with `bun install`.
4. Apply the schema with `bun run db:migrate`.
5. Start the app with `bun run dev`.

The first account created is a trainee by default. Registration offers an explicit mentor option. Passwords are stored as bcrypt hashes, not reversible encrypted text. Authenticated sessions use signed JWTs in an HTTP-only cookie and are checked against the PostgreSQL session and current user role on each protected request.

Experience entries belong to the signed-in trainee. Each pending experience log can have one JPEG, PNG, or WebP evidence image; certificates accept up to two PDF/JPEG/PNG/WebP files on the trainee record. Each file is limited to 5 MB and is stored in PostgreSQL. Evidence files are associated with a log and can be opened by the trainee's assigned mentor through a private link; the review screen does not fetch file bytes until the mentor opens that link. Certificates remain trainee-level files.

## Mentor assignments and notifications

Mentor assignments are currently provisioned directly in PostgreSQL; there is no assignment UI yet. Each trainee can have only one active mentor assignment. The assignment source can be `organization` or `mentor`; organization assignments include the organization name. Agreement/certificate evidence and university relationships are future work.

Example direct mentor assignment:

```sql
INSERT INTO mentor_assignments (trainee_id, mentor_id, assigned_by, assignment_source)
SELECT trainee.id, mentor.id, mentor.id, 'mentor'
FROM users AS trainee
JOIN users AS mentor ON mentor.email = 'mentor@example.com' AND mentor.role = 'mentor'
JOIN trainee_profiles AS profile ON profile.user_id = trainee.id
WHERE trainee.email = 'trainee@example.com' AND trainee.role = 'trainee';
```

For an organization assignment, use `assignment_source = 'organization'`, set `organization_name`, and set `assigned_by` to the responsible mentor/admin account when available. To change a current assignment, first set its `ended_at` timestamp, then insert its replacement.

When a trainee saves an experience entry, the app writes the entry and its assigned mentor's inbox notification in the same transaction. If no mentor is assigned, the experience is still saved and the trainee sees that no notification was routed. The mentor inbox polls while its page is visible and focused; pausing alerts keeps notifications queued in the inbox. This MVP does not send email, mobile push, or notifications while the mentor is offline.

## Signed approval audits

Mentors open a pending log in a focused, full-screen review viewport that displays the complete entry and links to that log's evidence image and the trainee's certificates. File bytes are served only when a mentor opens a private attachment link. The approval action stays in the bottom review bar.

Approvals use Ed25519 signatures over a versioned JSON snapshot of the entry, trainee identity, approving mentor identity, and approval timestamp. The snapshot's SHA-256 digest and signature are stored in the append-only `approval_audit_events` table in the same transaction as the status change. Approved experience rows cannot be edited or deleted through PostgreSQL once approved. Approval hashes and signatures are not included in the trainee-facing experience API.

Before enabling approvals, generate an Ed25519 keypair. Keep the PKCS#8 private key only in the application secret store; never commit it or send it to clients. Configure `APPROVAL_SIGNING_PRIVATE_KEY` as base64-encoded PKCS#8 DER, `APPROVAL_SIGNING_PUBLIC_KEY` as base64-encoded SPKI DER, and a stable `APPROVAL_SIGNING_KEY_ID`. The app verifies the public/private keypair matches before signing:

```sh
openssl genpkey -algorithm ED25519 -out approval-private.pem
openssl pkey -in approval-private.pem -pubout -out approval-public.pem
openssl pkcs8 -topk8 -nocrypt -in approval-private.pem -outform DER | base64 -w0
openssl pkey -pubin -in approval-public.pem -outform DER | base64 -w0
```

Set the first command's output to `APPROVAL_SIGNING_PRIVATE_KEY`, the second to `APPROVAL_SIGNING_PUBLIC_KEY`, and choose a key id, then run `bun run db:migrate`. Run `bun run approvals:verify` to validate stored hashes and signatures against the configured trusted public key. Auditors should obtain and pin that public key through a separate trusted channel. This application signature records an approval made under the mentor's authenticated account; it is not a personal signing key, a certificate authority, or by itself a legal identity/non-repudiation guarantee. Keep protected, independently backed-up audit exports and restrict database write access for stronger forensic assurance.

The MVP verifier currently trusts one configured public key. Keep its key id and public key stable; do not rotate or replace the signing key until a trusted-key history/rotation process has been set up, or older approvals will no longer verify with the current command.

## Commands

- `bun run dev` — run the development server.
- `bun run lint` — run ESLint.
- `bun run build` — build the production app.
- `bun run db:migrate` — apply any unapplied SQL migrations.
- `bun run approvals:verify` — verify signed approval records against the configured public key.
- `bun run test:approval-flow` — exercise save, assignment, approval signing, verification, and immutability inside a temporary PostgreSQL schema.
