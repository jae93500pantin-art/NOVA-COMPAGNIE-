-- ETAPE 2/3 - Ajout des valeurs d'enum.
-- A LANCER SEUL. Postgres refuse d'utiliser une valeur d'enum dans la
-- transaction qui l'ajoute : 'paid' est employe par booking_chat_is_open()
-- a l'etape 3, et 'admin' par le back-office.

-- L'enum d'origine ne couvrait pas tout le cycle de vie applicatif
-- (lib/bookings.ts) : on complète sans casser les bases existantes.
alter type booking_status add value if not exists 'refused';
alter type booking_status add value if not exists 'paid';


alter type user_role add value if not exists 'admin';
