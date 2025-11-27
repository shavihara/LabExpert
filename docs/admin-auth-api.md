# Admin Auth API

- POST `/api/admin/auth/login`
  - Body: `{ email, password }`
  - Response: `{ success, must_change_password }`
  - Sets cookies: `admin_access_token` (HttpOnly), `admin_csrf_token`

- GET `/api/admin/auth/me`
  - Response: `{ success, admin }`

- POST `/api/admin/auth/change-password`
  - Headers: `X-CSRF-Token` from `admin_csrf_token` cookie
  - Body: `{ current_password, new_password }`
  - Response: `{ success }`
  - Invalidates current token; requires fresh login

- POST `/api/admin/auth/logout`
  - Headers: `X-CSRF-Token`
  - Response: `{ success }`
  - Clears `admin_access_token` cookie

- GET `/api/admin/csrf`
  - Response: `{ success, csrf }`
  - Sets `admin_csrf_token` cookie

- GET `/api/admin/users` (superadmin only)
  - Response: `{ success, admins: [...] }`

- POST `/api/admin/users` (superadmin only)
  - Headers: `X-CSRF-Token`
  - Body: `{ email, password, role }`
  - Response: `{ success, admin }`

## Security
- Passwords hashed with bcrypt
- Password complexity enforced client/server
- Password history prevents reuse (last 5)
- Rate limit login (5 attempts/5 minutes per IP)
- JWT tokens include `sid` and `ver` for session fixation protection
- Auto logout after 30 minutes inactivity via `admin_sessions`