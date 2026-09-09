# Applique supabase/setup/*.sql au projet, dans l'ordre, via l'API Management.
#
# Chaque appel HTTP est sa propre transaction cote Postgres : c'est exactement
# ce qu'exige l'etape 2 (une valeur d'enum ne peut pas etre utilisee dans la
# transaction qui l'ajoute).
#
# Le jeton est lu depuis SUPABASE_ACCESS_TOKEN et n'est jamais affiche.

param([string]$Ref = "goayrdtgblpczbcojkaq")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web.Extensions
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "User") }
if (-not $token) { Write-Host "SUPABASE_ACCESS_TOKEN absent."; exit 1 }

$uri = "https://api.supabase.com/v1/projects/$Ref/database/query"
$headers = @{ Authorization = "Bearer $token" }
$dir = Join-Path (Split-Path -Parent $PSScriptRoot) "supabase\setup"

$blocks = @("1-tables.sql", "2-enums.sql", "3-policies-rgpd.sql")
foreach ($b in $blocks) {
  $file = Join-Path $dir $b
  $sql = [string](Get-Content $file -Raw -Encoding UTF8)
  $body = $ser.Serialize(@{ query = $sql })
  try {
    Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -ContentType "application/json" `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 240 | Out-Null
    Write-Host "OK    $b"
  } catch {
    Write-Host "ECHEC $b"
    if ($_.ErrorDetails.Message) { Write-Host "      $($_.ErrorDetails.Message)" }
    else { Write-Host "      $($_.Exception.Message)" }
    exit 1
  }
}
Write-Host "`nSchema applique."
