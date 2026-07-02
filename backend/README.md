# Tank Arena backend

Backend autoritativo NestJS con autenticación Google/Phantom, lobby, salas en memoria,
PostgreSQL/Prisma y Redis.

## Desarrollo local

### Modo de juego sin autenticación

El `.env` local incluye:

```env
DEV_GAME_MODE=true
DEV_INFRA_OPTIONAL=true
DEV_MANUAL_START=true
```

Con estas opciones puedes ejecutar solamente:

```powershell
cd backend
npm run dev

cd ..\frontend
npm start
```

El navegador entra como invitado, no necesita PostgreSQL, Redis, Google ni Phantom, y
ENTER inicia la partida manualmente incluso con un solo jugador. Estas opciones son
rechazadas cuando `NODE_ENV=production`.

Para probar autenticación y persistencia cambia las tres opciones a `false` y sigue el
flujo completo:

1. Instala Docker Desktop o un runtime compatible.
2. Desde `../docker`, ejecuta `docker compose up -d`.
3. Copia y ajusta `.env.example` cuando no quieras usar los valores locales de `.env`.
4. Ejecuta `npm run prisma:deploy`.
5. Ejecuta `npm run dev`.

pgAdmin queda disponible en `http://localhost:8081`.

- Login local predeterminado: `admin@example.com`
- Contraseña de pgAdmin: `admin`
- Servidor PostgreSQL: aparece como `Tank Arena PostgreSQL`
- Contraseña de la conexión PostgreSQL: `tank_arena`

Estos valores salen de `docker/.env` y deben cambiarse fuera del entorno local.

Redis Commander queda disponible en `http://localhost:8082` y se conecta
automáticamente al Redis local usando la contraseña configurada en `docker/.env`.

El frontend usa `http://localhost:4200` por defecto. Configura el mismo Google Client ID
en `backend/.env` y `frontend/src/environments/environment.ts`.

## Contrato de autenticación

- Google: `POST /auth/google`.
- Phantom: `POST /auth/phantom/challenge` y `POST /auth/phantom/verify`.
- Username inicial: `POST /auth/complete-profile`.
- Sesión: `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Socket.IO recibe el access token en `handshake.auth.token`.

Los access tokens duran 15 minutos. El refresh token rotatorio se guarda como cookie
HttpOnly y su hash vive en Redis.

## Salas

- Mínimo: 2 jugadores.
- Máximo: 15 jugadores.
- Countdown normal: 60 segundos.
- Sala llena: countdown máximo de 10 segundos.
- Reconexión durante partida: 15 segundos.
- Regreso a la misma sala después de finalizar: 5 segundos.

Cada sala posee un runtime independiente en RAM. PostgreSQL guarda únicamente el resumen
final, estadísticas y recompensas pendientes.

## Despliegue en producción

Antes de iniciar una nueva versión del backend, aplica las migraciones pendientes:

```bash
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run build
npm run start
```

`prisma:deploy` ejecuta `prisma migrate deploy`: aplica solamente las migraciones
pendientes que ya existen en `prisma/migrations`. No crea migraciones nuevas ni
reinicia la base de datos.

La migración debe ejecutarse una sola vez por despliegue, idealmente como un release
command o paso previo al arranque. Si existen varias instancias del backend, no es
necesario ejecutar manualmente el comando en cada una.

En producción configura:

```env
NODE_ENV=production
DEV_GAME_MODE=false
DEV_INFRA_OPTIONAL=false
DEV_MANUAL_START=false
```

No uses `prisma migrate dev` en producción. Ese comando se reserva para crear
migraciones durante el desarrollo.
