# Easer Checker: security and launch checklist

## Required before production

- Set `NODE_ENV=production` and a unique, randomly generated `JWT_SECRET` in the hosting provider's secret/environment settings. Never use the example value.
- Set `ALLOWED_ORIGINS` to the exact HTTPS frontend origin(s), comma-separated. Do not include a trailing slash. The backend and Socket.IO gateway use this allowlist.
- Use durable storage for `DATA_DIR`. The supplied free Render configuration uses an ephemeral filesystem; SQLite data and uploaded avatars can be lost on restart/deploy. Enable a persistent disk or move to a managed database and object storage before accepting real users.
- Configure HTTPS, database/file backups, and periodically test restoring them.
- Run dependency audits and builds for both `server` and `client` after installing dependencies.
- Test registration/login, unauthorized access, uploads, legal and illegal moves, captures, kings, draw conditions, reconnects, tournaments, and duplicate result submissions.
- Add monitoring and alerting, a privacy policy, terms of use, and a contact/support route.

## Local development

1. Copy `server/.env.example` to `server/.env` and set a local secret.
2. Set `VITE_API_URL=http://localhost:3001` in `client/.env`.
3. Install dependencies in `server` and `client`, then run each app using the scripts in its `package.json`.

The example secret in `.env.example` is a placeholder only. Replace it before running the server, and never publish a real `.env` file.

## Scope note

These changes harden configuration and error handling, but do not constitute a complete penetration test. Upload signature validation, rate limiting, CSRF/session design, and end-to-end gameplay tests should be completed and verified before a public launch.
