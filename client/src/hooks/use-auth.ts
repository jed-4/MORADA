// Re-export shared auth hook for web app
// Auth is email/password (bcrypt) + Google OAuth — see server/auth.ts.
export { useAuth } from "@shared/useAuth";
