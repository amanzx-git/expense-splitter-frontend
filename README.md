# Splitter — Frontend

**Splitter** is a React web app for sharing expenses with friends and groups, calculating exact balances, and tracking settlements. Built with **React 19, Vite, and React Router**.

[Backend repository](https://github.com/amanzx-git/expense-splitter-backend) · [MIT License](LICENSE)

> **Status:** Active development; deployment is planned. No public production demo URL is claimed here.

## Start here

**Recruiter / reviewer?** See the [engineering case study](https://github.com/amanzx-git/expense-splitter-backend/blob/main/docs/PROJECT_CASE_STUDY.md) for the financial algorithms, database consistency, authentication, and system architecture. The [backend API repository](https://github.com/amanzx-git/expense-splitter-backend) documents server setup and tests.

**Explore:** [Engineering case study](https://github.com/amanzx-git/expense-splitter-backend/blob/main/docs/PROJECT_CASE_STUDY.md) · [Production readiness checklist](https://github.com/amanzx-git/expense-splitter-backend/blob/main/docs/DEPLOYMENT_CHECKLIST.md)

## Features

- **Guest Quick Split:** calculate an equal expense split without signing in; calculations run client-side and remain available even when the backend is unavailable.
- **Accounts:** registration, email verification, login, password reset, and user profile workflows.
- **Groups:** create groups, invite members, and manage membership.
- **Expenses:** add, edit, delete, filter, and comment on shared expenses; choose participants for each split.
- **Balances and settlements:** preview balances, view settlement history, and generate settlements with appropriate permissions.
- **Payment tracking:** payer reports payment, receiver confirms it; optional UPI link/QR convenience. **Splitter does not move money or independently verify bank transfers.**
- **Notifications:** unread count and contextual updates for relevant group activity.
- **Resilient UI:** backend-outage messaging and client-only Quick Split.

Money is calculated with **integer paise arithmetic** and deterministic remainder allocation to avoid floating-point rounding differences.

## How it works

```text
React + Vite (browser)
  |  guest Quick Split: local calculations
  |
  +---- REST / session cookies / CSRF ----> Django REST Framework
                                                |
                                                v
                                            PostgreSQL
```

The frontend and backend are separate repositories. The backend handles persistence, permissions, group balances, and official settlements.

## Local development

Prerequisites: Node.js and npm. For authenticated/group features, run the [backend](https://github.com/amanzx-git/expense-splitter-backend) as well.

```bash
git clone https://github.com/amanzx-git/expense-splitter-frontend.git
cd expense-splitter-frontend
npm install
npm run dev
```

Open the local address printed by Vite (typically `http://localhost:5173`).

The repository includes `.env.example`. Copy it to `.env` only if your development setup requires overrides. **Never put private keys or secrets in Vite environment variables:** browser-exposed `VITE_*` values are public.

Useful commands:

```bash
npm run test      # Run Vitest tests
npm run build     # Create a production build
npm run preview   # Preview the build locally
```

## Security and deployment

Session-authenticated requests use the backend's CSRF/session setup. Deployment must configure a trustworthy API origin/proxy, HTTPS, cookie security, and frontend/backend origin settings. No production infrastructure or CI/CD deployment is claimed until it is implemented and verified.

## Repository naming

The public product is **Splitter**. The repository name `expense-splitter-frontend` is retained intentionally; this is a branding change, not a change to API contracts.

## License

MIT License — © 2026 Aman Yadav. See [LICENSE](LICENSE).
