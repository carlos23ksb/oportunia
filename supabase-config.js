/* ============================================================================
   OPORTUNIA — Configuración de Supabase (SIN CLAVES REALES)
   ----------------------------------------------------------------------------
   Este archivo NO contiene ninguna clave secreta. Los dos valores están
   vacíos a propósito: sin ellos, la app funciona en MODO LOCAL (demo),
   guardando todo en el navegador con localStorage.

   CÓMO CONECTAR SUPABASE (cuando quieras datos reales y multiusuario):
   1. Entra a https://supabase.com y crea un proyecto GRATIS.
   2. En el proyecto ve a:  Project Settings → API.
   3. Copia la "Project URL" y la clave "anon public".
   4. Pégalas abajo entre las comillas (NUNCA pegues la clave "service_role":
      esa es secreta y jamás debe ir en el navegador).
   5. En el editor SQL de Supabase, ejecuta el archivo supabase-setup.sql
      de esta carpeta (crea las tablas perfiles, publicaciones, favoritos
      y solicitudes con seguridad RLS).
   6. Recarga la app: verás el distintivo «Modo Supabase» en la parte
      superior y los datos dejarán de ser solo locales.

   La clave "anon" es pública por diseño: la seguridad real vive en las
   políticas RLS del archivo SQL. Aun así, no compartas capturas de la
   clave service_role ni la subas a ningún repositorio.
   ========================================================================== */
window.OPORTUNIA_CONFIG = {
  SUPABASE_URL: "",       // Ej.: "https://tu-proyecto.supabase.co"
  SUPABASE_ANON_KEY: ""   // Ej.: la clave "anon public" de Project Settings → API
};
