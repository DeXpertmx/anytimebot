# Modelo de datos: Recursos y Ubicaciones (salas, sillones, multi-sede)

> Diseño de datos. **Fase A y Fase B implementadas** — ver §5 para el estado de
> cada fase; las fases C y los puntos de §7 siguen abiertos.

## 1. Problema y objetivos

Hoy el sistema modela **quién** (usuario/anfitrión), **qué** (tipo de evento:
duración, precio, `location` como string libre `"in-person" | "phone" | "video"`,
y en persona sin dirección estructurada) y **cuándo** (página de reserva con
`Availability` por día de la semana, `TimeOff` global del usuario). No existe
nada que modele **dónde ocurre físicamente** ni **sobre qué recurso físico**
(sala, sillón, máquina) ocurre.

Casos que deben quedar cubiertos:

| Persona | Necesidad concreta |
|---|---|
| Barbería / peluquería | N sillones; cada corte se asigna a un sillón; dos citas no pueden compartir sillón a la vez |
| Dentista / clínica | Consultorios y equipos (sillón dental, rayos X) como restricción reservable; "doble reserva" debe respetar el recurso |
| Psicólogo / consultor | Sala de consulta única; la dirección visible en la página pública |
| Empresa multi-sede | Varias sucursales (dirección, huso horario propio), recursos por sucursal, y servicios ofrecidos en una o varias sedes |

Objetivos del diseño:

1. **Ubicación (`Location`)** — sede física con dirección y zona horaria propios.
2. **Recurso (`Resource`)** — unidad física reservable (sala, sillón, equipo),
   opcionalmente atada a una ubicación, con tipo y capacidad.
3. **Tipo de evento ↔ recursos permitidos** (M2M) — "corte de pelo" puede usar
   cualquiera de los sillones 1–3; "rayos X" solo la sala de rayos.
4. **Asignación + doble-reserva por recurso** — al reservar se elige y guarda el
   recurso (`Booking.resourceId`); el chequeo de conflicto incluye el recurso.
5. **Horarios por recurso** — ventanas de disponibilidad propias (máquina en
   mantenimiento, sala cerrada martes) como superposición opcional sobre la
   disponibilidad de la página.
6. **Estabilidad histórica** — la reserva guarda una *foto* del recurso/ubicación
   (nombre + dirección) para que el historial siga siendo legible aunque luego se
   renombre o elimine el recurso.

## 2. Modelo propuesto

### 2.1 Enums

```prisma
enum ResourceType {
  ROOM      // sala / consultorio
  CHAIR     // sillón / estación de trabajo
  EQUIPMENT // equipo específico (rayos X, camilla…)
  STATION   // pupitre / puesto fijo
  OTHER
}
```

### 2.2 `Location` — sede física

```prisma
model Location {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  name      String // "Sucursal Centro", "Clínica Norte"…
  address   String?  @map("address") // dirección completa formateada
  city      String?
  country   String? // código ISO-3166 alpha-2, p. ej. "ES"
  timezone  String   @default("UTC") // huso propio de la sede
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  resources Resource[]
  bookings  Booking[]

  @@index([userId, isActive])
  @@map("locations")
}
```

Decisiones:
- Pertenece al **usuario** (anfitrión) con `onDelete: Cascade`, igual que el resto
  del grafo del tenant.
- `timezone` propio: indispensable para multi-sede en husos distintos (España +
  México, por ejemplo). La generación de slots de un evento en persona se hace en
  `Location.timezone`, no en la del usuario.
- La dirección se guarda **estructurada** (`address`, `city`, `country`) para
  renderizarla bien en la página pública y para futuros mapas.

### 2.3 `Resource` — unidad física reservable

```prisma
model Resource {
  id         String       @id @default(cuid())
  userId     String       @map("user_id")
  locationId String?      @map("location_id") // null = recurso flotante (sin sede fija)
  name       String // "Sillón 2", "Sala de rayos X", "Consultorio A"
  type       ResourceType @default(ROOM)
  capacity   Int          @default(1) // reservas simultáneas permitidas (1 = exclusivo)
  isActive   Boolean      @default(true) @map("is_active")
  createdAt  DateTime     @default(now()) @map("created_at")
  updatedAt  DateTime     @updatedAt @map("updated_at")

  user      User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  location  Location?           @relation(fields: [locationId], references: [id], onDelete: SetNull)
  eventTypes EventTypeResource[]
  bookings  Booking[]
  availabilities Availability[] // reglas de horario propias (opcional)

  @@index([userId, isActive])
  @@index([locationId])
  @@map("resources")
}
```

Decisiones:
- `capacity = 1` → recurso exclusivo: nunca dos citas solapadas sobre él.
  `capacity > 1` deja la puerta abierta a **eventos grupales con aforo**
  (una clase con 15 plazas) sin romper nada: el chequeo de conflicto cuenta
  reservas activas vs. `capacity`.
- `locationId` opcional + `onDelete: SetNull`: eliminar una sede no borra sus
  recursos históricos; quedan "flotantes" hasta que se reasignen.

### 2.4 `EventTypeResource` — recursos permitidos por tipo de evento (M2M)

```prisma
model EventTypeResource {
  eventTypeId String
  resourceId  String

  eventType EventType @relation(fields: [eventTypeId], references: [id], onDelete: Cascade)
  resource  Resource  @relation(fields: [resourceId], references: [id], onDelete: Cascade)

  @@id([eventTypeId, resourceId])
  @@map("event_type_resources")
}
```

Semántica:
- **Vacía** (sin filas) → el evento no usa recursos: comportamiento actual
  (solo se chequea el conflicto global del anfitrión).
- **Con filas** → al reservar, el sistema asigna **uno** de los recursos
  permitidos que esté libre en la franja elegida (estrategia: primero libre;
  después, el menos usado para balancear el desgaste de sillones/máquinas).
- Si ningún recurso permitido queda libre en un slot, ese slot **no se ofrece**.

### 2.5 Cambios en modelos existentes

**`EventType`** — añadir:

```prisma
  // Recursos permitidos (vacío = sin restricción de recurso)
  allowedResources EventTypeResource[]
```

(La sede por defecto del evento se resuelve desde el recurso asignado → su
`Location`. No hace falta una columna `locationId` en `EventType` si el evento
siempre se agenda sobre un recurso físico; para eventos "in-person" sin recurso
concreto se puede añadir `locationId String?` en una fase posterior — ver §5.)

**`Booking`** — añadir (relaciones + foto histórica):

```prisma
  // Recurso / ubicación asignados en el momento de reservar
  locationId     String?  @map("location_id")
  resourceId     String?  @map("resource_id")
  resourceName   String?  @map("resource_name")   // foto: "Sillón 2"
  locationName   String?  @map("location_name")   // foto: "Sucursal Centro"
  locationAddress String? @map("location_address") // foto: dirección completa

  location Location? @relation(fields: [locationId], references: [id], onDelete: SetNull)
  resource Resource? @relation(fields: [resourceId], references: [id], onDelete: SetNull)
```

Las columnas `*Name` / `*Address` son la **foto** que se muestra en historial,
emails y CRM aunque el recurso/sede cambie después. Es el mismo patrón ya usado
con `guestName`/`guestEmail`.

**`Availability`** — permitir reglas por recurso:

```prisma
model Availability {
  id            String    @id @default(cuid())
  // Scope: UNA de las dos (XOR)
  bookingPageId String?   @map("booking_page_id") // regla de página (hoy: requerida)
  resourceId    String?   @map("resource_id")     // regla de recurso (nuevo)
  dayOfWeek     Int       @map("day_of_week")
  startTime     String    @map("start_time")
  endTime       String    @map("end_time")
  isAvailable   Boolean   @default(true) @map("is_available")
  ...
  bookingPage BookingPage? @relation(..., onDelete: Cascade)
  resource    Resource?    @relation(..., onDelete: Cascade)
}
```

- La columna `bookingPageId` pasa a **opcional** (las filas existentes no cambian).
- Un recurso **sin** reglas propias hereda el horario de la página de reserva a
  la que pertenece el evento. Con reglas propias, estas **sustituyen** al horario
  de la página para ese recurso (máquina en mantenimiento → solo reglas de
  "no disponible" en ese tramo).
- Los cierres puntuales (un día concreto) siguen cubriéndose con `TimeOff`; en
  una fase posterior se puede añadir `TimeOff.resourceId` para ausencias de un
  recurso concreto sin tocar la agenda del resto.

## 3. Flujo de reserva con recursos (cómo encaja)

### 3.1 Chequeo de disponibilidad (`/api/bookings/check-availability`)

Para una fecha dada, hoy se calcula: slots de la página ∩ `TimeOff` ∩ no
conflictos (reservas activas del anfitrión que solapan). Con recursos:

```
slots = generar(availability de la página)
        − timeOff (usuario)
        − reservas activas que solapan  // chequeo global actual, si no hay recursos

si eventType.allowedResources no está vacío:
    por cada slot:
        recursosLibres = allowedResources donde:
            el recurso está activo
            y el slot cae dentro de su Availability propia (si tiene reglas)
            y recuento de reservas activas sobre ese recurso < capacity
        si recursosLibres.length == 0 → descartar slot
        sino → guardar recursosLibres como candidatos para ese slot
```

Respuesta ampliada: cada slot lleva `resources: [{ id, name }]` opcional, para que
la UI pueda mostrar "Sillón 3" si el anfitrión lo desea.

### 3.2 Creación (`POST /api/bookings`)

1. Validar el slot (igual que hoy) **y** que al menos un recurso permitido siga
   libre en ese slot (race-condition mínima entre el chequeo y la creación).
2. Elegir recurso: primera opción el que el cliente/UI pidió (`resourceId` del
   body, si estaba libre); si no, primero libre; desempate con el menos usado.
3. Guardar en `Booking`: `resourceId`, `locationId` (la del recurso si tiene),
   y la foto `resourceName` / `locationName` / `locationAddress`.
4. La creación de evento de Google Calendar / email / WhatsApp usan
   `locationName + locationAddress` como "dónde" en lugar del string genérico
   `"in-person"`.

### 3.3 Chequeo de conflicto (doble reserva)

Cuando el evento usa recursos, la consulta de conflicto pasa de:

```ts
// hoy: cualquier reserva activa del anfitrión que solape
```

a:

```ts
// con recursos: solape sobre el MISMO recurso, contando reservas activas
count(bookings activas donde resourceId = X y [start,end] solapa) < resource.capacity
```

El chequeo global del anfitrión se conserva **solo** para eventos sin recursos
(no rompe el comportamiento actual ni las series/equipos existentes).

### 3.4 Cancelación / reprogramación

- **Cancelar** → libera el recurso automáticamente (basta con que la reserva pase
  a `CANCELLED`; el chequeo ya filtra por estado activo). Gancho natural para el
  futuro *waitlist*: al liberarse un slot con recursos, se puede notificar a quien
  esperaba ese recurso concreto.
- **Reprogramar** → re-ejecutar la asignación de recurso sobre la nueva franja;
  si ningún recurso permitido está libre, devolver error igual que hoy con el
  solapamiento.

### 3.5 Series recurrentes (futuro)

Una serie asigna el recurso por ocurrencia (misma regla de "primero libre"), con
la particularidad de no usar un recurso que esté ocupado en alguna ocurrencia
(aplica la misma estrategia ya usada con la asignación de miembros del equipo).

## 4. UI / API — superficies afectadas

| Superficie | Cambio |
|---|---|
| Dashboard → Configuración → Ubicaciones | CRUD de sedes: nombre, dirección, ciudad, país, zona horaria |
| Dashboard → Configuración → Recursos | CRUD de recursos: nombre, tipo, sede, capacidad, activo, horarios propios |
| Editor de tipo de evento | Selector multi "Recursos permitidos" (vacío = sin restricción) |
| Página pública de reserva | Si el evento asigna recursos, mostrar sede + dirección en el resumen y en la confirmación |
| Modal/lista de reservas del dashboard | Mostrar `resourceName` / `locationName` (de la foto) |
| CRM / emails / WhatsApp | "Dónde" = dirección de la sede asignada en la foto |
| API v1 (`/api/v1/event-types`, bookings) | Exponer `resources` y `location` en payloads |
| Webhooks salientes | Incluir `data.resource` y `data.location` en `buildBookingPayload` |

## 5. Fases de implantación

**Fase A — núcleo (recomendada primero):**
1. Migración Prisma: `ResourceType` enum, `Location`, `Resource`,
   `EventTypeResource`, columnas nuevas en `Booking`, `bookingPageId` opcional +
   `resourceId` en `Availability`, con backfill de las filas existentes de
   `Availability` (siguen apuntando a su página).
2. `lib/resources.ts`: helpers de asignación y de solapamiento por recurso, con
   tests (`node:test` + tsx, como el resto de `lib/*.test.ts`).
3. Integrar en `check-availability` y `POST /api/bookings` (+ cancel/reschedule).
4. CRUD de Ubicaciones y Recursos + selector de recursos en el editor de evento.
5. Página pública y detalle de reserva muestran la foto.

**Fase B — multi-sede real (implementada):**
- **Huso propio en la disponibilidad**: el motor de slots (`lib/availability-engine.ts`)
  genera los horarios como *instantes reales* (UTC) a partir de las ventanas de
  cada fuente (página en el huso del propietario; horarios propios de cada
  recurso en el huso de su sede, `Location.timezone`), y devuelve las horas ya
  convertidas al huso del invitado (`check-availability` recibe `timezone`).
  Sin sede ni huso configurado degrada a `UTC` = comportamiento antiguo.
- **`TimeOff` por recurso** (`time_offs.resource_id`): una ausencia puede cerrar
  solo una sala/sillón; el resto de recursos y la página siguen ofertando.
  Bloquea ese recurso en disponibilidad, al reservar (`pickResourceForSlot`) y
  al reprogramar. En el calendario del dashboard no se pinta el día completo.
- **Sede por defecto por tipo de evento** (`EventType.locationId`, migración
  `20260904140000_add_eventtype_location`): para eventos en persona sin recurso
  reservable, el editor permite elegir una sede; su dirección queda como
  snapshot en cada reserva (confirmación pública, detalle, emails) y su huso
  ancla la disponibilidad (mismo motor que los recursos).
- Pendiente (opcional): `BookingPage.locationId` y el paso "elige sede" en la
  página pública para ofrecer el mismo evento en varias sedes.

**Fase C — recursos del equipo:**
- `TeamMember.resourceId` opcional ("Carlos trabaja en el Sillón 2") para que la
  asignación round-robin/smart del equipo respete también el recurso, y eventos
  grupales con aforo (`capacity > 1` + contador de ocupación por slot).

## 6. SQL de migración (Fase A, esbozo)

```sql
-- enums (Postgres enum)
CREATE TYPE "ResourceType" AS ENUM ('ROOM','CHAIR','EQUIPMENT','STATION','OTHER');

-- sedes
CREATE TABLE "locations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "city" TEXT,
  "country" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "locations_user_id_is_active_idx" ON "locations"("user_id","is_active");

-- recursos
CREATE TABLE "resources" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "location_id" TEXT,
  "name" TEXT NOT NULL,
  "type" "ResourceType" NOT NULL DEFAULT 'ROOM',
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resources" ADD CONSTRAINT "resources_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "resources_user_id_is_active_idx" ON "resources"("user_id","is_active");
CREATE INDEX "resources_location_id_idx" ON "resources"("location_id");

-- M2M tipo de evento ↔ recurso
CREATE TABLE "event_type_resources" (
  "event_type_id" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  CONSTRAINT "event_type_resources_pkey" PRIMARY KEY ("event_type_id","resource_id")
);
ALTER TABLE "event_type_resources" ADD CONSTRAINT "etr_event_type_fkey"
  FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_type_resources" ADD CONSTRAINT "etr_resource_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Booking: recurso/sede asignados + foto histórica
ALTER TABLE "bookings"
  ADD COLUMN "location_id" TEXT,
  ADD COLUMN "resource_id" TEXT,
  ADD COLUMN "resource_name" TEXT,
  ADD COLUMN "location_name" TEXT,
  ADD COLUMN "location_address" TEXT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "bookings_resource_id_idx" ON "bookings"("resource_id");
CREATE INDEX "bookings_location_id_idx" ON "bookings"("location_id");

-- Availability: pasa a ser XOR página/recurso (booking_page_id opcional)
ALTER TABLE "availability" ALTER COLUMN "booking_page_id" DROP NOT NULL;
ALTER TABLE "availability" ADD COLUMN "resource_id" TEXT;
ALTER TABLE "availability" ADD CONSTRAINT "availability_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "availability_resource_id_idx" ON "availability"("resource_id");
```

## 7. Preguntas abiertas (para decidir al implementar)

1. **Editor de horario por recurso**: el mismo editor visual de `Availability`
   (días/horas) pero con selector de ámbito (página / recurso), ¿o un editor
   separado dentro de "Recursos"?
2. **El cliente debe poder elegir recurso concreto** ("quiero el Sillón 3" en
   peluquerías con precios por sillón) o siempre lo asigna el sistema? El modelo
   soporta ambas (se pasa `resourceId` en el body y se valida), pero la UI
   cambia según la respuesta.
3. **Sedes sin recursos**: para un psicólogo con una sala, ¿basta con crear la
   `Location` y usarla como "dónde" del evento, o queremos también una columna
   `EventType.locationId`? (Fase A resuelve el caso vía recurso; la columna
   directa es más simple para "solo dirección, sin recurso reservable".)
4. ¿Los **eventos de equipo** (assignmentMode round_robin/smart) deben además
   validar el recurso del miembro asignado ya en Fase A, o se difiere a Fase C?
