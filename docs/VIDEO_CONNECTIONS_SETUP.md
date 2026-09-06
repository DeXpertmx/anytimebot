# Anytimebot — Videollamadas: Configuración de Zoom y Microsoft Teams (Entra)

> Guía para clientes y administradores. Estas instrucciones configuran **una sola vez** las
> aplicaciones OAuth de la plataforma. Después de esto, cada usuario de Anytimebot conecta
> **su propia cuenta** de Zoom o Microsoft desde **Dashboard → Integraciones → Videollamadas**
> y las reuniones se crean automáticamente en su cuenta al reservar.

---

## Cómo funciona (resumen)

| Pieza | Responsable | Se configura |
|---|---|---|
| Aplicación OAuth de Zoom (Marketplace) | Anytimebot (plataforma) | Una sola vez |
| Aplicación en Microsoft Entra (Azure AD) | Anytimebot (plataforma) | Una sola vez |
| Conexión de la cuenta personal (Zoom / Teams) | Cada cliente | En su dashboard |

- El **cliente** no crea nada en Zoom ni en Azure: solo pulsa **Conectar** y aprueba con su cuenta.
- Las variables de entorno (`ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `TEAMS_CLIENT_ID`,
  `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`) son las credenciales de la **plataforma** y se
  guardan en el entorno de producción (Vercel), nunca en la base de datos.

---

## 1. Configuración de la aplicación de Zoom

### 1.1 Crear la app OAuth

1. Entra en **[marketplace.zoom.us](https://marketplace.zoom.us)** con la cuenta de administrador.
2. Arriba a la derecha: **Build App** → elige **OAuth** → **Create**.
3. Nombre visible: p. ej. **Anytimebot** (lo verán tus clientes al autorizar).
4. Tipo de app: **Account-level app** (suficiente; los tokens son por usuario).
5. En **OAuth > Redirect URL for OAuth**, añade **exactamente**:

```
https://anytimebot.app/api/integrations/zoom/callback
```

> ⚠️ Debe coincidir carácter por carácter con la URL del entorno real.
> Si pruebas en local con `localhost`, añade también tu URL local, p. ej.
> `http://localhost:3000/api/integrations/zoom/callback`.

### 1.2 Scopes (permisos)

En **Scopes**, añade estos tres permisos:

| Scope | Motivo |
|---|---|
| `meeting:write` | Crear las reuniones de Zoom en la cuenta del cliente |
| `meeting:read` | Leer los datos de la reunión creada (URL de unión) |
| `user:read` | Mostrar el nombre/correo de la cuenta conectada en Integraciones |

### 1.3 Credenciales

En la pestaña **App Credentials** encontrarás:

- **Client ID** → variable `ZOOM_CLIENT_ID`
- **Client Secret** → variable `ZOOM_CLIENT_SECRET`

Activa la app (**Activate**) para que el flujo funcione en producción. En las apps de
Marketplace, el estado debe ser **Published/Active** (no *In Development*) para autorizaciones reales.

### 1.4 Alternativa: app Server-to-Server (cuenta de la plataforma)

Si en lugar de una app OAuth normal creas una app **Server-to-Server OAuth**, Zoom **no te
pedirá Redirect URL** (es normal: este tipo de app no usa consentimiento por usuario). En su
lugar obtiene tres credenciales en **App Credentials**: **Account ID**, **Client ID** y
**Client Secret**.

Con ellas Anytimebot puede crear reuniones con la **cuenta de Zoom de la propia plataforma**
cuando el cliente no ha conectado su cuenta personal (las reuniones se crean en la cuenta
corporativa de Anytimebot en lugar de en la del tenant). Para activarlo:

1. Crea la app **Server-to-Server OAuth** en marketplace.zoom.us y añade los scopes
   `meeting:write`, `meeting:read` y `user:read`.
2. Añade en Vercel las tres variables:

   | Variable | Ejemplo (no real) |
   |---|---|
   | `ZOOM_ACCOUNT_ID` | `abc123def456` |
   | `ZOOM_CLIENT_ID` | `abcdefghijklmnopqrstuvwxyz123456` |
   | `ZOOM_CLIENT_SECRET` | `AbCdEfGhIjKlMnOpQrStUvWxYz1234567890` |

3. Opcional: `ZOOM_HOST_EMAIL` con el correo del usuario anfitrión dentro de la cuenta de la
   plataforma (si se omite se usa el primer usuario activo de la cuenta).
4. En Integraciones → Videollamadas, la tarjeta de Zoom aparecerá **Conectado** con el texto
   de *cuenta de la plataforma* y sin botón de desconexión, y las reservas con proveedor
   Zoom generarán la reunión automáticamente.

---

## 2. Configuración de la aplicación de Microsoft Teams (Entra ID)

### 2.1 Crear el registro de aplicación

1. Entra en **[portal.azure.com](https://portal.azure.com)** → **Microsoft Entra ID** →
   **App registrations** → **New registration**.
2. Nombre: p. ej. **Anytimebot**.
3. **Supported account types**: elige **Accounts in any organizational directory and personal
   Microsoft accounts** (multi-tenant), porque cada cliente autoriza con su propia organización.
4. **Redirect URI**: plataforma **Web**, URI exacta:

```
https://anytimebot.app/api/integrations/teams/callback
```

> Si pruebas en local, añade también `http://localhost:3000/api/integrations/teams/callback`.

### 2.2 API permissions (scopes delegados)

En **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**,
añade:

| Permiso (delegado) | Motivo |
|---|---|
| `openid` | Identificación del usuario (automático con la API de login) |
| `profile` | Nombre mostrado |
| `email` | Correo del usuario |
| `offline_access` | **Obligatorio**: permite el refresh token para renovar sin volver a pedir permiso |
| `User.Read` | Perfil de la cuenta conectada |
| `Calendars.ReadWrite` | Crear el evento de Teams con reunión en línea en el calendario del cliente |

> 🛈 **openid / profile / email** normalmente vienen pre-seleccionados al crear el registro;
> comprueba que estén marcados y añade `offline_access`, `User.Read` y `Calendars.ReadWrite`.

⚠️ **Consentimiento del administrador**: para que cualquier organización pueda usarlo sin
fricción, pulsa **Grant admin consent** en la pestaña de API permissions (lo hace el admin
de la organización propietaria de la app). Sin ese consentimiento, cada cliente verá la
pantalla de aprobación al conectar (aceptable, pero añade un paso).

### 2.3 Exponer un secreto de cliente

En **Certificates & secrets** → **Client secrets** → **New client secret** (caducidad
recomendada 12–24 meses). Anota el **valor** (solo se muestra una vez) → variable `TEAMS_CLIENT_SECRET`.

### 2.4 Credenciales finales

| Variable de entorno | Dónde encontrarla en Azure |
|---|---|
| `TEAMS_CLIENT_ID` | **Overview** → *Application (client) ID* |
| `TEAMS_CLIENT_SECRET` | **Certificates & secrets** → valor del secret |
| `TEAMS_TENANT_ID` | **Overview** → *Directory (tenant) ID* |

> La autorización usa el authority `common`, por lo que `TEAMS_TENANT_ID` se usa solo para
> mostrar el tenant conectado; si quieres restringir a tu organización, puedes cambiarlo
> al ID de tu directorio.

---

## 3. Variables de entorno (plataforma)

Añade a **Vercel → Project → Settings → Environment Variables → Production**:

| Variable | Ejemplo (no real) |
|---|---|
| `ZOOM_CLIENT_ID` | `abcdefghijklmnopqrstuvwxyz123456` |
| `ZOOM_CLIENT_SECRET` | `AbCdEfGhIjKlMnOpQrStUvWxYz1234567890` |
| `TEAMS_CLIENT_ID` | `12345678-1234-1234-1234-123456789abc` |
| `TEAMS_CLIENT_SECRET` | `AbC~dEfGhIjKlMnOpQrStUvW` |
| `TEAMS_TENANT_ID` | `87654321-4321-4321-4321-cba987654321` |

Marca las de **Secret** (client secrets) como sensibles. No hace falta redeploy para que
las variables nuevas surtan efecto en el siguiente request, pero es recomendable lanzar un
deploy para asegurar consistencia.

---

## 4. Flujo del cliente (una vez configurado)

1. El cliente entra en **Dashboard → Integraciones → Videollamadas**.
2. Pulsa **Conectar** en la tarjeta de Zoom o Microsoft Teams.
3. Se abre la pantalla de autorización del proveedor (Zoom / Microsoft). El cliente inicia
   sesión con su cuenta y aprueba los permisos.
4. Vuelve automáticamente a Integraciones con la cuenta conectada (correo + nombre visibles).
5. Al crear un tipo de evento con **Videollamada** y proveedor **Zoom** o **Teams**, Anytimebot
   crea la reunión **en la cuenta del cliente** en el momento de la reserva y el enlace se
   envía en la confirmación, recordatorios y en la sala de reunión.

---

## 5. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Error al pulsar *Conectar* en Zoom/Teams | Variables de entorno de la plataforma no configuradas | Añade `ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET` (o `TEAMS_*`) en Vercel |
| *redirect_uri_mismatch* al autorizar | La Redirect URI de la app no coincide | Revisa que sea exactamente `https://anytimebot.app/api/integrations/zoom/callback` (o `/api/integrations/teams/callback`) |
| *invalid_scope* en Teams | Falta `offline_access` o `Calendars.ReadWrite` | Comprueba los scopes delegados en Azure (sección 2.2) |
| Zoom pide aprobación de la app | App en estado *In Development* | Publica/activa la app en el Marketplace |
| Se conecta pero no se crea la reunión | Token expirado o permisos insuficientes | Desconecta y vuelve a conectar la cuenta; comprueba los scopes |
| La reunión no aparece en la cuenta | El evento no tiene proveedor Zoom/Teams seleccionado | En el tipo de evento elige **Videollamada → Zoom/Teams** |

---

## 6. Enlaces de referencia

- Zoom Marketplace — <https://marketplace.zoom.us>
- Documentación OAuth de Zoom — <https://developers.zoom.us/docs/integrations/oauth/>
- Azure Portal — <https://portal.azure.com>
- Microsoft identity platform (OAuth 2.0) — <https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow>
- Microsoft Graph: crear evento con reunión online — <https://learn.microsoft.com/en-us/graph/api/user-post-events>