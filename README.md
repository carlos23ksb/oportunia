# Oportunia

Plataforma web para descubrir oportunidades de negocio, conectar personas y
generar ingresos. Cualquiera puede publicar lo que necesita, una habilidad
que ofrece, una idea de negocio o una oportunidad para ganar dinero. Otros
usuarios encuentran esas publicaciones, contactan a sus creadores y proponen
colaboraciones. Funciona para cualquier país, no solo México.

Aplicación estática real: **HTML + CSS + JavaScript vanilla**, sin paso de
compilación ni dependencia de framework. Todos los botones visibles
funcionan o explican con honestidad qué configuración les falta.

## Probar en 1 minuto (modo local, sin cuentas externas)

```bash
cd oportunia
python3 -m http.server 8000
```

Abre `http://localhost:8000` en el navegador.

**Desde el celular (misma red Wi-Fi):**

1. En la computadora, averigua su IP local (en Linux: `hostname -I`).
2. Sirve la carpeta: `python3 -m http.server 8000`.
3. En el celular abre `http://TU-IP:8000` (ej.: `http://192.168.1.20:8000`).
4. Si el celular no carga la página, revisa que el firewall permita el
   puerto 8000 y que ambos estén en la misma red.

> Nota: en modo local los datos viven en el navegador (localStorage) de
> cada dispositivo. Lo que publiques en el celular no se verá en la
> computadora hasta conectar Supabase (ver abajo).

## Cuentas de demostración (modo local)

Todo el contenido semilla está marcado con la etiqueta
**«Contenido de demostración»**. Las contraseñas son de demostración y
solo existen en el navegador de quien prueba.

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@oportunia.demo` | `admin123` | Administrador (modera publicaciones) |
| `maria@demo.com` | `demo123` | Usuaria (Colombia) |
| `diego@demo.com` | `demo123` | Usuario (Argentina) |
| `lucia@demo.com` | `demo123` | Usuaria (España) |
| `carlos@demo.com` | `demo123` | Usuario (México) |
| `valentina@demo.com` | `demo123` | Usuaria (Perú) |

En la pantalla de login hay botones para llenar estas cuentas con un toque.
**Restablecer demo:** botón en el pie de página y en el panel de admin;
borra los datos locales y restaura usuarios y publicaciones semilla.

## Qué está completo

- Inicio con hero y los 3 accesos destacados (encontrar / ofrecer /
  idea o necesidad), cada uno abre el flujo correspondiente.
- Registro, inicio de sesión, cierre de sesión y sesión persistente.
  En modo local la contraseña se guarda **solo como hash SHA-256**
  (SubtleCrypto, con respaldo JS cuando el contexto no es seguro).
- Perfiles: ver y editar nombre, país, ciudad, biografía, habilidades,
  WhatsApp y correo de contacto.
- Publicaciones: crear, editar y eliminar las propias. Tipos: oportunidad,
  necesidad, idea y servicio. Categorías, país, ciudad, presupuesto
  opcional y preferencia de contacto. Página de detalle por publicación
  con rutas hash (`#/oportunidad/<id>`).
- Buscador + filtros por texto, tipo, categoría, país y ciudad, con
  resultados en vivo y mensaje de estado vacío.
- Favoritos: guardar/quitar con la estrella; vista de favoritos en el
  panel y en la navegación.
- Mi panel: resumen, mis publicaciones, favoritos, solicitudes recibidas
  y enviadas, y edición de perfil.
- Contacto y colaboración: formulario guardado que ve el dueño en su
  panel; botones directos de WhatsApp (`wa.me`) y correo (`mailto`)
  cuando el dueño los compartió; las solicitudes de colaboración tienen
  estado pendiente/aceptada/rechazada que el dueño cambia.
- Panel de administración (rol admin): ver todas las publicaciones,
  ocultar/mostrar cualquiera (las ocultas salen de Explorar), ver
  usuarios y eliminar publicaciones.
- Contenido de demostración: 9 publicaciones de 5 países + 6 usuarios,
  todos etiquetados como demo.
- Estados de carga, mensajes de error, confirmaciones (toasts),
  validación de formularios con mensajes en línea y rutas protegidas
  (publicar/panel/favoritos/admin exigen sesión; si no, redirigen al
  login con aviso).
- Diseño responsive mobile-first: menú hamburguesa y barra inferior de
  navegación en celular, tarjetas y formularios adaptados.
- Capa de datos como adaptador (`store` en `app.js`): toda la app lee y
  escribe por esas funciones; el cambio entre modo local y Supabase es
  un interruptor, no una reescritura.

## Qué requiere configuración externa (NO está activo)

1. **Supabase (datos reales y multiusuario).** Sin esto la app es
   local/demo. Pasos en el comentario superior de
   `supabase-config.js`:
   - Crea un proyecto gratis en https://supabase.com.
   - Copia la Project URL y la clave `anon public` en
     `supabase-config.js` (jamás la clave `service_role`).
   - Ejecuta `supabase-setup.sql` en el editor SQL de Supabase (crea
     `perfiles`, `publicaciones`, `favoritos`, `solicitudes` + RLS).
   - Recarga: el distintivo superior cambia a «Modo Supabase».
   - Para hacer admin a un usuario, pon `es_admin = true` en su fila de
     `perfiles` desde el editor de tablas.
2. **Pagos (destacados y planes premium).** Los botones «Destacar»,
   «Elegir Profesional» y «Elegir Negocios» abren un modal honesto que
   explica que ningún cobro está conectado ni se procesa. Para
   activarlos falta: Supabase conectado + proveedor de pagos (Stripe,
   Mercado Pago u otro) + verificación de pagos en servidor. No hay
   claves de pago en este proyecto.
3. **Publicidad real.** El «Espacio patrocinado» de Explorar muestra
   contenido de demostración hasta que haya anunciantes reales.

No se afirma que la plataforma esté terminada: sin Supabase ni pagos,
es un producto funcional en modo local, listo para conectarse.

## Estructura

```
oportunia/
├── index.html          # Estructura, navegación, pie, modal y toasts
├── styles.css          # Sistema visual (oscuro, violetas/azules, responsive)
├── app.js              # Toda la lógica: rutas, vistas, store, auth
├── supabase-config.js  # URL + clave anon (VACÍAS; sin secretos)
├── supabase-setup.sql  # Tablas + índices + políticas RLS
└── README.md           # Este archivo
```

## Publicación en GitHub Pages (pendiente de despliegue)

El destino previsto es el repositorio **`oportunia`** en la cuenta
**`carlos23ksb`** de GitHub (GitHub Pages). Para desplegarlo: crea el
repo, sube estos archivos a la rama `main` y activa Pages
(Settings → Pages → Deploy from branch → `main` / root). La app no
necesita build: funciona tal cual se sube.

## Privacidad y seguridad

- En modo local, todo vive en el navegador del usuario; no se envía
  nada a ningún servidor.
- Las contraseñas locales nunca se guardan en texto plano (hash SHA-256).
- Con Supabase, la seguridad vive en las políticas RLS del SQL y en
  Supabase Auth; la clave `anon` es pública por diseño y la
  `service_role` jamás debe ir en el navegador.
- No publiques datos sensibles (contraseñas, números de cuenta) en las
  publicaciones: son visibles para cualquier visitante.
