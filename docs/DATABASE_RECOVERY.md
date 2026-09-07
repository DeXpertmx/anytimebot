# Recuperación de base de datos (runbook)

> **Incidente 2026-09-04 — base de producción vaciada por error.** Este documento
> es el registro del incidente, el procedimiento de restauración y las reglas
> operativas para que no vuelva a ocurrir.

## 1. Registro del incidente

| Campo | Valor |
|---|---|
| Fecha | 2026-09-04 ~18:40 UTC |
| Proyecto Neon | `muddy-field-25896962` |
| Host producción | `ep-green-thunder-av3ed81q` |
| Base afectada | `neondb` |
| Causa raíz | Se ejecutó `prisma migrate diff --shadow-database-url <URL_DE_PRODUCCIÓN>` con fines de diagnóstico. Prisma trata el shadow database como desechable y lo resetea; al apuntarlo a la base real, se vaciaron las tablas (`users`, `bookings`, `locations`, …). |
| Impacto | Pérdida de todos los datos de la base de producción. La app siguió desplegada pero sin datos. **No había clientes reales todavía** (sin ventas), por lo que no hubo notificación GDPR de brecha; la restauración vía PITR de Neon es la prioridad. |
| Recuperación | Neon conserva historial point-in-time (PITR) de la rama. Restaurar la rama `main` a un punto anterior a ~18:40 UTC del 2026-09-04. |

## 2. Restauración (Neon console — ~3 minutos)

1. Entra en **console.neon.tech** → proyecto **`muddy-field-25896962`**.
2. **Branches** → selecciona la rama que contiene `neondb` (normalmente `main`).
3. Pulsa **Restore** (icono de reloj / “Restore from point in time”).
4. Elige un punto **anterior a la hora del incidente** (p. ej. **2026-09-04 18:00 UTC**;
   usa la última marca que muestre datos).
5. Confirma la restauración. Neon restaura **en la misma rama** (o crea una rama
   nueva si eliges esa opción); si restauras en la misma rama, **la URL
   `DATABASE_URL` de Vercel no cambia**.

> ⚠️ Si la restauración en la misma rama no está disponible en tu plan, crea una
> **nueva rama desde el punto en el tiempo** y cambia `DATABASE_URL` en Vercel a
> la URL de esa rama (prefijo `ep-…` de la nueva rama).

### Alternativa automatizada (con token)
Si prefieres que un script haga la restauración vía la **Neon API**, necesitas:
- Un token de API de Neon (console.neon.tech → Account → Settings → Development).
- Los IDs del proyecto y de la rama (los podemos leer con
  `GET /projects/{project_id}/branches`).

Con eso se puede llamar a
`POST /projects/{project_id}/branches/{branch_id}/restore` con
`{"source_timestamp": "2026-09-04T18:00:00Z"}` y luego re-desplegar Vercel.

## 3. Verificación post-restauración (solo lectura)

```bash
# 1) Tablas y migraciones
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';   -- esperado ~45+
SELECT count(*) FROM _prisma_migrations;                                      -- esperado 19 (todas finished)

# 2) Datos clave
SELECT count(*) FROM users;      -- esperado: usuarios reales (dexpertmx…)
SELECT count(*) FROM bookings;   -- esperado: reservas reales
```

Luego re-desplegar a producción (`vercel deploy --prod`) y comprobar que
`prisma migrate deploy` aplica solo las migraciones nuevas
(`…130000_add_timeoff_resource`, `…140000_add_eventtype_location`,
`…20260905100000_add_eventtype_locations`) sin pendientes ni errores.

## 4. Reglas operativas (prohibiciones absolutas)

1. **NUNCA** usar la URL de producción como `--shadow-database-url`, ni en
   `prisma migrate diff`, `prisma migrate reset`, `prisma db push` u otro
   comando que resete/reescriba. Usa siempre `scripts/db-diff-safe.sh` o una
   base desechable real (Postgres local / rama efímera de Neon / base dev).
2. **NUNCA** tirar `.env` con secretos a disco dentro del repo (ya quedó
   `.env.local` en `.gitignore`; si hay dudas, `vercel env pull` a un archivo
   temporal **fuera** del repo y borrarlo al terminar).
3. **NUNCA** ejecutar migraciones destructivas contra producción desde local;
   el pipeline correcto es `prisma migrate deploy` dentro del build de Vercel.
4. Antes de cualquier operación de base de datos, confirmar el **host** de la
   URL sobre la que se va a operar (nunca el de la blocklist).

## 5. Estrategia de respaldo y cumplimiento

- **Backup continuo**: Neon PITR es el respaldo nativo (7 días en planes de
  pago; 24 h en el gratuito). **Sube a un plan de pago** para tener ventana de
  recuperación real y sube la retención si el producto va a manejar datos de
  clientes europeos (GDPR: disponibilidad e integridad, Art. 32).
- **Respaldo lógico periódico**: añadir un cron que haga `pg_dump` de la base a
  un almacenamiento cifrado (S3/Vercel Blob) con retención 30 días.
- **Prueba de restauración**: una vez al mes, restaurar una rama desde un punto
  en el tiempo y verificar los conteos de la sección 3 (deja constancia).
- **Registro de auditoría**: guardar este runbook y las ejecuciones de
  migraciones en el repo para poder demostrar trazabilidad ante un auditor.