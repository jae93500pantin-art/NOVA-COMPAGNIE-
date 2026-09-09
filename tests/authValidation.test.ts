import { describe, it, expect } from "vitest";
import {
  emailError,
  passwordError,
  nameError,
  phoneError,
  normalizeEmail,
  normalizeName,
  validateRegistration,
  validateLogin,
  mapAuthError,
  MIN_PASSWORD_LEN,
} from "@/lib/authValidation";

describe("normalisation", () => {
  it("lowercases and trims an address", () => {
    expect(normalizeEmail("  Jean.Dupont@Example.COM ")).toBe(
      "jean.dupont@example.com"
    );
  });

  it("collapses inner whitespace in a name", () => {
    expect(normalizeName("  Jean   Paul ")).toBe("Jean Paul");
  });

  it("returns an empty string for a non-string", () => {
    expect(normalizeEmail(42)).toBe("");
    expect(normalizeName(null)).toBe("");
  });
});

describe("emailError", () => {
  it("accepts a normal address", () => {
    expect(emailError("jean@example.com")).toBeNull();
    expect(emailError("jean.dupont+tag@sub.example.co.uk")).toBeNull();
  });

  it("requires a value", () => {
    expect(emailError("")).toBe("auth.errors.emailRequired");
    expect(emailError("   ")).toBe("auth.errors.emailRequired");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["jean", "jean@", "@example.com", "jean@example", "a b@c.com"]) {
      expect(emailError(bad), bad).toBe("auth.errors.emailInvalid");
    }
  });

  it("rejects an address beyond the RFC length", () => {
    expect(emailError(`${"a".repeat(250)}@example.com`)).toBe(
      "auth.errors.emailInvalid"
    );
  });
});

describe("passwordError", () => {
  it("accepts a password with a letter and a digit", () => {
    expect(passwordError("motdepasse1")).toBeNull();
  });

  it("requires a value", () => {
    expect(passwordError("")).toBe("auth.errors.passwordRequired");
  });

  it("enforces the minimum length", () => {
    expect(passwordError("a1b2c3")).toBe("auth.errors.passwordTooShort");
    expect(passwordError("a".repeat(MIN_PASSWORD_LEN - 1) + "1")).toBeNull();
  });

  it("requires both a letter and a digit", () => {
    expect(passwordError("motdepasse")).toBe("auth.errors.passwordTooWeak");
    expect(passwordError("12345678")).toBe("auth.errors.passwordTooWeak");
  });

  it("counts bytes, not characters, against the bcrypt cap", () => {
    // 30 four-byte emoji = 120 bytes, well under 72 characters.
    expect(passwordError("a1" + "😀".repeat(30))).toBe("auth.errors.passwordTooLong");
    expect(passwordError("a1" + "x".repeat(69))).toBeNull(); // exactly 71 bytes
  });
});

describe("nameError", () => {
  it("requires first and last name, naming the right field", () => {
    expect(nameError("", "firstName")).toBe("auth.errors.firstNameRequired");
    expect(nameError("  ", "lastName")).toBe("auth.errors.lastNameRequired");
  });

  it("accepts an ordinary name", () => {
    expect(nameError("Jean-Pierre", "firstName")).toBeNull();
  });

  it("rejects an absurdly long name", () => {
    expect(nameError("a".repeat(61), "lastName")).toBe("auth.errors.nameTooLong");
  });
});

describe("phoneError", () => {
  it("treats an empty phone as valid — the field is optional", () => {
    expect(phoneError("")).toBeNull();
    expect(phoneError(undefined)).toBeNull();
  });

  it("accepts the usual French and international formats", () => {
    for (const ok of ["0612345678", "+33 6 12 34 56 78", "06.12.34.56.78", "(01) 23-45-67"]) {
      expect(phoneError(ok), ok).toBeNull();
    }
  });

  it("rejects letters and junk", () => {
    expect(phoneError("pas un numéro")).toBe("auth.errors.phoneInvalid");
    expect(phoneError("123")).toBe("auth.errors.phoneInvalid");
  });
});

describe("validateRegistration", () => {
  const valid = {
    firstName: " Jean ",
    lastName: "Dupont",
    email: "Jean@Example.com",
    phone: "+33 6 12 34 56 78",
    password: "motdepasse1",
    role: "driver",
  };

  it("normalises the payload it returns", () => {
    const result = validateRegistration(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.firstName).toBe("Jean");
    expect(result.value.email).toBe("jean@example.com");
    expect(result.value.role).toBe("driver");
  });

  it("collects every field error at once", () => {
    const result = validateRegistration({
      firstName: "",
      lastName: "",
      email: "nope",
      phone: "abc",
      password: "short",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "email",
      "firstName",
      "lastName",
      "password",
      "phone",
    ]);
  });

  it("never lets a payload grant itself a privileged role", () => {
    const result = validateRegistration({ ...valid, role: "admin" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.role).toBe("client");
  });
});

describe("validateLogin", () => {
  it("accepts an address and any non-empty password", () => {
    // Deliberately looser than registration: accounts created under an older
    // policy must still be able to sign in.
    const result = validateLogin({ email: "jean@example.com", password: "old" });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing password", () => {
    const result = validateLogin({ email: "jean@example.com", password: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.password).toBe("auth.errors.passwordRequired");
  });

  it("rejects a malformed address", () => {
    const result = validateLogin({ email: "jean", password: "x" });
    expect(result.ok).toBe(false);
  });
});

describe("mapAuthError", () => {
  it("maps the messages Supabase actually returns", () => {
    expect(mapAuthError("Invalid login credentials")).toBe(
      "auth.errors.badCredentials"
    );
    expect(mapAuthError("Email not confirmed")).toBe(
      "auth.errors.emailNotConfirmed"
    );
    expect(mapAuthError("User already registered")).toBe("auth.errors.emailTaken");
    expect(mapAuthError("Password should be at least 6 characters")).toBe(
      "auth.errors.passwordTooShort"
    );
    expect(mapAuthError("Email rate limit exceeded")).toBe(
      "auth.errors.rateLimited"
    );
  });

  it("never echoes an unknown message back to the client", () => {
    expect(mapAuthError("Some internal detail: table users_x")).toBe(
      "auth.errorGeneric"
    );
    expect(mapAuthError(null)).toBe("auth.errorGeneric");
    expect(mapAuthError("")).toBe("auth.errorGeneric");
  });
});
