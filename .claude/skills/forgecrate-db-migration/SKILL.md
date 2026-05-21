# DB Migration

Führt durch Erstellung und Review einer Datenbankmigrierung.

## Framework erkennen

Prüfe in dieser Reihenfolge:
- `golang-migrate`: Verzeichnis `migrations/` mit `*.up.sql`/`*.down.sql`
- `flyway`: Verzeichnis `db/migration/` mit `V__*.sql`
- `alembic`: `alembic.ini` + `alembic/versions/`
- `prisma`: `prisma/schema.prisma` + `prisma/migrations/`
- Kein Framework erkannt: frage welches verwendet wird

## Ablauf

1. **Neue Migrationsdatei anlegen**

   *golang-migrate:*
   ```bash
   migrate create -ext sql -dir migrations -seq <name>
   # erzeugt: migrations/000N_<name>.up.sql und .down.sql
   ```

   *flyway:*
   ```bash
   touch db/migration/V$(date +%Y%m%d%H%M%S)__<name>.sql
   ```

   *alembic:*
   ```bash
   alembic revision --autogenerate -m "<name>"
   ```

   *prisma:*
   ```bash
   npx prisma migrate dev --name <name>
   ```

2. **Review-Checkliste**

   Überprüfe die erstellte Migration auf:

   **Nicht-destruktiv?**
   - `DROP TABLE` / `DROP COLUMN`: Datensicherung oder Feature-Flag vorhanden?
   - `NOT NULL`-Spalte hinzufügen: Default-Wert oder zweistufige Migration (Spalte nullable → befüllen → NOT NULL)?

   **Rollbackfähig?**
   - `DOWN`-Migration vorhanden und spiegelt `UP` korrekt?
   - Bei `alembic`/`prisma`: `downgrade`-Funktion implementiert?

   **Performance?**
   - Neue Foreign Keys: Index angelegt?
   - Große Tabellen (>100k Zeilen): `CONCURRENTLY`-Index oder Batch-Update nötig?

   **Blue-Green-kompatibel?**
   - Läuft die Anwendung mit der alten UND der neuen Schema-Version gleichzeitig?
   - Spalten-Umbenennungen: zweistufig (neue Spalte → Daten kopieren → alte Spalte entfernen)?

3. **Ausgabe**
   ```
   ✅ DOWN-Migration vorhanden
   ✅ Kein DROP ohne Sicherung
   ⚠️  Neue Foreign Key-Spalte ohne Index — empfehle: CREATE INDEX CONCURRENTLY
   ❌ NOT NULL ohne Default — bestehende Zeilen werden beim Migrate fehlschlagen
   ```

   Offene ❌-Punkte müssen vor dem Commit behoben sein.
