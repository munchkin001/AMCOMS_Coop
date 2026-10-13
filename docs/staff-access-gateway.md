# Staff access gateway

AMCOMS is a Vite/React single-page application. Its staff login is gated by a Vercel serverless endpoint; the access code is never checked in browser code.

## Vercel configuration

In the AMCOMS Vercel project, add these server-side environment variables for the **Production** environment:

- `STAFF_ACCESS_CODE`: a randomly generated access phrase of at least 12 characters.
- `STAFF_GATEWAY_SECRET`: a separate random secret of at least 32 characters, used to sign the temporary gateway cookie.

Generate a signing secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Do not add either value to `VITE_*` variables, source control, or client-side configuration. Redeploy after changing Vercel environment variables. Use separate, non-production values for Preview deployments if those deployments need the gateway.

The Vercel deployment must include the root-level `api/staff-access.js` function. For local end-to-end development, run the app through `vercel dev` with local environment variables; Vite's development server does not provide this API function.

## Firewall requirement

Configure a Vercel Firewall rate-limit rule for `POST /api/staff-access` before sharing the gateway publicly. Set a low attempt limit (for example, 5 attempts per IP in 5 minutes) and deny or challenge excess requests. The function intentionally does not use in-memory rate limiting because serverless instances do not share reliable rate-limit state.

The gateway cookie is HttpOnly, SameSite Strict, signed, and expires after 8 hours. Staff logout clears it. Staff authentication and database role/RLS checks remain mandatory.

This gateway restricts access to staff routes and the staff login. Because this is a single-page application, the public build still contains the client-side staff UI code; the gateway is not a substitute for deploying the staff app separately if the requirement is to keep staff UI assets undistributed. An office IP allowlist must also be configured at Vercel Firewall once the cooperative has a stable public IP.
