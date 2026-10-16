# ArchPath

ArchPath is a trainee experience log built with Next.js and PostgreSQL.

## Local setup

1. Create a PostgreSQL database and a database user with permission to create tables.
2. Copy `.env.example` to `.env`, set `DATABASE_URL`, generate a unique `JWT_SECRET` with at least 32 random bytes, and configure the university email settings below.
3. Install dependencies with `bun install`.
4. Apply the schema with `bun run db:migrate`.
5. Start the app with `bun run dev`, then open the registration page to create a university administrator account for your university.

Each university administrator first creates an account with their name, `.ac.mw` school email, and password. After signing in, the administrator sets up the single university workspace linked to their account by entering the university name and signing its matching school email domain. This is an in-app MVP simulation: it does not check or change public DNS. There is no central administrator registering domains for multiple universities, and each administrator can access only their own university workspace, dashboard, approvals, and roster. Student and graduate registration is only available for registered university domains. Applicants provide their registration number and school email; roster matches receive a one-time, 48-hour setup link, while unmatched requests go to their own university administrator for review. The applicant sets a password through that link and is signed in only after the activation transaction succeeds. Qualified architect accounts are not publicly self-registered; the Board of Architects provisions them from its register.

University roster CSVs require `registration_number`, `full_name`, `school_email`, `program_type`, `enrollment_status`, and `cohort`. Set `enrollment_status` to `ongoing` or `graduated`; re-importing the same student updates their university status and program. Students can save an alternative email in their workspace. When the university marks an activated student as graduated, that alternative email becomes their unique account email. Apply the latest database changes with `bun run db:migrate` before using these fields.

### Board of Architects administrator

The board administrator has a global oversight workspace at `/board-admin`. It separates qualified architects, university administrators and their university details, student attachments, graduate trainees, and recent signed architect-approved training entries. The dashboard reports counts and assignment activity without exposing password hashes or attachment file contents. It is read-only for university and training records, with a qualified-architect register management section for CSV import, manual entry, and promotion of an existing trainee with an email change. CSV headers are `name,email,board_registration_number,qualification_date`; only name and email are required. Matching trainee accounts are promoted in place, preserving their training history. To change a trainee's email during promotion, use the existing-trainee form: the account ID and training records remain unchanged, active sessions are revoked, the old password is invalidated, and a private, one-time 48-hour activation link is sent to the new address to set a new password. New architect accounts also receive a password-setup link.

The database migration adds the `qualified_architect` role and promotes existing mentor-role accounts without changing their user IDs or assignment history. Run `bun run db:migrate` before deploying the role and invitation changes. The first board administrator is created only through the one-time server-side CLI command; board-admin registration is not available on the public registration form. Set `BOARD_ADMIN_NAME`, `BOARD_ADMIN_EMAIL`, and `BOARD_ADMIN_PASSWORD` in the deployment environment (the password must be at least 12 characters and no more than 72 UTF-8 bytes), then run `bun run board-admin:create`. Keep credentials in a secret manager or protected environment file, not source control or command-line arguments. The command refuses to create an account if a board administrator already exists.

Configure `APP_URL` and either Resend (`RESEND_API_KEY` plus `EMAIL_FROM`) or SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`) for request notifications and approval links. For local Mailpit, use `SMTP_HOST=localhost`, `SMTP_PORT=1025`, blank SMTP credentials, and a sender such as `ArchPath <no-reply@archpath.test>`; open Mailpit at `http://localhost:8025`. Use an `APP_URL` on HTTPS in production. For Gmail SMTP, enable 2-Step Verification on the sender's Google account, create an App Password at https://myaccount.google.com/apppasswords, and set it as `SMTP_PASS`; do not use the normal Gmail password. Use the same Gmail address for `SMTP_USER` and `EMAIL_FROM` unless the sender has configured an allowed alias. To create a local test university admin, run `bun run admin:create-test` after migrations; it creates `test-university-admin@demo.ac.mw` with a generated temporary password, which the command prints once. Sign in with those credentials, register `demo.ac.mw` as the simulation domain, and import a roster using `student1@demo.ac.mw` (the template row is illustrative and must be updated to use your chosen domain). The command refuses to overwrite an existing account. Passwords are stored as bcrypt hashes, not reversible encrypted text. Authenticated sessions use signed JWTs in an HTTP-only cookie and are checked against the PostgreSQL session and current user role on each protected request.

The administrator dashboard separates pending/approved invitations, registered attachment students, and registered graduates in the two-year training program. Student rows show uploaded attachment counts and graduate rows show submitted training-entry counts. Legacy trainee profiles migrate as graduate-training profiles; update `trainee_profiles.program_type` and `registration_number` manually if existing records need different classifications.

Experience entries belong to the signed-in trainee. Each pending experience log can have one JPEG, PNG, or WebP evidence image; certificates accept up to two PDF/JPEG/PNG/WebP files on the trainee record. Each file is limited to 5 MB and is stored in PostgreSQL. Evidence files are associated with a log and can be opened by the trainee's assigned qualified architect through a private link; the review screen does not fetch file bytes until the architect opens that link. Certificates remain trainee-level files.

## Qualified architect invitations and notifications

Qualified architects sign in to the architect workspace; they do not register or sign in under a separate mentor account type. From the invitation section, an architect enters a trainee's email and organization, then selects whether the trainee has graduated. Graduates are invited for two-year training; ongoing students are invited for an academic internship. ArchPath sends a private, single-use link that expires after 48 hours. The trainee confirms acceptance with the password for an account matching the invited email and selected training track. Only after acceptance is a mentorship assignment recorded; each trainee can have one active qualified architect at a time. The architect's Actions page lists pending log books for review, with options to approve or send specific instructions that appear in the trainee's log. Existing assignments are preserved by the role migration.

When a trainee saves an experience entry, the app writes the entry and the assigned architect's inbox notification in the same transaction. If no architect is assigned, the experience is still saved and the trainee sees that no notification was routed. The architect inbox polls while its page is visible and focused; pausing alerts keeps notifications queued in the inbox. The initial notification is in-app; email is used for invitation delivery.

## Signed approval audits

Qualified architects open a pending log in a focused, full-screen review viewport that displays the complete entry and links to that log's evidence image and the trainee's certificates. File bytes are served only when an assigned architect opens a private attachment link. The approval action stays in the bottom review bar.

Approvals use Ed25519 signatures over a versioned JSON snapshot of the entry, trainee identity, approving architect identity, and approval timestamp. The snapshot's SHA-256 digest and signature are stored in the append-only `approval_audit_events` table in the same transaction as the status change. Approved experience rows cannot be edited or deleted through PostgreSQL once approved. Approval hashes and signatures are not included in the trainee-facing experience API.

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
- `bun run admin:create-test` — create an isolated local test university administrator with a generated password.
- `bun run approvals:verify` — verify signed approval records against the configured public key.
- `bun run test:approval-flow` — exercise save, assignment, approval signing, verification, and immutability inside a temporary PostgreSQL schema.
