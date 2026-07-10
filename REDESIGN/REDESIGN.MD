# Tank Arena — Rediseño de UI (tema "Pastel cálido")

Especificación de diseño para migrar del tema retro verde terminal al nuevo tema pastel cálido (light) con dark mode slate. Cualquier cambio de UI debe seguir este documento.

## 1. Paleta de colores

### Light mode (default)

```css
:root {
  --page-bg: #F6F1E7;

  --color-bg-page: #F6F1E7;
  --color-bg-inset: #FBF8F1;
  --color-bg-surface: #FFFFFF;
  --color-bg-surface-hover: #F1EBDD;

  --color-text-primary: #2C2C2A;
  --color-text-secondary: #5F5E5A;
  --color-text-muted: #B4B2A9;
  --color-text-tertiary: #888780;

  --color-accent: #D85A30;
  --color-accent-hover: #BA4A25;
  --color-accent-contrast: #FFFFFF;
  --color-accent-bg: #FAECE7;
  --color-accent-text: #712B13;

  --color-border: #E3DDD0;
  --color-border-strong: #D3D1C7;

  --color-success: #0F6E56;
  --color-success-bg: #E1F5EE;
  --color-success-text: #085041;
  --color-success-border: #9FE1CB;

  --color-pending: #854F0B;
  --color-pending-bg: #FAEEDA;

  --color-warning: #BA7517;
  --color-warning-bg: #FAEEDA;

  --color-error: #A32D2D;
  --color-error-bg: #FCEBEB;

  --color-gold-bg: #FAEEDA;
  --color-gold-text: #633806;
  --color-gold-strong: #854F0B;
  --color-gold-avatar: #FAC775;

  --color-silver-bg: #F1EFE8;
  --color-silver-text: #444441;
  --color-silver-avatar: #D3D1C7;

  --color-bronze-bg: #FAECE7;
  --color-bronze-text: #712B13;

  --color-link: #185FA5;

  --radius-card: 12px;
  --radius-control: 8px;
  --radius-pill: 999px;
}
```

### Dark mode

```css
[data-theme="dark"] {
  --page-bg: #1B1F26;

  --color-bg-page: #1B1F26;
  --color-bg-inset: #2A303C;
  --color-bg-surface: #232833;
  --color-bg-surface-hover: #2E3542;

  --color-text-primary: #E8EAEE;
  --color-text-secondary: #A9B0BE;
  --color-text-muted: #6B7280;
  --color-text-tertiary: #8B93A3;

  --color-accent: #1D9E75;
  --color-accent-hover: #178862;
  --color-accent-contrast: #FFFFFF;
  --color-accent-bg: #17362C;
  --color-accent-text: #9FE1CB;

  --color-border: #333A47;
  --color-border-strong: #414A5A;

  --color-success: #5DCAA5;
  --color-success-bg: #17362C;
  --color-success-text: #9FE1CB;
  --color-success-border: #2A5546;

  --color-pending: #FAC775;
  --color-pending-bg: #3E3417;

  --color-warning: #EF9F27;
  --color-warning-bg: #3E3417;

  --color-error: #F09595;
  --color-error-bg: #402020;

  --color-gold-bg: #3E3417;
  --color-gold-text: #FAC775;
  --color-gold-strong: #EF9F27;
  --color-gold-avatar: #854F0B;

  --color-silver-bg: #333A47;
  --color-silver-text: #C9CFDA;
  --color-silver-avatar: #414A5A;

  --color-bronze-bg: #38302B;
  --color-bronze-text: #F0997B;

  --color-link: #85B7EB;
}
```

## 2. Tipografía

- Fuente principal (UI general): **Inter**, fallback `system-ui, sans-serif`. Importar de Google Fonts o npm.
- Monospace SOLO para datos numéricos y técnicos: tokens, kills, damage, direcciones de wallet, IDs. Usar `'JetBrains Mono', monospace` o la mono que ya exista.
- Pesos: 400 (regular) y 500 (medium). NO usar 600/700.
- Sentence case en todos los textos: "Jugar ahora", nunca "JUGAR AHORA" ni "Jugar Ahora".
- Eliminar `letter-spacing` amplio y estilos ALL CAPS del tema anterior, salvo micro-etiquetas ("Centro de comando") que pueden mantener letter-spacing 0.5px con color muted.

## 3. Componentes

### Cards
- Fondo `--color-bg-surface`, borde `0.5px solid var(--color-border)`, radius `--radius-card`, padding 16–20px.
- Secciones internas destacadas (hero de "Jugar ahora", panel de premios): fondo `--color-bg-inset`, sin borde, radius 12px.
- Eliminar TODOS los bordes verdes de 1px del tema anterior.

### Botón primario (CTA)
- Fondo `--color-accent`, texto `--color-accent-contrast`, radius `--radius-control`, padding 10px 28px, peso 500.
- Hover: `--color-accent-hover`.
- Solo UN botón primario por vista. Botones secundarios: fondo transparente, borde `--color-border-strong`.

### Chips de filtro (Mis partidas)
- Activo: fondo `--color-accent`, texto blanco, radius pill.
- Inactivo: fondo `--color-bg-inset`, texto `--color-text-secondary`, borde `--color-border`, radius pill.

### Badges de estado (premio)
- `SENT` / Confirmado: fondo `--color-success-bg`, texto `--color-success-text`, ícono `ti-circle-check`, radius pill.
- `PENDING` / Pendiente: fondo `--color-pending-bg`, texto `--color-pending`, ícono `ti-clock`.
- No elegible: fondo `--color-bg-inset`, texto `--color-text-tertiary`, borde `--color-border-strong`. En "Mis partidas" (donde el API devuelve `ineligibilityReason`), mostrar el motivo traducido en texto pequeño bajo el chip, ej. `WALLET_NOT_LINKED` → "Wallet no vinculada".
- Error / fallo de envío: fondo `--color-error-bg`, texto `--color-error`.

### Badges de posición (podio)
- 1.º: fondo `--color-gold-bg`, texto `--color-gold-text`, ícono `ti-trophy`.
- 2.º: fondo `--color-silver-bg`, texto `--color-silver-text`.
- 3.º: fondo `--color-bronze-bg`, texto `--color-bronze-text`.
- 4.º en adelante: sin fondo, texto `--color-text-secondary`.

### Avatares
- Círculo 30px con `avatarUrl` si existe; si es null, iniciales del username (2 letras) sobre fondo del color del podio (`--color-gold-avatar` para 1.º, `--color-silver-avatar` para 2.º, `--color-bg-inset` para el resto).

### Stat cards (contadores)
- Grid de 3, fondo tintado según significado: Cargadas → `--color-bg-inset` neutro, Victorias → `--color-success-bg`, Con premio → `--color-gold-bg`.
- Label 12px arriba con ícono, número 22px peso 500 abajo.

### Tabla (detalle de partida)
- Sin bordes de celda. Headers 12px color `--color-text-tertiary`, peso 500.
- Fila del ganador: fondo `--color-gold-bg` con radius 8px en extremos (border-radius solo en primera y última celda).
- Números (kills, damage, premio) en monospace.

### Links
- Color `--color-link`, ícono `ti-external-link` para enlaces externos (Solscan).

### Modal (Cuenta)
- Overlay `rgba(44,44,42,0.45)` (light) / `rgba(0,0,0,0.55)` (dark).
- Modal: fondo `--color-bg-surface`, radius 12px, padding 20px, ancho máx 360px.
- Cada proveedor (Google, Phantom) como fila con ícono, nombre, estado y acción:
  - Vinculado/verificado: fondo `--color-success-bg`, borde `--color-success-border`, badge "Verificada".
  - No vinculado: borde `--color-border`, link de acción "Vincular" en `--color-accent`.
- Balance de tokens: card `--color-gold-bg`, número en monospace 18px.

## 4. Íconos

- Librería: Tabler Icons webfont (`npm install @tabler/icons-webfont`), solo variante **outline**.
- Mapa de uso: `ti-tank` (logo), `ti-users` (online/participantes), `ti-swords` (batallas), `ti-door` (salas), `ti-trophy` (1.º/victorias), `ti-coins` (tokens/premios), `ti-database` (cargadas), `ti-circle-check` (confirmado/verificado), `ti-clock` (pendiente), `ti-external-link` (Solscan), `ti-wallet` (Phantom), `ti-brand-google` (Google), `ti-arrow-left`/`ti-arrow-right` (navegación), `ti-x` (cerrar modal).
- Tamaño: 13–18px inline, heredan color del texto.

## 5. Reglas por pantalla

### Lobby (/lobby)
- Hero central: card inset con botón "Jugar ahora" dominante y subtexto debajo.
- Contadores online/batallas/salas como pills pequeñas BAJO el CTA (no como cajas grandes arriba).
- Panel de premios a la derecha: podio vertical 1.º/2.º/3.º con colores de medalla, montos en mono.
- Elegibilidad como checklist con `ti-circle-check` verde por ítem cumplido; ítem no cumplido con `ti-circle-x` y color `--color-text-muted`.

### Mis partidas (/matches/me)
- Filtros como chips pill.
- 3 stat cards tintadas.
- Card por partida: fecha muted arriba, nombre de mapa legible (`mapName`, no el slug) como título con el slug pequeño al lado, badge de posición + kills/damage, columna derecha con chip de estado + monto `+700 tokens` en mono + link Solscan.

### Historial global (/matches/recent)
- Card por partida con header (mapa, fecha, participantes, link "Detalle").
- Filas de podio (el API solo trae placements 1–3): avatar + posición + username + tokens + chip de estado + Solscan si aplica.

### Detalle (/matches/:id)
- Header con nombre de mapa, fecha, pill de participantes.
- Tabla según especificación de componentes (fila ganadora dorada).

## 6. Prohibiciones

- NO usar verde neón `#d4ff5f` ni el borde `#71825c` en ningún lugar.
- NO usar negro puro `#000` ni el fondo `#11170f`.
- NO usar monospace para texto de UI (títulos, botones, párrafos).
- NO usar ALL CAPS salvo micro-etiquetas definidas arriba.
- NO usar bordes de color saturado; el color va en fondos de chips/badges, no en bordes de cards.