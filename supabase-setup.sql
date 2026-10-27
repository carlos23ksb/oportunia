-- ============================================================================
-- OPORTUNIA — Esquema Supabase (PostgreSQL)
-- Ejecuta este script en: Supabase Dashboard → SQL Editor → New query.
-- Crea las tablas que la app espera + seguridad RLS básica.
-- La app en modo local NO usa este archivo; solo al conectar Supabase.
-- ============================================================================

-- Perfiles de usuario (1 fila por usuario autenticado)
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  pais text default '',
  ciudad text default '',
  bio text default '',
  habilidades text default '',
  whatsapp text default '',
  email_contacto text default '',
  es_admin boolean default false,
  created_at timestamptz default now()
);

-- Publicaciones (oportunidades, necesidades, ideas, servicios)
create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid references auth.users(id) on delete cascade,
  autor_nombre text not null,
  tipo text not null check (tipo in ('oportunidad','necesidad','idea','servicio')),
  categoria text not null,
  titulo text not null,
  descripcion text not null,
  pais text not null,
  ciudad text default '',
  presupuesto text default '',
  contacto_preferido text default 'mensaje',
  whatsapp text default '',
  email_contacto text default '',
  destacada boolean default false,
  oculta boolean default false,
  es_demo boolean default false,
  created_at timestamptz default now()
);

-- Favoritos (un favorito por usuario y publicación)
create table if not exists public.favoritos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete cascade,
  publicacion_id uuid references public.publicaciones(id) on delete cascade,
  created_at timestamptz default now(),
  unique (usuario_id, publicacion_id)
);

-- Solicitudes de contacto / colaboración
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid references public.publicaciones(id) on delete cascade,
  publicacion_titulo text not null,
  autor_id uuid references auth.users(id) on delete cascade,
  remitente_id uuid references auth.users(id) on delete cascade,
  remitente_nombre text not null,
  remitente_contacto text default '',
  tipo text not null check (tipo in ('contacto','colaboracion')),
  mensaje text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','rechazada')),
  created_at timestamptz default now()
);

-- Índices para búsquedas frecuentes
create index if not exists idx_publicaciones_tipo on public.publicaciones (tipo);
create index if not exists idx_publicaciones_categoria on public.publicaciones (categoria);
create index if not exists idx_publicaciones_pais on public.publicaciones (pais);
create index if not exists idx_publicaciones_oculta on public.publicaciones (oculta);
create index if not exists idx_favoritos_usuario on public.favoritos (usuario_id);
create index if not exists idx_solicitudes_autor on public.solicitudes (autor_id);
create index if not exists idx_solicitudes_remitente on public.solicitudes (remitente_id);

-- Seguridad RLS: activar en todas las tablas
alter table public.perfiles enable row level security;
alter table public.publicaciones enable row level security;
alter table public.favoritos enable row level security;
alter table public.solicitudes enable row level security;

-- Perfiles: cualquiera puede leerlos; cada usuario edita solo el suyo
create policy "perfiles lectura publica" on public.perfiles
  for select using (true);
create policy "perfiles inserta el propio" on public.perfiles
  for insert with check (auth.uid() = id);
create policy "perfiles actualiza el propio" on public.perfiles
  for update using (auth.uid() = id);

-- Publicaciones: lectura pública de las NO ocultas; el autor gestiona las suyas
create policy "publicaciones lectura publica" on public.publicaciones
  for select using (oculta = false or auth.uid() = autor_id);
create policy "publicaciones crea el autor" on public.publicaciones
  for insert with check (auth.uid() = autor_id);
create policy "publicaciones actualiza el autor" on public.publicaciones
  for update using (auth.uid() = autor_id);
create policy "publicaciones borra el autor" on public.publicaciones
  for delete using (auth.uid() = autor_id);

-- Favoritos: cada usuario ve y gestiona solo los suyos
create policy "favoritos del propio usuario" on public.favoritos
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- Solicitudes: las ven remitente y autor de la publicación
create policy "solicitudes lectura implicados" on public.solicitudes
  for select using (auth.uid() = remitente_id or auth.uid() = autor_id);
create policy "solicitudes crea el remitente" on public.solicitudes
  for insert with check (auth.uid() = remitente_id);
create policy "solicitudes actualiza el autor" on public.solicitudes
  for update using (auth.uid() = autor_id);

-- NOTA DE MODERACIÓN (admin):
-- Para que un usuario sea admin, marca es_admin = true en su fila de
-- perfiles desde el editor de tablas de Supabase (Table Editor). La app
-- oculta publicaciones poniendo oculta = true; esa acción la hace el admin
-- desde el panel. Si quieres una política RLS de admin total, añade:
--   create policy "admin gestiona todo" on public.publicaciones for all
--   using (exists (select 1 from public.perfiles p
--                  where p.id = auth.uid() and p.es_admin = true));
-- (Se deja fuera por defecto para no abrir permisos sin revisión.)
