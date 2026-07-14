import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const SALT_ROUNDS = 12; // Strong salt rounds for security

export class PasswordUtils {
  /**
   * Hash a plain text password using bcrypt
   */
  static async hashPassword(plainPassword: string): Promise<string> {
    return await bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  /**
   * Verify a plain text password against a hashed password
   */
  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      // Handle bcrypt.compare errors defensively (e.g., non-hash input)
      return false;
    }
  }

  /**
   * Generate a cryptographically secure random token for invitations
   * SECURITY FIX: Now uses crypto.randomBytes instead of Math.random
   */
  static generateSecureToken(byteLength: number = 32): string {
    return randomBytes(byteLength).toString('base64url');
  }

  /**
   * Validate password strength. Must stay in sync with the client-side
   * `passwordSchema` in shared/schema.ts (one policy for register, invite
   * accept and password reset): min 8 chars, one uppercase, one lowercase,
   * one number.
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }

    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    if (!/[0-9]/.test(password)) {
      errors.push("Password must contain at least one number");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate invitation expiry date (7 days from now)
   */
  static generateInviteExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7); // 7 days from now
    return expiry;
  }
}