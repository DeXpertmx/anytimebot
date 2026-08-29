# Aislamiento por tenant y cumplimiento RGPD

Fecha: agosto 2026
Estado: **Pendiente de ejecución** — se entrega el plan y el andamiaje de erasure ya implementado.

## 1. Situación actual (verificada)

- **Una sola base PostgreSQL** compartida por todos los tenants. Cada tenant es un `User`.
- No existe un modelo `Tenant`/`Organization`, ni una columna `tenant_id` global.
- El "aislamiento" es por **filtros de `userId`** en cada consulta + borrados en cascada
  (`onDelete: Cascade`) declarados en `prisma/schema.prisma`.
- **Convex** (conversaciones y eventos del bot) también es **compartido** entre todos los
  tenants; se diferencia por `externalBotId` / `externalUserId`.

### Consecuencia

Hoy NO se cumple "cada tenant tiene su propia base de datos". El aislamiento es lógico
(por fila), no físico. Esto tiene implicaciones legales: un error de filtrado o un bug de
relación podría exponer datos de un tenant a otro.

## 2. Opciones de aislamiento

| Opción | Aislamiento físico | Esfuerzo | Riesgo | Recomendación |
|---|---|---|---|---|
| **A. Base de datos por tenant** | Alto | Muy alto | Alto | Solo Enterprise / casos regulados |
| **B. Schema por tenant** (misma instancia, un schema por tenant) | Alto | Alto | Medio | Buena relación costo/beneficio |
| **C. Fila por tenant con `tenant_id`** + middleware | Lógico | Medio | Bajo | Punto de partida inmediato |

### Decisión tomada en la reunión

- **Aislamiento físico:** → **Base de datos por tenant** (opción A).
- **RGPD:** empezar por la **eliminación de cuenta funcional** (ya implementada en esta
  rama de trabajo).

## 3. Plan propuesto (por fases)

### Fase 0 — Eliminación de cuenta (implementada ✅)
- Endpoint `POST /api/user/delete-account`.
- Limpia WhatsApp instance externa, borra conversaciones/eventos en Convex y elimina el
  usuario en Prisma (cascada completa).
- Botón "Delete Account" en settings con confirmación ("DELETE").

### Fase 1 — Modelo de tenant y contrato de acceso
- Crear modelo `Tenant` + `tenantId` en todas las tablas de negocio.
- `lib/tenant-db.ts`: cliente Prisma dinámico que resuelve el schema/base por tenant.
- Middleware/monodepot para rechazar consultas sin `tenantId`.

### Fase 2 — Aislamiento físico (base o schema por tenant)
- Elegir **schema por tenant** si se mantiene una instancia Postgres gestionada
  (Neon/Supabase/Cockroach multi-región), o **base por tenant** si se necesita separación
  total y hay equipo dedicado.
- Gestión de migraciones por tenant (script reproducible).
- Estrategia de `DATABASE_URL` por tenant (vault/secrets manager).

### Fase 3 — Datos del bot (Convex)
- Convex comparte infraestructura; el aislamiento ahí se mantiene por clave de negocio
  (`externalBotId`). Documentar límite o migrar a una instancia Convex por tenant para
  aislamiento total (alto costo).

### Fase 4 — Cumplimiento RGPD restante
- Portabilidad/exportación de datos (Art. 20).
- Registro granular de consentimiento con versión y fecha (Art. 7).
- Retención y borrado automático.
- Inventario de subprocesadores y DPAs (OpenAI, Evolution/Twilio, Daily, Stripe, Vercel,
  Neon/Postgres, Convex).

## 4. Implementación de referencia para schema-por-tenant

> Pseudocódigo — no desplegado.

```ts
// lib/tenant-db.ts
const clients = new Map<string, PrismaClient>();
export function getTenantClient(tenantId: string) {
  if (!clients.has(tenantId)) {
    clients.set(
      tenantId,
      new PrismaClient({
        datasources: { db: { url: resolveTenantUrl(tenantId) } },
      })
    );
  }
  return clients.get(tenantId)!;
}
```

`resolveTenantUrl` consulta un vault con la URL de cada tenant (creada al registrarse el
tenant) y devuelve una URL con `?schema=<slug>` o una base dedicada.

## 5. Riesgos y decisiones pendientes

1. **Coste**: N bases en Neon/Cockroach multiplican costo y límite de conexiones.
2. **Migraciones**: `prisma migrate` por tenant requiere un orquestador; hoy la BD es
   `db push` (sin historial de migraciones), así que habrá que introducir migraciones.
3. **Convex**: el aislamiento físico ahí requiere instancia por tenant o aceptar la
   separación lógica por clave. Decidir el alcance.
4. **Comercial**: reservar la base-por-tenant para planes Enterprise; el resto puede usar
   aislamiento por fila mientras se audita.