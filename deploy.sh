#!/usr/bin/env bash
#
# deploy.sh — pousse la version locale de LumeCar sur la VM Azure.
#
# Usage :
#   ./deploy.sh
#
# Étapes :
#   1. Build local (vérifie que le code compile avant d'envoyer quoi que ce soit)
#   2. Démarre la VM si elle est éteinte
#   3. Empaquette le code (sans node_modules / .next / .git)
#   4. Envoie sur la VM, installe, build, redémarre le service
#   5. Vérifie que le site répond en HTTPS
#
set -euo pipefail

# ── Config ───────────────────────────────────────────────
RG="rg-lumecar"
VM="vm-lumecar"
HOST="20.19.186.208"
USER="azureuser"
APP_DIR="/var/www/lumecar"
FQDN="lumecar-8835.francecentral.cloudapp.azure.com"
# ─────────────────────────────────────────────────────────

cd "$(dirname "$0")"

echo "▶ 1/5  Build local (vérification)…"
npm run build >/dev/null
echo "  ✓ Build local OK"

echo "▶ 2/5  Vérification de la VM…"
POWER=$(az vm get-instance-view -g "$RG" -n "$VM" --query "instanceView.statuses[?starts_with(code,'PowerState')].code" -o tsv 2>/dev/null || echo "")
if [[ "$POWER" != "PowerState/running" ]]; then
  echo "  • VM éteinte → démarrage…"
  az vm start -g "$RG" -n "$VM" -o none
  echo "  • Attente du démarrage SSH…"
  for i in $(seq 1 10); do
    ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$USER@$HOST" 'true' 2>/dev/null && break
    sleep 6
  done
fi
echo "  ✓ VM en ligne"

echo "▶ 3/5  Empaquetage…"
tar --exclude='./node_modules' --exclude='./.next' --exclude='./.git' \
    --exclude='*.tar.gz' -czf /tmp/lumecar.tar.gz .
echo "  ✓ Archive prête"

echo "▶ 4/5  Envoi + build distant + redémarrage…"
scp -o ConnectTimeout=30 /tmp/lumecar.tar.gz "$USER@$HOST:/tmp/lumecar.tar.gz" >/dev/null
ssh "$USER@$HOST" "APP_DIR=$APP_DIR bash -s" <<'REMOTE'
set -e
cd "$APP_DIR"
tar -xzf /tmp/lumecar.tar.gz
npm ci --no-audit --no-fund >/dev/null 2>&1
npm run build >/dev/null 2>&1
sudo systemctl restart lumecar
for i in $(seq 1 15); do
  [ "$(sudo systemctl is-active lumecar)" = "active" ] && break
  sleep 3
done
echo "  ✓ Service: $(sudo systemctl is-active lumecar)"
REMOTE

echo "▶ 5/5  Vérification HTTPS…"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "https://$FQDN/")
if [[ "$CODE" == "200" ]]; then
  echo "  ✓ En ligne : https://$FQDN  (HTTP $CODE)"
else
  echo "  ⚠ Réponse inattendue : HTTP $CODE — vérifie les logs (journalctl -u lumecar)"
  exit 1
fi

echo "✅ Déploiement terminé."
