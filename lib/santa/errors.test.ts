import { describe, expect, it } from "vitest";
import { messageFor } from "./errors";

describe("messageFor", () => {
  it("tłumaczy znany kod błędu z funkcji SQL", () => {
    expect(messageFor({ message: "identity_unavailable" })).toBe(
      "Ta osoba została już wybrana przez kogoś innego.",
    );
  });

  it("obsługuje brak uprawnień (SQLSTATE 42501)", () => {
    expect(messageFor({ message: "permission denied", code: "42501" })).toBe(
      "Brak uprawnień.",
    );
  });

  it("nie ujawnia surowego komunikatu dla nieznanych błędów", () => {
    expect(messageFor({ message: "SELECT * FROM secret", code: "XX000" })).toBe(
      "Wystąpił błąd. Spróbuj ponownie.",
    );
  });

  it("zwraca pusty tekst dla braku błędu", () => {
    expect(messageFor(null)).toBe("");
  });
});
