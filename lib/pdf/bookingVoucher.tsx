import "server-only";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  driverFullName,
  formatIssuedAt,
  formatSiren,
  formatVoucherWhen,
  missingVoucherFields,
  VOUCHER_CONTROL_NOTICE,
  VOUCHER_FIELD_LABELS,
  VOUCHER_INTERMEDIATION_NOTICE,
  VOUCHER_PAYMENT_NOTICE,
  type BookingVoucher,
} from "@/lib/bookingVoucher";
import { formatAmount } from "@/lib/utils";

/**
 * Le rendu PDF du bon de réservation préalable.
 *
 * ## Choix de la librairie
 *
 * `@react-pdf/renderer` plutôt que `puppeteer` ou `pdfkit` :
 *
 * - **puppeteer** embarque un Chromium (~300 Mo) pour composer une page A4 de
 *   texte. Le déploiement est une VM Azure à un process (voir CLAUDE.md) :
 *   lancer un navigateur par téléchargement de bon y est disproportionné, et
 *   c'est la première chose qui tombe quand la VM manque de mémoire.
 * - **pdfkit** impose de gérer soi-même les polices (fichiers AFM à résoudre
 *   au runtime), ce que les bundlers cassent régulièrement.
 * - `@react-pdf/renderer` compose en JSX, s'appuie sur les polices PDF
 *   standard (Helvetica) — donc **aucun fichier de police à embarquer** — et
 *   rend un `Buffer` en mémoire.
 *
 * ⚠️ **Helvetica ne sait pas tout écrire, et elle ne le dit pas.** Les accents
 * français passent, mais le symbole `€` et le tiret cadratin `—` sont
 * **silencieusement supprimés** du PDF : le texte s'imprime sans eux, sans
 * erreur ni avertissement. Un prix affiché « 178,50 » sans devise sur un
 * document légal a donc pu être livré sans que rien ne le signale. D'où deux
 * règles ici :
 *
 *   1. le montant s'écrit « EUR » (code ISO 4217), jamais « € » ;
 *   2. tout texte rendu reste en ASCII + accents latins.
 *
 * `tests/bookingVoucherPdf.test.ts` relit le texte réellement imprimé dans le
 * PDF et échoue si la devise disparaît — c'est le seul garde-fou possible
 * contre une omission invisible. Passer à une police embarquée
 * (`Font.register`) lèverait la contrainte, au prix d'un fichier de ~300 Ko.
 *
 * ## Mise en page
 *
 * Volontairement sobre et à fort contraste : ce document est **imprimé en noir
 * et blanc**, plié dans une boîte à gants, et lu par un agent de contrôle. Le
 * dark glassmorphism du site y serait illisible et coûteux en encre. Seul un
 * filet champagne rappelle la marque.
 */

const COLORS = {
  ink: "#1A1A1A",
  muted: "#6B6B6B",
  line: "#D8D8D8",
  band: "#F4F4F2",
  accent: "#B08D57",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 96, // laisse la place au pied de page fixe
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.ink,
  },

  /* En-tête */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    paddingBottom: 12,
  },
  brand: { fontSize: 9, letterSpacing: 2, color: COLORS.muted },
  title: {
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    letterSpacing: 0.4,
  },
  numberBox: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "flex-end",
  },
  numberLabel: { fontSize: 7, letterSpacing: 1, color: COLORS.muted },
  number: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  issued: { fontSize: 8, color: COLORS.muted, marginTop: 4 },

  /* Sections */
  section: { marginTop: 18 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    backgroundColor: COLORS.band,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.accent,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
  },
  label: { width: "38%", color: COLORS.muted },
  value: { width: "62%", fontFamily: "Helvetica-Bold" },

  /* Prix */
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: COLORS.band,
  },
  priceLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  priceValue: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  paidNotice: {
    marginTop: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    color: COLORS.muted,
  },

  /* Pied de page */
  footer: {
    position: "absolute",
    bottom: 32,
    left: 44,
    right: 44,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    paddingTop: 8,
  },
  notice: { fontSize: 7.5, color: COLORS.muted, lineHeight: 1.45 },
  control: {
    fontSize: 7.5,
    color: COLORS.ink,
    lineHeight: 1.45,
    marginTop: 5,
    fontFamily: "Helvetica-Bold",
  },
  pageNumber: {
    marginTop: 6,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "right",
  },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // `wrap={false}` : une section de quatre lignes coupée en deux par un saut de
  // page rendrait le document confus à la lecture comme au contrôle.
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function BookingVoucherDocument({ voucher }: { voucher: BookingVoucher }) {
  const { driver, client, trip, payment } = voucher;

  return (
    <Document
      title={`Bon de réservation ${voucher.number}`}
      author="Nova Compagnie"
      subject="Bon de réservation préalable VTC"
      creator="Nova Compagnie"
      producer="Nova Compagnie"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>NOVA COMPAGNIE</Text>
            <Text style={styles.title}>BON DE RÉSERVATION PRÉALABLE</Text>
          </View>
          <View style={styles.numberBox}>
            <Text style={styles.numberLabel}>RÉSERVATION N°</Text>
            <Text style={styles.number}>{voucher.number}</Text>
            <Text style={styles.issued}>
              Émis le {formatIssuedAt(voucher.issuedAt)}
            </Text>
          </View>
        </View>

        <Section title="CHAUFFEUR">
          <Row label="Nom et prénom" value={driverFullName(driver)} />
          <Row label="SIREN / SIRET" value={formatSiren(driver.siret)} />
          <Row label="N° carte professionnelle VTC" value={driver.vtcCardNumber} />
          <Row label="Immatriculation du véhicule" value={driver.plate} />
        </Section>

        <Section title="CLIENT">
          <Row label="Nom et prénom" value={client.name} />
          <Row label="Téléphone" value={client.phone} />
        </Section>

        <Section title="TRAJET">
          <Row label="Date et heure de prise en charge" value={formatVoucherWhen(trip.when)} />
          <Row label="Adresse de départ" value={trip.pickup} />
          <Row label="Adresse de destination" value={trip.dropoff} />
        </Section>

        <Section title="PAIEMENT">
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Prix TTC convenu</Text>
            {/* « EUR » et non « € » : voir la note sur les glyphes ci-dessus. */}
            <Text style={styles.priceValue}>
              {formatAmount(payment.totalTTC)} EUR
            </Text>
          </View>
          <Text style={styles.paidNotice}>{VOUCHER_PAYMENT_NOTICE}</Text>
        </Section>

        <View style={styles.footer} fixed>
          <Text style={styles.notice}>{VOUCHER_INTERMEDIATION_NOTICE}</Text>
          <Text style={styles.control}>{VOUCHER_CONTROL_NOTICE}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `${voucher.number} - page ${pageNumber}/${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** Levée quand le bon n'est pas présentable ; porte la liste des manques. */
export class IncompleteVoucherError extends Error {
  constructor(readonly fields: string[]) {
    super(`Bon de réservation incomplet : ${fields.join(", ")}`);
    this.name = "IncompleteVoucherError";
  }
}

/**
 * Rend le bon en PDF.
 *
 * ⚠️ La complétude est revérifiée **ici**, au plus près de l'écriture du
 * fichier, et pas seulement dans la route : c'est la dernière porte avant
 * qu'un document incomplet n'existe sous forme de fichier. Un second appelant
 * (un e-mail, une tâche de fond, un back-office) ne doit pas pouvoir contourner
 * le contrôle en oubliant de le refaire.
 */
export async function renderBookingVoucher(
  voucher: BookingVoucher
): Promise<Buffer> {
  const missing = missingVoucherFields(voucher);
  if (missing.length > 0) {
    throw new IncompleteVoucherError(
      missing.map((f) => VOUCHER_FIELD_LABELS[f])
    );
  }
  return renderToBuffer(<BookingVoucherDocument voucher={voucher} />);
}
