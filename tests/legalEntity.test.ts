import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ADDRESS,
  EDITOR_DENOMINATION,
  EDITOR_NAME,
  HOST_NAME,
  PUBLICATION_DIRECTOR,
  SIREN,
  SIRET,
  formatIdentifier,
  invalidSiret,
  legalMentionsComplete,
  missingLegalMentions,
} from "@/lib/legalEntity";

describe("identité de l'éditeur", () => {
  it("nomme une personne réelle, pas une équipe anonyme", () => {
    // La page affichait « Directeur de la publication : l'équipe Nova
    // Compagnie ». La LCEN exige une personne physique nommée.
    expect(EDITOR_NAME.trim().length).toBeGreaterThan(3);
    expect(PUBLICATION_DIRECTOR).toBe(EDITOR_NAME);
  });

  it("porte la mention « entrepreneur individuel » dans la dénomination", () => {
    // ⚠️ Obligatoire depuis le 15 mai 2022 : la dénomination doit comporter le
    // nom de l'entrepreneur avec « entrepreneur individuel » ou « EI ».
    expect(EDITOR_DENOMINATION).toContain(EDITOR_NAME);
    expect(EDITOR_DENOMINATION).toMatch(/entrepreneur individuel|EI/i);
  });

  it("nomme l'hébergeur RÉEL, pas un hébergeur plausible", () => {
    // `deploy.sh` déploie sur une machine virtuelle Azure. Nommer Vercel ou
    // Cloudflare priverait la mention de son seul usage : permettre de
    // s'adresser à qui détient réellement les contenus.
    expect(HOST_NAME).toMatch(/azure|microsoft/i);
    expect(HOST_NAME).not.toMatch(/vercel|cloudflare|netlify/i);
  });
});

describe("missingLegalMentions", () => {
  it("signale un SIREN absent ou invalide", () => {
    // Dans l'état du dépôt, SIREN est vide : la page doit le dire plutôt que
    // d'afficher un numéro plausible.
    if (!SIREN.trim()) {
      expect(missingLegalMentions()).toContain("siren");
    } else {
      // ⚠️ Renseigné, il doit passer sa clé de Luhn — un numéro mal recopié a
      // l'apparence de la conformité et désigne une autre entreprise.
      expect(missingLegalMentions()).not.toContain("siren");
    }
  });

  it("signale une adresse absente", () => {
    if (!ADDRESS.trim()) {
      expect(missingLegalMentions()).toContain("address");
    } else {
      expect(missingLegalMentions()).not.toContain("address");
    }
  });

  it("n'exige PAS le SIRET", () => {
    // Recommandé, pas obligatoire pour un entrepreneur individuel dont le
    // SIREN est publié.
    expect(missingLegalMentions()).not.toContain("siret" as never);
  });

  it("invalidSiret ne se déclenche que sur un SIRET renseigné", () => {
    if (!SIRET.trim()) expect(invalidSiret()).toBe(false);
  });

  it("legalMentionsComplete reflète l'ensemble", () => {
    expect(legalMentionsComplete()).toBe(
      missingLegalMentions().length === 0 && !invalidSiret()
    );
  });
});

describe("formatIdentifier", () => {
  it("groupe un SIREN par trois", () => {
    expect(formatIdentifier("123456789")).toBe("123 456 789");
  });

  it("groupe un SIRET en 3-3-3-5", () => {
    expect(formatIdentifier("12345678900015")).toBe("123 456 789 00015");
  });

  it("rend la chaîne telle quelle si la longueur est inattendue", () => {
    // ⚠️ Mieux vaut afficher un numéro brut que le découper au mauvais
    // endroit : un SIREN mal groupé se recopie mal.
    expect(formatIdentifier("1234")).toBe("1234");
    expect(formatIdentifier("")).toBe("");
  });

  it("ignore les séparateurs déjà présents", () => {
    expect(formatIdentifier("123 456 789")).toBe("123 456 789");
  });
});

/* -------------------------------------------------------------------------- */
/*  Garde-fou : plus aucune donnée factice dans les pages légales             */
/* -------------------------------------------------------------------------- */

describe("les pages légales ne contiennent plus de données inventées", () => {
  // ⚠️ Ce test LIT LE CODE SOURCE. La propriété à garantir n'est pas le
  // résultat d'une fonction : c'est qu'aucune page légale — y compris une page
  // neuve — ne réintroduise une identité d'emprunt. Un test unitaire sur
  // `legalEntity` ne l'attraperait pas, puisque la faute serait écrite ailleurs.
  const dir = path.join(process.cwd(), "app", "(site)", "legal");

  const pages = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, "page.tsx"))
    .filter((p) => fs.existsSync(p));

  it("trouve bien les pages à inspecter", () => {
    expect(pages.length).toBeGreaterThan(3);
  });

  const forbidden = [
    /prototype/i,
    /maquette/i,
    /informations?\s+(ci-dessous\s+)?(sont\s+)?fictiv/i,
    /rue de l[’']Élégance/i,
    /société par actions simplifiée \(exemple\)/i,
    /l[’']équipe Nova Compagnie/i,
  ];

  /**
   * ⚠️ Les commentaires sont retirés avant la recherche.
   *
   * La règle porte sur ce que la page **affiche**, pas sur ce que le code
   * explique. Les notes « ne pas réintroduire » de ce dépôt citent forcément le
   * texte qu'elles interdisent — sans ce nettoyage, documenter un retrait
   * ferait échouer le test qui en vérifie l'effet, et la seule issue serait de
   * supprimer l'explication.
   */
  const displayed = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  for (const page of pages) {
    const label = path.basename(path.dirname(page));
    it(`/legal/${label} est exempt de mentions factices`, () => {
      const src = displayed(fs.readFileSync(page, "utf8"));
      for (const pattern of forbidden) {
        expect(src, `motif interdit ${pattern} dans ${label}`).not.toMatch(
          pattern
        );
      }
    });
  }

  it("le nettoyage des commentaires ne neutralise pas le test", () => {
    // Sans cette vérification, une erreur dans `displayed` (qui effacerait tout
    // le fichier, par exemple) rendrait les tests ci-dessus verts à jamais.
    const fake =
      '<p>Nova Compagnie — prototype de démonstration</p> /* prototype */';
    expect(displayed(fake)).toMatch(/prototype/i);
    expect(displayed("/* prototype de démonstration */")).not.toMatch(
      /prototype/i
    );
  });

  it("les mentions légales ne codent aucune identité en dur", () => {
    // Toute l'identité vient de `lib/legalEntity.ts` : recopiée dans la page,
    // elle serait modifiable à deux endroits, donc à moitié.
    const src = fs.readFileSync(
      path.join(dir, "mentions-legales", "page.tsx"),
      "utf8"
    );
    expect(src).toContain("@/lib/legalEntity");
    // Un SIREN écrit en clair dans le JSX : 9 chiffres d'affilée.
    expect(src).not.toMatch(/>\s*\d{9}\s*</);
  });
});
