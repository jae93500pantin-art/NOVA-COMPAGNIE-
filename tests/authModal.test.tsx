import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthModal } from "@/components/AuthModal";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

const onClose = vi.fn();

const open = (mode: "login" | "register" = "login") =>
  render(<AuthModal open onClose={onClose} initialMode={mode} />);

describe("AuthModal — connexion en surcouche (sans redirection)", () => {
  beforeEach(() => {
    onClose.mockClear();
    document.body.style.overflow = "";
  });

  it("n'affiche rien tant qu'il est fermé", () => {
    render(<AuthModal open={false} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("affiche le formulaire de connexion à l'ouverture", () => {
    open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByPlaceholderText("Identifiant ou e-mail")).toBeTruthy();
    expect(screen.getByPlaceholderText("Mot de passe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeTruthy();
  });

  it("ferme via le bouton X", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ferme au clic en dehors du panneau", () => {
    open();
    const overlay = screen.getByRole("dialog").parentElement!;
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ne ferme pas au clic à l'intérieur du panneau", () => {
    open();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ferme avec la touche Échap", () => {
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fige la page derrière, puis la libère à la fermeture", () => {
    const { rerender } = open();
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<AuthModal open={false} onClose={onClose} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("bascule vers l'inscription sans quitter la page", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "S'inscrire" }));
    expect(screen.getByPlaceholderText("Prénom")).toBeTruthy();
    expect(screen.getByPlaceholderText("Téléphone")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
