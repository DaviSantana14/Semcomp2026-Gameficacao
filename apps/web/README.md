This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Semcomp flows

Participants use email + password to register and sign in; CPF is retained as a
required profile field and is not a login credential. The authenticated
participant shell sends a heartbeat every 60 seconds and quietly handles
transient failures. The admin dashboard reads the independent presence overview
and daily history, with an aggregate CSV download rather than minute-level
samples.

Claim Code and reusable-code QR artifacts are administrative downloads. The
participant camera reader starts only after an explicit click, prefers the rear
camera, pauses for confirmation before calling the existing redemption
mutation, and keeps manual code entry available. Camera access works on
`localhost` during development and requires HTTPS when hosted; denied
permission, missing cameras and insecure origins remain recoverable states.

Marco 12 administrative downloads enforce 500-code batch/PDF/ZIP limits,
50,000-row and 25 MiB CSV limits, and expose only aggregate security metrics.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
