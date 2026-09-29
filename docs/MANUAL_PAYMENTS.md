# Módulo de Pagos Manuales y Ventas No Agendadas

Módulo de ventas y cobros manuales **separado de Stripe pero integrado con citas, clientes y caja**.
Implementado en 5 fases sobre los patrones existentes del repo (Prisma + Next.js App Router, montos
en céntimos, aislamiento por `userId`, auditoría inmutable).

## Alcance

- **Venta rápida** (sin cita): conceptos libres, cliente del CRM opcional, primer pago en el mismo alta.
- **Cobros manuales en una cita**: efectivo, tarjeta en sitio, transferencia, Bizum, otro.
- **Pagos parciales y múltiples métodos** sobre la misma venta; saldo pendiente siempre calculado.
- **Anulación** de pagos y ventas **con motivo** (nunca se borra nada) y **reembolsos** manuales parciales.
- **Caja**: turnos con fondo inicial, entradas/salidas, arqueo y **congelación del período** al cerrar.
- **Reportes** por método, empleado, sucursal y día, con export CSV (BOM + `;`, listo para Excel).
- **Auditoría inmutable** (`TenantAuditLog`) de cada operación.
- **Stripe intacto**: solo existe como espejo de lectura (`CARD_ONLINE` con `stripePaymentIntent`
  real). Ningún pago manual toca Stripe y ningún webhook escribe métodos manuales.

## Modelo de datos (`prisma/schema.prisma`, migración `20260929100000_add_manual_sales`)

| Tabla | Qué guarda |
|---|---|
| `orders` | La venta (rápida o de cita). `status ISSUED/VOID`, moneda, snapshot del empleado. |
| `order_items` | Líneas con snapshot de descripción/precio (edtar un servicio no reescribe history). |
| `payments` | Dinero cobrado. `COMPLETED/ANNULLED`, `refundCents`, `idempotencyKey` única por tenant. |
| `payment_applications` | Cuánto de cada pago se aplica a cada orden (hoy 1→1, extensible). |
| `cash_sessions` | Turno de caja por sucursal (o global): fondo, esperado, contado, diferencia. |
| `cash_movements` | Todo evento de efectivo (venta, reembolso, ingreso, retiro, ajuste). |
| `receipts` | Número secuencial por tenant (`REC-2026-000123`). |
| `tenant_audit_logs` | Auditoría inmutable por tenant (sin FK a users a propósito). |

Enums: `OrderStatus`, `PaymentRecordStatus`, `CashSessionStatus`, `CashDirection`, `CashMovementType`.
El enum `PaymentMethod` existente se reutiliza (`CARD_ONLINE` reservado a Stripe).

### Reglas de negocio (aprobadas en Fase 0)

1. Una orden tiene varios pagos; un pago pertenece a una orden.
2. Montos siempre enteros > 0 (céntimos); sin negativos.
3. Los pagos **no se borran**: `ANNULLED` con motivo + actor, o reembolso parcial.
4. Creación de pagos **idempotente**: `unique(userId, idempotencyKey)`; el reintento devuelve el pago original.
5. Mutaciones dentro de **transacciones Prisma** (pago + aplicación + movimiento de caja atómicos).
6. **Cierre de caja congela el período**: los movimientos posteriores van al turno siguiente (`409` en cerrados).
7. **Stripe solo online**: espejo de lectura; Stripe+efectivo conviven en la misma orden de la cita.
8. Decisions B1–B5: permisos por rol de equipo (matriz lista, dueño hoy), caja por sucursal,
   una moneda por tenant, cobro simple de `Booking` migrado al modelo nuevo, recibos `REC-…`.

## API

Especificación completa: [manual-payments.openapi.yml](./manual-payments.openapi.yml). Resumen:

```
GET/POST /api/orders                        listar / venta rápida
GET/POST /api/orders/[id]                   detalle / anular venta (motivo)
GET/POST /api/orders/[id]/payments          historial / añadir pago (idempotente)
GET/POST/DELETE /api/bookings/[id]/payments cobros de la cita (multi-pago, anular)
GET/POST /api/payments/[id]                 recibo / {action: annul|refund}
GET/POST /api/cash-sessions                 caja actual / abrir turno
POST /api/cash-sessions/[id]/close          arqueo + cierre
GET/POST /api/cash-sessions/[id]/movements  historial / ingreso-retiro-ajuste
GET /api/reports/payments?groupBy=&from=&to=&format=json|csv
```

Respuestas `{ success, data }`; errores `{ success: false, error }` con 400/401/403/404/409.

## UI

- **`/dashboard/payments`** (sidebar → Facturación → «Pagos y caja»): 4 pestañas —
  Venta rápida, Historial de pagos (anular/reembolsar/añadir pago por línea), Caja (abrir,
  movimientos, arqueo) y Reportes (agrupación + CSV).
- **Calendario**: el panel «Cobro» del modal de cita usa el flujo nuevo; los pagos parciales dejan
  la cita pendiente y el saldo completo la marca PAID (con facturación si se marca «Finalizar»).
  «Anular cobro» anula los pagos manuales de la cita; los de Stripe se reembolsan desde Stripe.
- Las columnas planas de `Booking` (`paymentStatus/paymentMethod/…`) se mantienen sincronizadas
  como indicador rápido; **el saldo de la orden es la fuente de verdad del dinero**.

## Permisos (matriz B1, `lib/permissions-payments.ts`)

| Capacidad | Dueño | Team ADMIN | Team MEMBER |
|---|---|---|---|
| Cobrar (`collect`) | ✔ | ✔ | ✔ |
| Anular (`annul`) | ✔ | ✔ | ✖ |
| Reembolsar (`refund`) | ✔ | ✔ | ✖ |
| Caja (`drawer`) | ✔ | ✔ | ✖ |
| Reportes (`reports`) | ✔ | ✔ | ✖ |

Hoy solo el dueño inicia sesión (todas las consultas se filtran por su `userId`); cuando existan
sesiones de miembros de equipo basta conectar su `TeamMemberRole` en `getActor()`.

## Tests

`npm test` ejecuta la suite del repo. Los del módulo (fake-prisma, sin base de datos):

- `lib/orders.test.ts` — validación de ítems, totales, saldos (parcial/pagado/reembolsado/anulado), numeración de recibos, creación con recibo secuencial, bloqueo de anulación con cobros efectivos.
- `lib/payments.test.ts` — validación de importes/métodos, **idempotencia**, rechazo de órdenes anuladas y moneda distinta, tolerancia a caja no abierta, anulación con motivo, reembolsos parciales hasta el límite.
- `lib/cash.test.ts` — aritmética de cajón (solo CASH), diferencia de arqueo, congelación del período, reapertura del siguiente turno.

## Checklist de despliegue

1. `npx prisma validate` y `npx tsc --noEmit` en verde (hecho en esta rama).
2. `npm test` (396 tests, incluidos 22 nuevos) en verde.
3. Push a `main` → Vercel ejecuta `prisma migrate deploy` automáticamente en el build
   (`20260929100000_add_manual_sales` es **aditiva**: 32 CREATE, 0 DROP — sin riesgo para datos).
4. Tras el deploy: verificar en producción que `/dashboard/payments` carga y que el sidebar muestra
   «Pagos y caja». Si el navegador sirve la app vieja, el service worker v4 ya purga su caché sola.
5. Humo manual sugerido: abrir caja → venta rápida con pago en efectivo → verificar saldo esperado →
   cierre con arqueo → reporte por método con el CSV descargable.
6. La numeración de recibos es por tenant y reconstruible desde `receipts` (no depende de contadores externos).

## No incluido (por diseño)

Facturación fiscal electrónica, Stripe Terminal, contabilidad completa. El `taxRateBps` de los
ítems es informativo (sin cálculo fiscal).
