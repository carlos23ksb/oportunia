'use strict';
/* ============================================================================
   OPORTUNIA — Aplicación (HTML + CSS + JS vanilla, sin build step)
   ----------------------------------------------------------------------------
   Arquitectura: toda la lectura/escritura de datos pasa por el adaptador
   `store` (ver sección "ADAPTADOR DE DATOS"). Sin claves de Supabase
   usa localStorage (modo local / demo). Con claves en supabase-config.js
   y el cliente Supabase cargado desde CDN, usa las tablas de Supabase
   (ver supabase-setup.sql). La autenticación local guarda SOLO el hash
   SHA-256 de la contraseña, nunca el texto plano.
   ========================================================================== */

/* ---------------- Utilidades ---------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
}
function debounce(fn, ms) {
  var t = null;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

/* SHA-256: usa SubtleCrypto cuando el contexto lo permite (localhost/HTTPS);
   si no está disponible (p. ej. HTTP por LAN al probar desde el celular),
   usa una implementación JS compacta de respaldo. */
function sha256Sync(ascii) {
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  var maxWord = Math.pow(2, 32), result = '', words = [];
  var bitLen = ascii.length * 8;
  var hash = sha256Sync.h = sha256Sync.h || [];
  var k = sha256Sync.k = sha256Sync.k || [];
  var primeCounter = k.length, isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (var i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) { ascii += '\x00'; }
  for (var j = 0; j < ascii.length; j++) {
    var ch = ascii.charCodeAt(j);
    if (ch >> 8) { return null; }
    words[j >> 2] |= ch << ((3 - j) % 4) * 8;
  }
  words[words.length] = ((bitLen / maxWord) | 0);
  words[words.length] = bitLen;
  for (var j2 = 0; j2 < words.length;) {
    var w = words.slice(j2, j2 += 16), oldHash = hash;
    hash = hash.slice(0, 8);
    for (var i2 = 0; i2 < 64; i2++) {
      var w15 = w[i2 - 15], w2 = w[i2 - 2];
      var a = hash[0], e = hash[4];
      var temp1 = hash[7]
        + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i2]
        + (w[i2] = i2 < 16 ? w[i2] : (
          w[i2 - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
          + w[i2 - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (var i3 = 0; i3 < 8; i3++) { hash[i3] = (hash[i3] + oldHash[i3]) | 0; }
  }
  for (var i4 = 0; i4 < 8; i4++) {
    for (var j3 = 3; j3 + 1; j3--) {
      var b = (hash[i4] >> (j3 * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}
async function hashPassword(pw) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
      return Array.from(new Uint8Array(buf)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    }
  } catch (e) { /* cae al respaldo JS */ }
  var h = sha256Sync(unescape(encodeURIComponent(pw)));
  if (!h) { throw new Error('No se pudo generar el hash de la contraseña en este navegador.'); }
  return h;
}

/* ---------------- Configuración y modo ---------------- */
var CFG = (typeof window !== 'undefined' && window.OPORTUNIA_CONFIG) || { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
var sb = null; // cliente Supabase, solo si hay claves + librería CDN
try {
  if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }
} catch (e) { sb = null; }
function isCloudMode() { return !!sb; }

var CATEGORIAS = ['tecnología', 'ventas', 'servicios', 'comida', 'educación', 'diseño', 'construcción', 'salud', 'otro'];
var TIPOS = ['oportunidad', 'necesidad', 'idea', 'servicio'];
var PAISES = ['México', 'Colombia', 'Argentina', 'España', 'Perú', 'Estados Unidos', 'Chile', 'Venezuela', 'Ecuador', 'Brasil', 'República Dominicana', 'Otro'];
var TIPO_LABEL = { oportunidad: 'Oportunidad', necesidad: 'Necesidad', idea: 'Idea', servicio: 'Servicio' };

/* ---------------- Datos semilla (demo) ---------------- */
var SEED_USERS = [
  { nombre: 'Ana Administradora', email: 'admin@oportunia.demo', pass: 'admin123', pais: 'México', ciudad: 'Ciudad de México', bio: 'Moderadora de Oportunia. Reviso que las publicaciones sean reales y respetuosas.', habilidades: 'moderación, comunidad', whatsapp: '', emailContacto: 'admin@oportunia.demo', esAdmin: true, demo: true },
  { nombre: 'María Fernanda López', email: 'maria@demo.com', pass: 'demo123', pais: 'Colombia', ciudad: 'Bogotá', bio: 'Emprendedora. Tengo una repostería casera y busco crecer en línea.', habilidades: 'repostería, ventas, redes sociales', whatsapp: '573000000001', emailContacto: 'maria@demo.com', esAdmin: false, demo: true },
  { nombre: 'Diego Ramírez', email: 'diego@demo.com', pass: 'demo123', pais: 'Argentina', ciudad: 'Buenos Aires', bio: 'Diseñador gráfico freelance. Ayudo a marcas pequeñas a verse profesionales.', habilidades: 'diseño gráfico, branding, ilustración', whatsapp: '5491100000002', emailContacto: 'diego@demo.com', esAdmin: false, demo: true },
  { nombre: 'Lucía Fernández', email: 'lucia@demo.com', pass: 'demo123', pais: 'España', ciudad: 'Madrid', bio: 'Profesora de inglés. Me encantan las ideas de negocio con impacto real.', habilidades: 'inglés, enseñanza, traducción', whatsapp: '346000000003', emailContacto: 'lucia@demo.com', esAdmin: false, demo: true },
  { nombre: 'Carlos Mendoza', email: 'carlos@demo.com', pass: 'demo123', pais: 'México', ciudad: 'Guadalajara', bio: 'Técnico en celulares. Reparo a domicilio y busco clientes constantes.', habilidades: 'reparación de celulares, ventas', whatsapp: '523300000004', emailContacto: 'carlos@demo.com', esAdmin: false, demo: true },
  { nombre: 'Valentina Torres', email: 'valentina@demo.com', pass: 'demo123', pais: 'Perú', ciudad: 'Lima', bio: 'Marketer digital. Conecto marcas con clientes en toda Latinoamérica.', habilidades: 'marketing digital, publicidad, ventas', whatsapp: '519000000005', emailContacto: 'valentina@demo.com', esAdmin: false, demo: true }
];
var SEED_POSTS = [
  { autor: 'maria@demo.com', tipo: 'oportunidad', categoria: 'ventas', titulo: 'Se busca repartidor con moto para negocio de comida', descripcion: 'Mi repostería casera creció y necesito una persona con moto para entregar pedidos en Bogotá. Pagos semanales, horario flexible y propinas. Ideal para alguien que busca ingresos extra sin horarios fijos.', pais: 'Colombia', ciudad: 'Bogotá', presupuesto: '$800.000 COP/semana aprox.', contactoPreferido: 'whatsapp', whatsapp: '573000000001', emailContacto: 'maria@demo.com' },
  { autor: 'diego@demo.com', tipo: 'servicio', categoria: 'diseño', titulo: 'Diseño de logotipos y marca para emprendedores', descripcion: 'Diseño logotipos, paletas de colores y plantillas para redes. Trabajo 100% en línea para cualquier país. Entrega en 5 días, con 2 rondas de cambios. Si estás empezando tu marca, escríbeme y armamos algo que se vea profesional sin gastar de más.', pais: 'Argentina', ciudad: 'Buenos Aires', presupuesto: 'Desde $60 USD', contactoPreferido: 'mensaje', whatsapp: '5491100000002', emailContacto: 'diego@demo.com' },
  { autor: 'maria@demo.com', tipo: 'necesidad', categoria: 'tecnología', titulo: 'Necesito alguien que me ayude a crear mi tienda en línea', descripcion: 'Quiero vender mis postres por internet pero no sé por dónde empezar: tienda, pagos y envíos. Busco a alguien que me arme la tienda y me enseñe a manejarla. Presupuesto limitado, pero pago puntual.', pais: 'Colombia', ciudad: 'Bogotá', presupuesto: 'A convenir', contactoPreferido: 'mensaje', whatsapp: '573000000001', emailContacto: 'maria@demo.com' },
  { autor: 'lucia@demo.com', tipo: 'idea', categoria: 'tecnología', titulo: 'Idea: app para rentar herramientas entre vecinos', descripcion: 'Taladros, escaleras y sierras que casi nadie usa todos los días. Una app donde vecinos renten herramientas por día, con depósito y reseñas. Busco un socio técnico para validar la idea y armar el primer prototipo.', pais: 'España', ciudad: 'Madrid', presupuesto: 'Sociedad / a convenir', contactoPreferido: 'mensaje', whatsapp: '346000000003', emailContacto: 'lucia@demo.com' },
  { autor: 'valentina@demo.com', tipo: 'oportunidad', categoria: 'comida', titulo: 'Vende jugos naturales: inversión baja, ganancias semanales', descripcion: 'Oportunidad para emprender vendiendo jugos naturales en tu zona. Yo te conecto con el proveedor, te doy recetas y materiales de venta. No necesitas experiencia, solo ganas de trabajar y un punto con tránsito de gente.', pais: 'Perú', ciudad: 'Lima', presupuesto: 'Inversión desde $300 PEN', contactoPreferido: 'whatsapp', whatsapp: '519000000005', emailContacto: 'valentina@demo.com' },
  { autor: 'carlos@demo.com', tipo: 'servicio', categoria: 'tecnología', titulo: 'Reparo celulares a domicilio, el mismo día', descripcion: 'Cambio de pantalla, batería y centros de carga para la mayoría de marcas. Voy a tu casa u oficina en Guadalajara, con garantía de 30 días. Cotización sin costo por mensaje.', pais: 'México', ciudad: 'Guadalajara', presupuesto: 'Desde $400 MXN', contactoPreferido: 'whatsapp', whatsapp: '523300000004', emailContacto: 'carlos@demo.com' },
  { autor: 'valentina@demo.com', tipo: 'necesidad', categoria: 'ventas', titulo: 'Busco socio con camión para distribuir productos en Texas', descripcion: 'Tengo productos de belleza listos para distribuir en Houston y necesito un socio con camión y licencia vigente. Repartimos ganancias 50/50. Seriedad y referencias, por favor.', pais: 'Estados Unidos', ciudad: 'Houston', presupuesto: 'Ganancias compartidas', contactoPreferido: 'mensaje', whatsapp: '519000000005', emailContacto: 'valentina@demo.com' },
  { autor: 'maria@demo.com', tipo: 'idea', categoria: 'comida', titulo: 'Club de cocina a domicilio para oficinistas', descripcion: 'Cocina casera entregada en oficinas a la hora del almuerzo, con menú semanal y suscripción. Busco a alguien con experiencia en logística de entregas para lanzar el piloto en Medellín.', pais: 'Colombia', ciudad: 'Medellín', presupuesto: 'Sociedad / a convenir', contactoPreferido: 'mensaje', whatsapp: '573000000001', emailContacto: 'maria@demo.com' },
  { autor: 'lucia@demo.com', tipo: 'servicio', categoria: 'educación', titulo: 'Clases de inglés conversacional en línea, primera clase gratis', descripcion: 'Clases de 45 minutos por videollamada, enfocadas en hablar desde la primera sesión. Para cualquier nivel y cualquier país. Agenda tu clase de prueba sin costo y decide después.', pais: 'España', ciudad: 'Madrid', presupuesto: '$15 USD/clase', contactoPreferido: 'mensaje', whatsapp: '346000000003', emailContacto: 'lucia@demo.com' }
];

/* ============================================================================
   ADAPTADOR DE DATOS — `store`
   Todas las lecturas/escrituras de la app pasan por aquí. Si hay cliente
   Supabase configurado, usa las tablas; si no, localStorage del navegador.
   ========================================================================== */
var LS = { users: 'op_users', posts: 'op_posts', favs: 'op_favs', reqs: 'op_requests', session: 'op_session', seeded: 'op_seeded_v1' };
function lsGet(key, fallback) {
  try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* almacenamiento lleno/bloqueado */ } }

async function seedLocal() {
  if (lsGet(LS.seeded, false)) { return; }
  var users = [];
  for (var i = 0; i < SEED_USERS.length; i++) {
    var s = SEED_USERS[i];
    users.push({
      id: uid(), nombre: s.nombre, email: s.email, passHash: await hashPassword(s.pass),
      pais: s.pais, ciudad: s.ciudad, bio: s.bio, habilidades: s.habilidades,
      whatsapp: s.whatsapp, emailContacto: s.emailContacto,
      esAdmin: !!s.esAdmin, demo: true, createdAt: new Date().toISOString()
    });
  }
  var byEmail = {};
  users.forEach(function (u) { byEmail[u.email] = u; });
  var posts = SEED_POSTS.map(function (p) {
    var a = byEmail[p.autor];
    return {
      id: uid(), autorId: a.id, autorNombre: a.nombre, tipo: p.tipo, categoria: p.categoria,
      titulo: p.titulo, descripcion: p.descripcion, pais: p.pais, ciudad: p.ciudad,
      presupuesto: p.presupuesto, contactoPreferido: p.contactoPreferido,
      whatsapp: p.whatsapp, emailContacto: p.emailContacto,
      destacada: false, oculta: false, esDemo: true, createdAt: new Date().toISOString()
    };
  });
  lsSet(LS.users, users);
  lsSet(LS.posts, posts);
  lsSet(LS.favs, {});
  lsSet(LS.reqs, []);
  lsSet(LS.seeded, true);
}
function resetLocalDemo() {
  [LS.users, LS.posts, LS.favs, LS.reqs, LS.session, LS.seeded].forEach(function (k) {
    try { localStorage.removeItem(k); } catch (e) {}
  });
}

/* Mapeo fila Supabase <-> forma local */
function rowToPost(r) {
  return {
    id: r.id, autorId: r.autor_id, autorNombre: r.autor_nombre, tipo: r.tipo,
    categoria: r.categoria, titulo: r.titulo, descripcion: r.descripcion,
    pais: r.pais, ciudad: r.ciudad || '', presupuesto: r.presupuesto || '',
    contactoPreferido: r.contacto_preferido || 'mensaje', whatsapp: r.whatsapp || '',
    emailContacto: r.email_contacto || '', destacada: !!r.destacada,
    oculta: !!r.oculta, esDemo: !!r.es_demo, createdAt: r.created_at
  };
}
function postToRow(p) {
  return {
    autor_id: p.autorId, autor_nombre: p.autorNombre, tipo: p.tipo, categoria: p.categoria,
    titulo: p.titulo, descripcion: p.descripcion, pais: p.pais, ciudad: p.ciudad,
    presupuesto: p.presupuesto, contacto_preferido: p.contactoPreferido,
    whatsapp: p.whatsapp, email_contacto: p.emailContacto,
    destacada: !!p.destacada, oculta: !!p.oculta, es_demo: !!p.esDemo
  };
}
function rowToUser(r, email) {
  return {
    id: r.id, nombre: r.nombre, email: email || '', pais: r.pais || '', ciudad: r.ciudad || '',
    bio: r.bio || '', habilidades: r.habilidades || '', whatsapp: r.whatsapp || '',
    emailContacto: r.email_contacto || '', esAdmin: !!r.es_admin, demo: false,
    createdAt: r.created_at
  };
}
function rowToRequest(r) {
  return {
    id: r.id, publicacionId: r.publicacion_id, publicacionTitulo: r.publicacion_titulo,
    autorId: r.autor_id, remitenteId: r.remitente_id, remitenteNombre: r.remitente_nombre,
    remitenteContacto: r.remitente_contacto || '', tipo: r.tipo, mensaje: r.mensaje,
    estado: r.estado, createdAt: r.created_at
  };
}

var store = {
  /* --- Publicaciones --- */
  async listPosts(includeHidden) {
    if (sb) {
      var q = sb.from('publicaciones').select('*').order('created_at', { ascending: false });
      if (!includeHidden) { q = q.eq('oculta', false); }
      var res = await q;
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return (res.data || []).map(rowToPost);
    }
    await seedLocal();
    var posts = lsGet(LS.posts, []);
    posts.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return includeHidden ? posts : posts.filter(function (p) { return !p.oculta; });
  },
  async getPost(id) {
    if (sb) {
      var res = await sb.from('publicaciones').select('*').eq('id', id).maybeSingle();
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return res.data ? rowToPost(res.data) : null;
    }
    await seedLocal();
    var found = lsGet(LS.posts, []).filter(function (p) { return p.id === id; })[0];
    return found || null;
  },
  async createPost(data) {
    if (sb) {
      var res = await sb.from('publicaciones').insert(postToRow(data)).select('*').single();
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return rowToPost(res.data);
    }
    var posts = lsGet(LS.posts, []);
    var post = Object.assign({ id: uid(), destacada: false, oculta: false, esDemo: false, createdAt: new Date().toISOString() }, data);
    posts.unshift(post);
    lsSet(LS.posts, posts);
    return post;
  },
  async updatePost(id, patch) {
    if (sb) {
      var rowPatch = {};
      var map = { autorNombre: 'autor_nombre', tipo: 'tipo', categoria: 'categoria', titulo: 'titulo', descripcion: 'descripcion', pais: 'pais', ciudad: 'ciudad', presupuesto: 'presupuesto', contactoPreferido: 'contacto_preferido', whatsapp: 'whatsapp', emailContacto: 'email_contacto', destacada: 'destacada', oculta: 'oculta' };
      Object.keys(patch).forEach(function (k) { if (map[k]) { rowPatch[map[k]] = patch[k]; } });
      var res = await sb.from('publicaciones').update(rowPatch).eq('id', id).select('*').single();
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return rowToPost(res.data);
    }
    var posts = lsGet(LS.posts, []);
    var idx = posts.findIndex(function (p) { return p.id === id; });
    if (idx < 0) { return null; }
    posts[idx] = Object.assign({}, posts[idx], patch);
    lsSet(LS.posts, posts);
    return posts[idx];
  },
  async deletePost(id) {
    if (sb) {
      var res = await sb.from('publicaciones').delete().eq('id', id);
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return true;
    }
    lsSet(LS.posts, lsGet(LS.posts, []).filter(function (p) { return p.id !== id; }));
    var favs = lsGet(LS.favs, {});
    Object.keys(favs).forEach(function (u) { favs[u] = favs[u].filter(function (pid) { return pid !== id; }); });
    lsSet(LS.favs, favs);
    return true;
  },
  /* --- Usuarios / perfiles --- */
  async listUsers() {
    if (sb) {
      var res = await sb.from('perfiles').select('*').order('created_at', { ascending: true });
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return (res.data || []).map(function (r) { return rowToUser(r, ''); });
    }
    await seedLocal();
    return lsGet(LS.users, []).map(function (u) {
      var c = Object.assign({}, u); delete c.passHash; return c;
    });
  },
  async getUserPublic(id) {
    if (sb) {
      var res = await sb.from('perfiles').select('*').eq('id', id).maybeSingle();
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return res.data ? rowToUser(res.data, '') : null;
    }
    await seedLocal();
    var u = lsGet(LS.users, []).filter(function (x) { return x.id === id; })[0];
    if (!u) { return null; }
    var c = Object.assign({}, u); delete c.passHash; return c;
  },
  async saveProfile(userId, patch) {
    if (sb) {
      var rowPatch = { nombre: patch.nombre, pais: patch.pais, ciudad: patch.ciudad, bio: patch.bio, habilidades: patch.habilidades, whatsapp: patch.whatsapp, email_contacto: patch.emailContacto };
      var res = await sb.from('perfiles').update(rowPatch).eq('id', userId).select('*').single();
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return rowToUser(res.data, '');
    }
    var users = lsGet(LS.users, []);
    var idx = users.findIndex(function (u) { return u.id === userId; });
    if (idx < 0) { return null; }
    users[idx] = Object.assign({}, users[idx], patch);
    lsSet(LS.users, users);
    var c = Object.assign({}, users[idx]); delete c.passHash; return c;
  },
  /* --- Favoritos --- */
  async listFavorites(userId) {
    if (sb) {
      var res = await sb.from('favoritos').select('publicacion_id').eq('usuario_id', userId);
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return (res.data || []).map(function (r) { return r.publicacion_id; });
    }
    return (lsGet(LS.favs, {})[userId] || []).slice();
  },
  async toggleFavorite(userId, postId) {
    if (sb) {
      var chk = await sb.from('favoritos').select('id').eq('usuario_id', userId).eq('publicacion_id', postId).maybeSingle();
      if (chk.error) { throw new Error('Supabase: ' + chk.error.message); }
      if (chk.data) {
        var del = await sb.from('favoritos').delete().eq('id', chk.data.id);
        if (del.error) { throw new Error('Supabase: ' + del.error.message); }
        return false;
      }
      var ins = await sb.from('favoritos').insert({ usuario_id: userId, publicacion_id: postId });
      if (ins.error) { throw new Error('Supabase: ' + ins.error.message); }
      return true;
    }
    var favs = lsGet(LS.favs, {});
    var list = favs[userId] || [];
    var at = list.indexOf(postId);
    if (at >= 0) { list.splice(at, 1); } else { list.push(postId); }
    favs[userId] = list;
    lsSet(LS.favs, favs);
    return at < 0;
  },
  /* --- Solicitudes --- */
  async createRequest(data) {
    if (sb) {
      var res = await sb.from('solicitudes').insert({
        publicacion_id: data.publicacionId, publicacion_titulo: data.publicacionTitulo,
        autor_id: data.autorId, remitente_id: data.remitenteId,
        remitente_nombre: data.remitenteNombre, remitente_contacto: data.remitenteContacto,
        tipo: data.tipo, mensaje: data.mensaje, estado: 'pendiente'
      }).select('*').single();
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return rowToRequest(res.data);
    }
    var reqs = lsGet(LS.reqs, []);
    var req = Object.assign({ id: uid(), estado: 'pendiente', createdAt: new Date().toISOString() }, data);
    reqs.unshift(req);
    lsSet(LS.reqs, reqs);
    return req;
  },
  async listRequestsForUser(userId) {
    if (sb) {
      var res = await sb.from('solicitudes').select('*')
        .or('autor_id.eq.' + userId + ',remitente_id.eq.' + userId)
        .order('created_at', { ascending: false });
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return (res.data || []).map(rowToRequest);
    }
    var reqs = lsGet(LS.reqs, []).filter(function (r) { return r.autorId === userId || r.remitenteId === userId; });
    reqs.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return reqs;
  },
  async updateRequestStatus(id, estado) {
    if (sb) {
      var res = await sb.from('solicitudes').update({ estado: estado }).eq('id', id).select('*').single();
      if (res.error) { throw new Error('Supabase: ' + res.error.message); }
      return rowToRequest(res.data);
    }
    var reqs = lsGet(LS.reqs, []);
    var idx = reqs.findIndex(function (r) { return r.id === id; });
    if (idx < 0) { return null; }
    reqs[idx].estado = estado;
    lsSet(LS.reqs, reqs);
    return reqs[idx];
  }
};

/* ---------------- Autenticación ---------------- */
var auth = {
  async currentUser() {
    if (sb) {
      var s = await sb.auth.getSession();
      var sessUser = s.data && s.data.session && s.data.session.user;
      if (!sessUser) { return null; }
      var prof = await sb.from('perfiles').select('*').eq('id', sessUser.id).maybeSingle();
      if (prof.data) { return rowToUser(prof.data, sessUser.email); }
      return { id: sessUser.id, nombre: (sessUser.email || '').split('@')[0], email: sessUser.email || '', pais: '', ciudad: '', bio: '', habilidades: '', whatsapp: '', emailContacto: '', esAdmin: false, demo: false, createdAt: '' };
    }
    await seedLocal();
    var sid = lsGet(LS.session, null);
    if (!sid) { return null; }
    var u = lsGet(LS.users, []).filter(function (x) { return x.id === sid; })[0];
    if (!u) { return null; }
    var c = Object.assign({}, u); delete c.passHash; return c;
  },
  async register(nombre, email, pass, pais, ciudad) {
    email = String(email).trim().toLowerCase();
    if (sb) {
      var res = await sb.auth.signUp({ email: email, password: pass });
      if (res.error) { throw new Error(res.error.message); }
      var nu = res.data && res.data.user;
      if (!nu) { throw new Error('No se pudo crear la cuenta. Revisa el correo de confirmación si Supabase lo exige.'); }
      var ins = await sb.from('perfiles').insert({ id: nu.id, nombre: nombre, pais: pais || '', ciudad: ciudad || '', es_admin: false });
      if (ins.error) { throw new Error('Cuenta creada, pero el perfil falló: ' + ins.error.message); }
      return auth.currentUser();
    }
    await seedLocal();
    var users = lsGet(LS.users, []);
    if (users.some(function (u) { return u.email === email; })) {
      throw new Error('Ese correo ya está registrado. Inicia sesión.');
    }
    var nu2 = {
      id: uid(), nombre: nombre, email: email, passHash: await hashPassword(pass),
      pais: pais || '', ciudad: ciudad || '', bio: '', habilidades: '',
      whatsapp: '', emailContacto: email, esAdmin: false, demo: false,
      createdAt: new Date().toISOString()
    };
    users.push(nu2);
    lsSet(LS.users, users);
    lsSet(LS.session, nu2.id);
    var c = Object.assign({}, nu2); delete c.passHash; return c;
  },
  async login(email, pass) {
    email = String(email).trim().toLowerCase();
    if (sb) {
      var res = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (res.error) { throw new Error('Correo o contraseña incorrectos.'); }
      return auth.currentUser();
    }
    await seedLocal();
    var users = lsGet(LS.users, []);
    var u = users.filter(function (x) { return x.email === email; })[0];
    if (!u) { throw new Error('Correo o contraseña incorrectos.'); }
    var h = await hashPassword(pass);
    if (h !== u.passHash) { throw new Error('Correo o contraseña incorrectos.'); }
    lsSet(LS.session, u.id);
    var c = Object.assign({}, u); delete c.passHash; return c;
  },
  async logout() {
    if (sb) { await sb.auth.signOut(); }
    try { localStorage.removeItem(LS.session); } catch (e) {}
  }
};

/* ---------------- Estado de la sesión y UI ---------------- */
var state = { user: null, favs: [], explore: { q: '', tipo: '', categoria: '', pais: '', ciudad: '' } };

function toast(msg, kind) {
  var wrap = document.getElementById('toast-wrap');
  if (!wrap) { return; }
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3400);
  setTimeout(function () { el.remove(); }, 3800);
}
function openModal(html) {
  var root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
  root.hidden = false;
  var first = root.querySelector('button');
  if (first) { first.focus(); }
}
function closeModal() {
  var root = document.getElementById('modal-root');
  root.hidden = true;
  root.innerHTML = '';
}
function confirmDialog(title, msg, okLabel) {
  return new Promise(function (resolve) {
    openModal(
      '<h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p>' +
      '<div class="modal-actions"><button class="btn btn-danger" id="cf-ok" type="button">' + esc(okLabel || 'Sí, confirmar') + '</button>' +
      '<button class="btn btn-ghost" id="cf-no" type="button">Cancelar</button></div>'
    );
    document.getElementById('cf-ok').addEventListener('click', function () { closeModal(); resolve(true); });
    document.getElementById('cf-no').addEventListener('click', function () { closeModal(); resolve(false); });
  });
}
function paymentsModal(context) {
  openModal(
    '<h3>Pagos todavía no conectados</h3>' +
    '<p>«' + esc(context) + '» es una función de pago. Oportunia está lista para venderla, pero <strong>ningún cobro está activo</strong>: ningún pago se ha procesado ni se procesará desde este aviso.</p>' +
    '<p>Para activarla se necesita:</p>' +
    '<ul class="modal-checklist"><li>Conectar Supabase (ver README: supabase-config.js + supabase-setup.sql).</li>' +
    '<li>Elegir un proveedor de pagos compatible (Stripe, Mercado Pago o similar) y pegar su clave pública.</li>' +
    '<li>Definir precios y activar la verificación de pagos en el servidor (nunca en el navegador).</li></ul>' +
    '<p>Si ves este aviso en una versión publicada, el botón es informativo por diseño: no se cobra nada.</p>' +
    '<div class="modal-actions"><button class="btn btn-primary" id="pm-ok" type="button">Entendido</button></div>'
  );
  document.getElementById('pm-ok').addEventListener('click', closeModal);
}

function iconStar(filled) {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="' + (filled ? '#fbbf24' : 'none') + '" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 14.8 9l6 .7-4.4 4.1 1.2 5.9L12 16.7 6.4 19.7 7.6 13.8 3.2 9.7l6-.7Z"/></svg>';
}
function iconPin() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
}
function postCard(p, opts) {
  opts = opts || {};
  var isFav = state.favs.indexOf(p.id) >= 0;
  var tags = '<span class="tag tag-type-' + esc(p.tipo) + '">' + esc(TIPO_LABEL[p.tipo] || p.tipo) + '</span>'
    + '<span class="tag tag-cat">' + esc(p.categoria) + '</span>'
    + (p.esDemo ? '<span class="tag tag-demo">Contenido de demostración</span>' : '')
    + (p.destacada ? '<span class="tag tag-premium">Destacada</span>' : '')
    + (p.oculta ? '<span class="tag tag-hidden">Oculta por moderación</span>' : '');
  return '<article class="card' + (opts.sponsored ? ' sponsored' : '') + '">'
    + (opts.sponsored ? '<span class="sponsored-label">Espacio patrocinado · demo</span>' : '')
    + '<div class="card-top">' + tags
    + '<button class="star-btn' + (isFav ? ' active' : '') + '" type="button" data-action="fav" data-id="' + esc(p.id) + '" aria-label="Guardar en favoritos" title="Guardar en favoritos">' + iconStar(isFav) + '</button></div>'
    + '<h3><a href="#/oportunidad/' + esc(p.id) + '">' + esc(p.titulo) + '</a></h3>'
    + '<p>' + esc(p.descripcion) + '</p>'
    + '<div class="card-meta"><span>' + iconPin() + ' ' + esc(p.pais) + (p.ciudad ? ' · ' + esc(p.ciudad) : '') + '</span><span>Por ' + esc(p.autorNombre) + '</span><span>' + esc(fmtDate(p.createdAt)) + '</span></div>'
    + (p.presupuesto ? '<div class="card-meta"><span><b style="color:var(--text)">' + esc(p.presupuesto) + '</b></span></div>' : '')
    + '<div class="card-actions"><a class="btn btn-ghost btn-sm" href="#/oportunidad/' + esc(p.id) + '">Ver detalles</a></div>'
    + '</article>';
}

function renderTopbar() {
  var box = document.getElementById('topbar-actions');
  if (!box) { return; }
  if (state.user) {
    var initial = (state.user.nombre || '?').trim().charAt(0).toUpperCase();
    box.innerHTML =
      '<a class="userchip" href="#/panel"><span class="avatar">' + esc(initial) + '</span><span>' + esc(state.user.nombre) + '</span></a>'
      + '<button class="btn btn-ghost btn-sm" type="button" data-action="logout">Salir</button>';
  } else {
    box.innerHTML =
      '<a class="btn btn-ghost btn-sm" href="#/login">Entrar</a>'
      + '<a class="btn btn-primary btn-sm" href="#/registro">Crear cuenta</a>';
  }
  var adminLink = document.getElementById('nav-admin');
  if (adminLink) { adminLink.hidden = !(state.user && state.user.esAdmin); }
}
function renderModebar() {
  var bar = document.getElementById('modebar');
  var badge = document.getElementById('mode-badge');
  var text = document.getElementById('mode-text');
  var foot = document.getElementById('footer-mode');
  if (!bar || !badge) { return; }
  bar.hidden = false;
  if (isCloudMode()) {
    badge.textContent = 'Modo Supabase';
    badge.className = 'mode-badge cloud';
    text.textContent = 'Datos reales conectados a Supabase. Lo que publiques lo ven todos los usuarios.';
    if (foot) { foot.textContent = 'Conectado a Supabase. Los datos ya no viven solo en este navegador.'; }
  } else {
    badge.textContent = 'Modo local (demo)';
    badge.className = 'mode-badge local';
    text.textContent = 'Sin Supabase: los datos viven en este navegador (localStorage). Conecta Supabase para datos reales y multiusuario — ver README.';
    if (foot) { foot.textContent = 'Modo local (demo): los datos se guardan en este navegador. Conecta Supabase para datos reales.'; }
  }
}
function setActiveNav(route) {
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    a.classList.toggle('active', a.getAttribute('data-nav') === route);
  });
}

/* ---------------- Vistas ---------------- */
function homeView(stats) {
  return '<section class="hero">'
    + '<h1>Encuentra tu próxima <span class="grad-text">oportunidad</span>.<br>Ofrece lo que sabes. Lanza tu idea.</h1>'
    + '<p class="lead">Oportunia conecta a personas que necesitan algo con personas que saben hacerlo. Publica una necesidad, ofrece una habilidad, comparte una idea de negocio o descubre cómo ganar dinero — en cualquier país.</p>'
    + '<div class="hero-ctas">'
    + '<a class="cta-card" href="#/explorar"><span class="cta-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span><strong>QUIERO ENCONTRAR UNA OPORTUNIDAD</strong><span>Explora publicaciones de todos los países y filtra por lo que buscas.</span><span class="cta-go">Explorar ahora →</span></a>'
    + '<a class="cta-card" href="#/publicar?tipo=servicio"><span class="cta-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7v6c0 4.5 3.5 7.5 8 9 4.5-1.5 8-4.5 8-9V7Z"/><path d="m9 12 2 2 4-4"/></svg></span><strong>QUIERO OFRECER ALGO</strong><span>Publica tu servicio o habilidad y deja que los clientes te encuentren.</span><span class="cta-go">Ofrecer mi servicio →</span></a>'
    + '<a class="cta-card" href="#/publicar?tipo=necesidad"><span class="cta-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg></span><strong>TENGO UNA IDEA O NECESIDAD</strong><span>Publica lo que necesitas o esa idea de negocio que no te deja dormir.</span><span class="cta-go">Publicar mi idea →</span></a>'
    + '</div>'
    + '<div class="hero-stats"><div><b>' + stats.posts + '</b>publicaciones</div><div><b>' + stats.countries + '</b>países</div><div><b>' + stats.users + '</b>usuarios</div></div>'
    + '</section>'

    + '<section class="section"><div class="section-head"><div><h2>Cómo funciona</h2><p>Tres pasos, sin complicaciones y sin intermediarios raros.</p></div></div>'
    + '<div class="howto">'
    + '<div class="card"><span class="howto-num">1</span><h3>Publica</h3><p>Describe lo que necesitas, lo que ofreces o tu idea. Elige país, ciudad y categoría en menos de un minuto.</p></div>'
    + '<div class="card"><span class="howto-num">2</span><h3>Conecta</h3><p>Otras personas te contactan por mensaje, WhatsApp o correo, o te proponen colaborar desde la misma publicación.</p></div>'
    + '<div class="card"><span class="howto-num">3</span><h3>Genera ingresos</h3><p>Cierra tratos, vende tu servicio o lanza esa idea con un socio. Tú decides con quién y en qué condiciones.</p></div>'
    + '</div></section>'

    + '<section class="section"><div class="section-head"><div><h2>Oportunidades destacadas</h2><p>Una muestra de lo que la comunidad está publicando. Todas las de demostración están marcadas.</p></div><a class="btn btn-ghost" href="#/explorar">Ver todas →</a></div>'
    + '<div class="grid" id="home-featured">' + stats.featured.map(function (p) { return postCard(p); }).join('') + '</div></section>'

    + '<section class="section"><div class="section-head"><div><h2>¿Quieres más visibilidad?</h2><p>Destaca tus publicaciones y accede a funciones profesionales. Sin letra chica: los pagos aún no están conectados.</p></div><a class="btn btn-primary" href="#/planes">Ver planes</a></div></section>';
}

var exploreCache = [];
function filtersView() {
  var s = state.explore;
  function opts(list, cur, allLabel) {
    var h = '<option value="">' + allLabel + '</option>';
    list.forEach(function (v) { h += '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v.charAt(0).toUpperCase() + v.slice(1)) + '</option>'; });
    return h;
  }
  return '<form class="filters" id="filters" novalidate>'
    + '<input type="search" name="q" placeholder="Buscar: reparaciones, diseño, socio…" value="' + esc(s.q) + '" aria-label="Buscar texto">'
    + '<select name="tipo" aria-label="Filtrar por tipo">' + opts(TIPOS, s.tipo, 'Todos los tipos') + '</select>'
    + '<select name="categoria" aria-label="Filtrar por categoría">' + opts(CATEGORIAS, s.categoria, 'Todas las categorías') + '</select>'
    + '<select name="pais" aria-label="Filtrar por país">' + opts(PAISES, s.pais, 'Todos los países') + '</select>'
    + '<input type="text" name="ciudad" placeholder="Ciudad (opcional)" value="' + esc(s.ciudad) + '" aria-label="Filtrar por ciudad">'
    + '</form>';
}
function applyExploreFilters(posts) {
  var s = state.explore;
  var q = s.q.trim().toLowerCase();
  return posts.filter(function (p) {
    if (s.tipo && p.tipo !== s.tipo) { return false; }
    if (s.categoria && p.categoria !== s.categoria) { return false; }
    if (s.pais && p.pais !== s.pais) { return false; }
    if (s.ciudad && (p.ciudad || '').toLowerCase().indexOf(s.ciudad.trim().toLowerCase()) < 0) { return false; }
    if (q) {
      var hay = (p.titulo + ' ' + p.descripcion + ' ' + p.categoria + ' ' + p.pais + ' ' + (p.ciudad || '') + ' ' + p.autorNombre).toLowerCase();
      if (hay.indexOf(q) < 0) { return false; }
    }
    return true;
  });
}
function resultsHtml(posts) {
  if (!posts.length) {
    return '<div class="empty"><strong>No encontramos nada con esos filtros</strong>Prueba con otra palabra, quita un filtro o publica tú la oportunidad que falta.<div class="mt"><a class="btn btn-primary btn-sm" href="#/publicar">Publicar una oportunidad</a> <button class="btn btn-ghost btn-sm" type="button" data-action="clear-filters">Limpiar filtros</button></div></div>';
  }
  var sponsored = posts.filter(function (p) { return p.destacada; })[0];
  var rest = posts.filter(function (p) { return !p.destacada; });
  var h = '';
  if (sponsored) { h += postCard(sponsored, { sponsored: true }); }
  h += rest.map(function (p) { return postCard(p); }).join('');
  return h;
}
function exploreView() {
  return '<h1>Explorar oportunidades</h1>'
    + '<p class="lead">Busca por palabra, tipo, categoría, país o ciudad. Todo lo marcado como demostración es contenido de ejemplo para que veas cómo funciona.</p>'
    + '<div class="section">' + filtersView() + '<p class="small muted" id="results-count"></p><div class="grid" id="results"></div></div>';
}
function updateResults() {
  var box = document.getElementById('results');
  if (!box) { return; }
  var list = applyExploreFilters(exploreCache);
  box.innerHTML = resultsHtml(list);
  var c = document.getElementById('results-count');
  if (c) { c.textContent = list.length + (list.length === 1 ? ' publicación encontrada' : ' publicaciones encontradas'); }
}

function detailView(p, owner, isFav) {
  var mine = state.user && state.user.id === p.autorId;
  var contactBtns = '';
  if (p.whatsapp) {
    contactBtns += '<a class="btn btn-success btn-block" href="https://wa.me/' + esc(p.whatsapp.replace(/[^0-9]/g, '')) + '?text=' + encodeURIComponent('Hola, vi tu publicación en Oportunia: ' + p.titulo) + '" target="_blank" rel="noopener">WhatsApp directo</a>';
  }
  if (p.emailContacto) {
    contactBtns += '<a class="btn btn-ghost btn-block" href="mailto:' + esc(p.emailContacto) + '?subject=' + encodeURIComponent('Oportunia: ' + p.titulo) + '">Escribir por correo</a>';
  }
  var contactForm = '';
  if (!mine) {
    if (state.user) {
      contactForm = '<form id="contact-form" data-id="' + esc(p.id) + '" novalidate>'
        + '<div class="form-error" id="contact-error" role="alert"></div>'
        + '<div class="field"><label for="cf-tipo">¿Qué quieres hacer?</label>'
        + '<select id="cf-tipo" name="tipo"><option value="contacto">Solo contactar</option><option value="colaboracion">Proponer colaboración</option></select></div>'
        + '<div class="field"><label for="cf-msg">Tu mensaje</label>'
        + '<textarea id="cf-msg" name="mensaje" required minlength="10" maxlength="1000" placeholder="Hola, me interesa tu publicación porque…"></textarea>'
        + '<div class="field-error" id="err-cf-msg">Escribe un mensaje de al menos 10 caracteres.</div></div>'
        + '<div class="field"><label for="cf-contacto">Tu contacto (cómo te puede responder) <span class="hint">— se muestra al dueño de la publicación</span></label>'
        + '<input id="cf-contacto" name="contacto" type="text" maxlength="120" placeholder="WhatsApp, correo o usuario" required>'
        + '<div class="field-error" id="err-cf-contacto">Indica cómo te pueden contactar.</div></div>'
        + '<button class="btn btn-primary btn-block" type="submit">Enviar mensaje</button>'
        + '<p class="small muted center mt">El mensaje queda guardado y el dueño lo ve en su panel. Si el dueño compartió WhatsApp o correo, también puedes escribirle directo.</p>'
        + '</form>';
    } else {
      contactForm = '<div class="empty"><strong>Entra para contactar</strong>Necesitas una cuenta para enviar mensajes y propuestas.<div class="mt"><a class="btn btn-primary btn-sm" href="#/login?next=' + encodeURIComponent('#/oportunidad/' + p.id) + '">Entrar o crear cuenta</a></div></div>';
    }
  }
  return '<p><a href="#/explorar">← Volver a explorar</a></p>'
    + '<div class="detail"><div class="detail-main">'
    + '<div class="card-top"><span class="tag tag-type-' + esc(p.tipo) + '">' + esc(TIPO_LABEL[p.tipo] || p.tipo) + '</span><span class="tag tag-cat">' + esc(p.categoria) + '</span>'
    + (p.esDemo ? '<span class="tag tag-demo">Contenido de demostración</span>' : '')
    + (p.destacada ? '<span class="tag tag-premium">Destacada</span>' : '')
    + (p.oculta ? '<span class="tag tag-hidden">Oculta por moderación</span>' : '') + '</div>'
    + '<h1>' + esc(p.titulo) + '</h1>'
    + '<p class="muted">' + iconPin() + ' ' + esc(p.pais) + (p.ciudad ? ' · ' + esc(p.ciudad) : '') + ' &nbsp;·&nbsp; Publicado ' + esc(fmtDate(p.createdAt)) + ' por ' + esc(p.autorNombre) + '</p>'
    + '<p class="detail-desc">' + esc(p.descripcion) + '</p>'
    + (p.presupuesto ? '<p><b>Presupuesto / rango:</b> ' + esc(p.presupuesto) + '</p>' : '')
    + (mine ? '<div class="card-actions"><a class="btn btn-primary btn-sm" href="#/editar/' + esc(p.id) + '">Editar publicación</a>'
      + '<button class="btn btn-ghost btn-sm" type="button" data-action="feature-post" data-id="' + esc(p.id) + '">Destacar (pago)</button>'
      + '<button class="btn btn-danger btn-sm" type="button" data-action="delete-post" data-id="' + esc(p.id) + '">Eliminar</button></div>' : '')
    + '</div>'
    + '<aside class="detail-side">'
    + '<div class="side-card"><h3>Publicado por</h3>'
    + '<div style="display:flex;gap:12px;align-items:center"><span class="avatar avatar-lg">' + esc((p.autorNombre || '?').trim().charAt(0).toUpperCase()) + '</span><div><b>' + esc(p.autorNombre) + '</b><br><span class="muted small">' + esc(p.pais) + (p.ciudad ? ' · ' + esc(p.ciudad) : '') + '</span></div></div>'
    + (owner && owner.bio ? '<p class="muted" style="margin:12px 0 0">' + esc(owner.bio) + '</p>' : '')
    + (owner && owner.habilidades ? '<p class="small" style="margin:8px 0 0"><b>Habilidades:</b> ' + esc(owner.habilidades) + '</p>' : '')
    + '</div>'
    + '<div class="side-card"><h3>Contacto</h3>'
    + '<button class="btn ' + (isFav ? 'btn-primary' : 'btn-ghost') + ' btn-block" type="button" data-action="fav" data-id="' + esc(p.id) + '">' + iconStar(isFav) + ' ' + (isFav ? 'En tus favoritos' : 'Guardar en favoritos') + '</button>'
    + '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">' + contactBtns + '</div>'
    + '<div class="mt">' + contactForm + '</div>'
    + '</div>'
    + '<div class="side-card"><h3>Comparte</h3><p class="muted small">Copia el enlace de esta publicación y compártelo donde quieras.</p><button class="btn btn-ghost btn-block btn-sm" type="button" data-action="copy-link" data-id="' + esc(p.id) + '">Copiar enlace</button></div>'
    + '</aside></div>';
}

/* ---------------- Publicar / editar ---------------- */
function postFormView(presetTipo, post) {
  var isEdit = !!post;
  var tipo = post ? post.tipo : (presetTipo || 'oportunidad');
  var chips = TIPOS.map(function (t) {
    return '<button type="button" class="preset' + (tipo === t ? ' active' : '') + '" data-action="preset" data-tipo="' + t + '">' + esc(TIPO_LABEL[t]) + '</button>';
  }).join('');
  function sel(list, cur) {
    return list.map(function (v) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v.charAt(0).toUpperCase() + v.slice(1)) + '</option>'; }).join('');
  }
  var p = post || {};
  return '<h1 class="center">' + (isEdit ? 'Editar publicación' : 'Publicar en Oportunia') + '</h1>'
    + '<p class="lead center" style="margin:0 auto 26px">' + (isEdit ? 'Actualiza tu publicación. Los cambios se ven de inmediato.' : 'Cuéntalo claro: qué necesitas, qué ofreces o cuál es tu idea. Mientras más concreto, más respuestas reales.') + '</p>'
    + '<form class="form-card wide" id="post-form" data-id="' + esc(p.id || '') + '" novalidate>'
    + '<div class="form-error" id="post-error" role="alert"></div>'
    + '<div class="field"><label>Tipo de publicación</label><div class="preset-row" id="preset-row">' + chips + '</div>'
    + '<input type="hidden" id="pf-tipo" name="tipo" value="' + esc(tipo) + '"></div>'
    + '<div class="form-row">'
    + '<div class="field"><label for="pf-categoria">Categoría</label><select id="pf-categoria" name="categoria" required><option value="">Elige una categoría</option>' + sel(CATEGORIAS, p.categoria || '') + '</select><div class="field-error" id="err-pf-categoria">Elige una categoría.</div></div>'
    + '<div class="field"><label for="pf-pais">País</label><select id="pf-pais" name="pais" required><option value="">Elige un país</option>' + sel(PAISES, p.pais || '') + '</select><div class="field-error" id="err-pf-pais">Elige un país.</div></div>'
    + '</div>'
    + '<div class="field"><label for="pf-titulo">Título</label><input id="pf-titulo" name="titulo" type="text" maxlength="110" required placeholder="Ej.: Busco socio para vender postres en Bogotá" value="' + esc(p.titulo || '') + '"><div class="field-error" id="err-pf-titulo">El título debe tener al menos 10 caracteres.</div></div>'
    + '<div class="field"><label for="pf-descripcion">Descripción</label><textarea id="pf-descripcion" name="descripcion" maxlength="2000" required placeholder="Explica qué necesitas u ofreces, en qué ciudad, qué presupuesto manejas y cómo quieres que te contacten.">' + esc(p.descripcion || '') + '</textarea><div class="field-error" id="err-pf-descripcion">La descripción debe tener al menos 30 caracteres.</div></div>'
    + '<div class="form-row">'
    + '<div class="field"><label for="pf-ciudad">Ciudad <span class="hint">(opcional)</span></label><input id="pf-ciudad" name="ciudad" type="text" maxlength="80" placeholder="Ej.: Medellín" value="' + esc(p.ciudad || '') + '"></div>'
    + '<div class="field"><label for="pf-presupuesto">Presupuesto o rango <span class="hint">(opcional)</span></label><input id="pf-presupuesto" name="presupuesto" type="text" maxlength="80" placeholder="Ej.: $500 USD, a convenir, sociedad" value="' + esc(p.presupuesto || '') + '"></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="field"><label for="pf-contacto">¿Cómo prefieres que te contacten?</label><select id="pf-contacto" name="contactoPreferido"><option value="mensaje"' + (p.contactoPreferido === 'mensaje' ? ' selected' : '') + '>Mensaje dentro de Oportunia</option><option value="whatsapp"' + (p.contactoPreferido === 'whatsapp' ? ' selected' : '') + '>WhatsApp</option><option value="correo"' + (p.contactoPreferido === 'correo' ? ' selected' : '') + '>Correo</option></select></div>'
    + '<div class="field"><label for="pf-whatsapp">WhatsApp <span class="hint">(opcional, con código de país)</span></label><input id="pf-whatsapp" name="whatsapp" type="tel" maxlength="20" placeholder="Ej.: 5215500000000" value="' + esc(p.whatsapp || '') + '"></div>'
    + '</div>'
    + '<div class="field"><label for="pf-email">Correo de contacto <span class="hint">(opcional, visible en la publicación)</span></label><input id="pf-email" name="emailContacto" type="email" maxlength="120" placeholder="tu@correo.com" value="' + esc(p.emailContacto || '') + '"><div class="field-error" id="err-pf-email">Ese correo no parece válido.</div></div>'
    + '<button class="btn btn-primary btn-block" type="submit">' + (isEdit ? 'Guardar cambios' : 'Publicar ahora') + '</button>'
    + '<p class="small muted center mt">Al publicar aceptas que tu publicación sea visible para cualquier visitante. No publiques datos sensibles como contraseñas o números de cuenta.</p>'
    + '</form>';
}

/* ---------------- Panel personal ---------------- */
function panelView(tab, data) {
  var tabs = [['resumen', 'Resumen'], ['publicaciones', 'Mis publicaciones'], ['favoritos', 'Favoritos'], ['solicitudes', 'Solicitudes'], ['perfil', 'Mi perfil']];
  var nav = '<div class="tabs">' + tabs.map(function (t) {
    return '<a class="tab' + (tab === t[0] ? ' active' : '') + '" href="#/panel?tab=' + t[0] + '">' + t[1] + '</a>';
  }).join('') + '</div>';
  var h = '<h1>Mi panel</h1><p class="lead">Gestiona tus publicaciones, favoritos, solicitudes y tu perfil.</p>' + nav;
  if (tab === 'resumen') {
    h += '<div class="stat-cards">'
      + '<div class="stat"><b>' + data.myPosts.length + '</b><span>publicaciones</span></div>'
      + '<div class="stat"><b>' + data.favs.length + '</b><span>favoritos</span></div>'
      + '<div class="stat"><b>' + data.received.length + '</b><span>solicitudes recibidas</span></div>'
      + '<div class="stat"><b>' + data.sent.length + '</b><span>solicitudes enviadas</span></div></div>'
      + '<div class="panel-grid"><div class="side-card"><div style="display:flex;gap:12px;align-items:center"><span class="avatar avatar-lg">' + esc((state.user.nombre || '?').trim().charAt(0).toUpperCase()) + '</span><div><h3 style="margin:0">' + esc(state.user.nombre) + '</h3><span class="muted small">' + esc(state.user.pais) + (state.user.ciudad ? ' · ' + esc(state.user.ciudad) : '') + '</span></div></div>'
      + (state.user.bio ? '<p class="muted mt">' + esc(state.user.bio) + '</p>' : '<p class="muted mt">Aún no tienes biografía. <a href="#/panel?tab=perfil">Complétala aquí</a>.</p>')
      + (state.user.habilidades ? '<p class="small mt"><b>Habilidades:</b> ' + esc(state.user.habilidades) + '</p>' : '')
      + '<div class="mt"><a class="btn btn-ghost btn-sm" href="#/panel?tab=perfil">Editar perfil</a></div></div>'
      + '<div><h3>Actividad reciente</h3>'
      + (data.received.slice(0, 3).map(function (r) { return requestHtml(r, true); }).join('') || '<p class="muted">Todavía no tienes solicitudes. Cuando alguien te escriba, aparecerán aquí.</p>')
      + '<div class="mt"><a class="btn btn-primary" href="#/publicar">Publicar una oportunidad</a> <a class="btn btn-ghost" href="#/explorar">Explorar</a></div></div></div>';
  }
  if (tab === 'publicaciones') {
    h += data.myPosts.length
      ? '<div class="grid">' + data.myPosts.map(function (p) {
        return postCard(p) + '';
      }).join('') + '</div>'
      : '<div class="empty"><strong>Aún no publicas nada</strong>Tu primera publicación tarda menos de un minuto.<div class="mt"><a class="btn btn-primary btn-sm" href="#/publicar">Crear mi primera publicación</a></div></div>';
    h += '<p class="small muted mt">Para editar o eliminar una publicación, abre su detalle. Para destacarla (función de pago), usa el botón «Destacar» en el detalle: los pagos aún no están conectados.</p>';
  }
  if (tab === 'favoritos') {
    h += data.favPosts.length
      ? '<div class="grid">' + data.favPosts.map(function (p) { return postCard(p); }).join('') + '</div>'
      : '<div class="empty"><strong>Sin favoritos todavía</strong>Guarda publicaciones con la estrella y aparecerán aquí.<div class="mt"><a class="btn btn-primary btn-sm" href="#/explorar">Explorar oportunidades</a></div></div>';
  }
  if (tab === 'solicitudes') {
    h += '<h3>Recibidas</h3>'
      + (data.received.map(function (r) { return requestHtml(r, true); }).join('') || '<p class="muted">Nadie te ha escrito todavía.</p>')
      + '<h3 class="mt2">Enviadas</h3>'
      + (data.sent.map(function (r) { return requestHtml(r, false); }).join('') || '<p class="muted">No has enviado solicitudes todavía.</p>');
  }
  if (tab === 'perfil') {
    h += profileFormView(state.user);
  }
  return h;
}
function requestHtml(r, isReceived) {
  var who = isReceived ? esc(r.remitenteNombre) : 'Para: ' + esc(r.publicacionTitulo);
  var statusBtns = '';
  if (isReceived && r.estado === 'pendiente') {
    statusBtns = '<span style="display:flex;gap:8px"><button class="btn btn-success btn-sm" type="button" data-action="req-status" data-id="' + esc(r.id) + '" data-status="aceptada">Aceptar</button>'
      + '<button class="btn btn-danger btn-sm" type="button" data-action="req-status" data-id="' + esc(r.id) + '" data-status="rechazada">Rechazar</button></span>';
  }
  return '<div class="req"><div class="req-head"><div><b>' + (r.tipo === 'colaboracion' ? 'Propuesta de colaboración' : 'Mensaje de contacto') + '</b> · ' + who + '</div>'
    + '<span class="status status-' + esc(r.estado) + '">' + esc(r.estado) + '</span></div>'
    + '<p><a href="#/oportunidad/' + esc(r.publicacionId) + '">' + esc(r.publicacionTitulo) + '</a></p>'
    + '<p>«' + esc(r.mensaje) + '»</p>'
    + (r.remitenteContacto ? '<p class="small">Contacto: ' + esc(r.remitenteContacto) + '</p>' : '')
    + '<p class="small muted">' + esc(fmtDate(r.createdAt)) + '</p>' + statusBtns + '</div>';
}
function profileFormView(u) {
  return '<form class="form-card" id="profile-form" novalidate>'
    + '<div class="form-ok" id="profile-ok" role="status"></div>'
    + '<div class="field"><label for="pr-nombre">Nombre</label><input id="pr-nombre" name="nombre" type="text" required minlength="2" maxlength="80" value="' + esc(u.nombre || '') + '"><div class="field-error" id="err-pr-nombre">Escribe tu nombre (mínimo 2 caracteres).</div></div>'
    + '<div class="form-row">'
    + '<div class="field"><label for="pr-pais">País</label><select id="pr-pais" name="pais"><option value="">Sin definir</option>' + PAISES.map(function (v) { return '<option value="' + esc(v) + '"' + (u.pais === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select></div>'
    + '<div class="field"><label for="pr-ciudad">Ciudad</label><input id="pr-ciudad" name="ciudad" type="text" maxlength="80" value="' + esc(u.ciudad || '') + '"></div>'
    + '</div>'
    + '<div class="field"><label for="pr-bio">Biografía <span class="hint">(opcional)</span></label><textarea id="pr-bio" name="bio" maxlength="400" placeholder="Cuéntales a los demás quién eres y qué buscas.">' + esc(u.bio || '') + '</textarea></div>'
    + '<div class="field"><label for="pr-hab">Habilidades <span class="hint">(opcional, separadas por comas)</span></label><input id="pr-hab" name="habilidades" type="text" maxlength="200" placeholder="Ej.: diseño, ventas, cocina" value="' + esc(u.habilidades || '') + '"></div>'
    + '<div class="form-row">'
    + '<div class="field"><label for="pr-wa">WhatsApp <span class="hint">(opcional)</span></label><input id="pr-wa" name="whatsapp" type="tel" maxlength="20" placeholder="Ej.: 5215500000000" value="' + esc(u.whatsapp || '') + '"></div>'
    + '<div class="field"><label for="pr-email">Correo de contacto <span class="hint">(opcional)</span></label><input id="pr-email" name="emailContacto" type="email" maxlength="120" value="' + esc(u.emailContacto || '') + '"><div class="field-error" id="err-pr-email">Ese correo no parece válido.</div></div>'
    + '</div>'
    + '<button class="btn btn-primary btn-block" type="submit">Guardar perfil</button>'
    + '</form>';
}

/* ---------------- Favoritos ---------------- */
function favoritesView(posts) {
  return '<h1>Mis favoritos</h1><p class="lead">Las publicaciones que guardaste con la estrella.</p>'
    + '<div class="section">'
    + (posts.length
      ? '<div class="grid">' + posts.map(function (p) { return postCard(p); }).join('') + '</div>'
      : '<div class="empty"><strong>Sin favoritos todavía</strong>Explora y guarda lo que te sirva con la estrella.<div class="mt"><a class="btn btn-primary btn-sm" href="#/explorar">Explorar oportunidades</a></div></div>')
    + '</div>';
}

/* ---------------- Administración ---------------- */
function adminView(posts, users) {
  return '<h1>Administración</h1><p class="lead">Modera el contenido de la plataforma. Ocultar una publicación la saca de Explorar y del detalle para los demás usuarios.</p>'
    + '<div class="stat-cards">'
    + '<div class="stat"><b>' + posts.length + '</b><span>publicaciones totales</span></div>'
    + '<div class="stat"><b>' + posts.filter(function (p) { return p.oculta; }).length + '</b><span>ocultas</span></div>'
    + '<div class="stat"><b>' + users.length + '</b><span>usuarios</span></div>'
    + '<div class="stat"><b>' + posts.filter(function (p) { return p.esDemo; }).length + '</b><span>de demostración</span></div></div>'
    + '<h2>Publicaciones</h2><div class="table-wrap"><table class="table"><thead><tr><th>Título</th><th>Tipo</th><th>País</th><th>Autor</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'
    + posts.map(function (p) {
      return '<tr><td><a href="#/oportunidad/' + esc(p.id) + '">' + esc(p.titulo) + '</a>' + (p.esDemo ? ' <span class="tag tag-demo">demo</span>' : '') + '</td><td>' + esc(TIPO_LABEL[p.tipo] || p.tipo) + '</td><td>' + esc(p.pais) + '</td><td>' + esc(p.autorNombre) + '</td>'
        + '<td>' + (p.oculta ? '<span class="status status-rechazada">Oculta</span>' : '<span class="status status-aceptada">Visible</span>') + '</td>'
        + '<td style="white-space:nowrap">' + (p.oculta
          ? '<button class="btn btn-success btn-sm" type="button" data-action="show-post" data-id="' + esc(p.id) + '">Mostrar</button>'
          : '<button class="btn btn-ghost btn-sm" type="button" data-action="hide-post" data-id="' + esc(p.id) + '">Ocultar</button>')
        + ' <button class="btn btn-danger btn-sm" type="button" data-action="delete-post" data-id="' + esc(p.id) + '">Eliminar</button></td></tr>';
    }).join('') + '</tbody></table></div>'
    + '<h2 class="mt2">Usuarios</h2><div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Correo</th><th>País / Ciudad</th><th>Rol</th></tr></thead><tbody>'
    + users.map(function (u) {
      return '<tr><td>' + esc(u.nombre) + (u.demo ? ' <span class="tag tag-demo">demo</span>' : '') + '</td><td>' + esc(u.email) + '</td><td>' + esc(u.pais || '—') + (u.ciudad ? ' · ' + esc(u.ciudad) : '') + '</td><td>' + (u.esAdmin ? '<b>Admin</b>' : 'Usuario') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ---------------- Planes ---------------- */
function plansView() {
  return '<h1 class="center">Planes y publicaciones destacadas</h1>'
    + '<p class="lead center" style="margin:0 auto 26px">Oportunia es gratis para publicar y contactar. Los planes de pago todavía no están conectados: ningún cobro se procesa. Esto es lo que incluirán cuando se activen.</p>'
    + '<div class="plan-grid">'
    + '<div class="plan"><h3>Gratis</h3><div class="price">$0</div><p class="muted">Para empezar hoy mismo.</p><ul><li>Publicaciones ilimitadas</li><li>Contacto por mensaje</li><li>Favoritos y panel personal</li></ul><a class="btn btn-ghost btn-block" href="#/registro">Crear cuenta gratis</a></div>'
    + '<div class="plan featured"><span class="tag tag-premium" style="align-self:flex-start">Recomendado</span><h3>Profesional</h3><div class="price">$9 <span class="small muted">/mes</span></div><p class="muted">Para quienes viven de sus servicios.</p><ul><li>Todo lo del plan Gratis</li><li>Publicaciones destacadas</li><li>Insignia de profesional verificado</li><li>Estadísticas de visitas</li></ul><button class="btn btn-primary btn-block" type="button" data-action="open-payments" data-context="Plan Profesional">Elegir Profesional</button></div>'
    + '<div class="plan"><h3>Negocios</h3><div class="price">$29 <span class="small muted">/mes</span></div><p class="muted">Para equipos y negocios en crecimiento.</p><ul><li>Todo lo del plan Profesional</li><li>Múltiples publicaciones destacadas</li><li>Espacio patrocinado en Explorar</li><li>Soporte prioritario</li></ul><button class="btn btn-ghost btn-block" type="button" data-action="open-payments" data-context="Plan Negocios">Elegir Negocios</button></div>'
    + '</div>'
    + '<div class="section"><h2>Publicidad y espacios patrocinados</h2><p class="lead">Los espacios patrocinados muestran contenido de demostración mientras no haya anunciantes reales. Las comisiones por transacciones futuras se activarán solo con un sistema de pagos compatible y verificado.</p></div>';
}

/* ---------------- Autenticación (vistas) ---------------- */
function loginView(next) {
  return '<h1 class="center">Entrar a Oportunia</h1><p class="lead center" style="margin:0 auto 26px">Bienvenido de nuevo. Tu sesión se guarda en este dispositivo.</p>'
    + '<form class="form-card" id="login-form" novalidate>'
    + '<div class="form-error" id="login-error" role="alert"></div>'
    + '<div class="field"><label for="li-email">Correo</label><input id="li-email" name="email" type="email" required autocomplete="email" placeholder="tu@correo.com"><div class="field-error" id="err-li-email">Escribe un correo válido.</div></div>'
    + '<div class="field"><label for="li-pass">Contraseña</label><input id="li-pass" name="pass" type="password" required minlength="6" autocomplete="current-password" placeholder="Mínimo 6 caracteres"><div class="field-error" id="err-li-pass">La contraseña debe tener al menos 6 caracteres.</div></div>'
    + '<button class="btn btn-primary btn-block" type="submit">Entrar</button>'
    + '<p class="center mt">¿No tienes cuenta? <a href="#/registro' + (next ? '?next=' + encodeURIComponent(next) : '') + '">Crea una gratis</a></p>'
    + '</form>'
    + '<div class="form-card mt" style="max-width:640px"><h3>Cuentas de demostración</h3><p class="muted small">Solo para probar en modo local. Toca una para llenar el formulario.</p>'
    + '<div class="pill-list">'
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="demo-fill" data-email="admin@oportunia.demo" data-pass="admin123">Admin demo</button>'
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="demo-fill" data-email="maria@demo.com" data-pass="demo123">María (Colombia)</button>'
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="demo-fill" data-email="diego@demo.com" data-pass="demo123">Diego (Argentina)</button>'
    + '<button class="btn btn-ghost btn-sm" type="button" data-action="demo-fill" data-email="lucia@demo.com" data-pass="demo123">Lucía (España)</button>'
    + '</div></div>';
}
function registerView(next) {
  return '<h1 class="center">Crea tu cuenta gratis</h1><p class="lead center" style="margin:0 auto 26px">Publica, contacta y colabora. Sin tarjeta, sin letra chica.</p>'
    + '<form class="form-card" id="register-form" novalidate>'
    + '<div class="form-error" id="register-error" role="alert"></div>'
    + '<div class="field"><label for="rg-nombre">Nombre completo</label><input id="rg-nombre" name="nombre" type="text" required minlength="2" maxlength="80" autocomplete="name" placeholder="Tu nombre"><div class="field-error" id="err-rg-nombre">Escribe tu nombre (mínimo 2 caracteres).</div></div>'
    + '<div class="field"><label for="rg-email">Correo</label><input id="rg-email" name="email" type="email" required autocomplete="email" placeholder="tu@correo.com"><div class="field-error" id="err-rg-email">Escribe un correo válido.</div></div>'
    + '<div class="field"><label for="rg-pass">Contraseña</label><input id="rg-pass" name="pass" type="password" required minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres"><div class="field-error" id="err-rg-pass">La contraseña debe tener al menos 6 caracteres.</div><p class="hint">En modo local tu contraseña se guarda solo como hash SHA-256, nunca en texto plano. Con Supabase la guarda su sistema de autenticación.</p></div>'
    + '<div class="form-row">'
    + '<div class="field"><label for="rg-pais">País</label><select id="rg-pais" name="pais"><option value="">Elige tu país</option>' + PAISES.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('') + '</select></div>'
    + '<div class="field"><label for="rg-ciudad">Ciudad <span class="hint">(opcional)</span></label><input id="rg-ciudad" name="ciudad" type="text" maxlength="80" placeholder="Tu ciudad"></div>'
    + '</div>'
    + '<button class="btn btn-primary btn-block" type="submit">Crear mi cuenta</button>'
    + '<p class="center mt">¿Ya tienes cuenta? <a href="#/login' + (next ? '?next=' + encodeURIComponent(next) : '') + '">Entra aquí</a></p>'
    + '</form>';
}

/* ---------------- Router ---------------- */
function parseHash() {
  var raw = (location.hash || '').replace(/^#/, '') || '/';
  var split = raw.split('?');
  var parts = split[0].split('/').filter(function (x) { return x; });
  return { parts: parts, query: new URLSearchParams(split[1] || '') };
}
function go(hash) { location.hash = hash; }

async function render() {
  var app = document.getElementById('app');
  if (!app) { return; }
  app.innerHTML = '<div class="spinner" role="status" aria-label="Cargando"></div>';
  try { state.user = await auth.currentUser(); } catch (e) { state.user = null; }
  if (state.user) {
    try { state.favs = await store.listFavorites(state.user.id); } catch (e) { state.favs = []; }
  } else { state.favs = []; }
  renderTopbar();
  renderModebar();

  var parsed = parseHash();
  var parts = parsed.parts, query = parsed.query;
  var route = parts[0] || '';
  var needsAuth = ['publicar', 'editar', 'panel', 'favoritos', 'admin'].indexOf(route) >= 0;
  if (needsAuth && !state.user) {
    toast('Inicia sesión para continuar.');
    location.hash = '#/login?next=' + encodeURIComponent(location.hash || '#/panel');
    return;
  }
  if (route === 'admin' && state.user && !state.user.esAdmin) {
    toast('Necesitas rol de administrador para ver esta página.', 'err');
    location.hash = '#/panel';
    return;
  }
  setActiveNav(route === '' ? 'inicio' : route);

  try {
    if (route === '') {
      var all = await store.listPosts(false);
      var countries = {};
      all.forEach(function (p) { countries[p.pais] = true; });
      var featured = all.filter(function (p) { return p.destacada; }).concat(all.filter(function (p) { return !p.destacada; })).slice(0, 3);
      app.innerHTML = homeView({ posts: all.length, countries: Object.keys(countries).length, users: (await store.listUsers()).length, featured: featured });
    } else if (route === 'explorar') {
      exploreCache = await store.listPosts(false);
      app.innerHTML = exploreView();
      updateResults();
    } else if (route === 'oportunidad' && parts[1]) {
      var post = await store.getPost(parts[1]);
      if (!post || (post.oculta && !(state.user && (state.user.id === post.autorId || state.user.esAdmin)))) {
        app.innerHTML = '<div class="empty"><strong>Esta publicación no está disponible</strong>Puede que haya sido eliminada o esté oculta por moderación.<div class="mt"><a class="btn btn-primary btn-sm" href="#/explorar">Volver a explorar</a></div></div>';
      } else {
        var owner = await store.getUserPublic(post.autorId);
        app.innerHTML = detailView(post, owner, state.favs.indexOf(post.id) >= 0);
      }
    } else if (route === 'publicar') {
      app.innerHTML = postFormView(query.get('tipo') || 'oportunidad', null);
    } else if (route === 'editar' && parts[1]) {
      var toEdit = await store.getPost(parts[1]);
      if (!toEdit || toEdit.autorId !== state.user.id) {
        toast('No puedes editar esa publicación.', 'err');
        location.hash = '#/panel?tab=publicaciones';
        return;
      }
      app.innerHTML = postFormView(null, toEdit);
      var ta = document.getElementById('pf-descripcion');
      if (ta) { ta.value = toEdit.descripcion || ''; }
    } else if (route === 'panel') {
      var tab = query.get('tab') || 'resumen';
      var posts = await store.listPosts(true);
      var myPosts = posts.filter(function (p) { return p.autorId === state.user.id; });
      var reqs = await store.listRequestsForUser(state.user.id);
      var favIds = state.favs;
      var favPosts = posts.filter(function (p) { return favIds.indexOf(p.id) >= 0; });
      app.innerHTML = panelView(tab, {
        myPosts: myPosts,
        favs: favIds,
        favPosts: favPosts,
        received: reqs.filter(function (r) { return r.autorId === state.user.id; }),
        sent: reqs.filter(function (r) { return r.remitenteId === state.user.id; })
      });
    } else if (route === 'favoritos') {
      var postsAll = await store.listPosts(true);
      app.innerHTML = favoritesView(postsAll.filter(function (p) { return state.favs.indexOf(p.id) >= 0; }));
    } else if (route === 'admin') {
      var postsAdmin = await store.listPosts(true);
      var usersAdmin = await store.listUsers();
      app.innerHTML = adminView(postsAdmin, usersAdmin);
    } else if (route === 'planes') {
      app.innerHTML = plansView();
    } else if (route === 'login') {
      if (state.user) { location.hash = '#/panel'; return; }
      app.innerHTML = loginView(query.get('next') || '');
    } else if (route === 'registro') {
      if (state.user) { location.hash = '#/panel'; return; }
      app.innerHTML = registerView(query.get('next') || '');
    } else {
      app.innerHTML = '<div class="empty"><strong>Página no encontrada</strong>El enlace que seguiste no existe.<div class="mt"><a class="btn btn-primary btn-sm" href="#/">Ir al inicio</a></div></div>';
    }
  } catch (err) {
    app.innerHTML = '<div class="empty"><strong>Algo salió mal al cargar</strong>' + esc(err.message || 'Error desconocido.') + '<div class="mt"><button class="btn btn-primary btn-sm" type="button" onclick="location.reload()">Reintentar</button></div></div>';
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- Validación de formularios ---------------- */
function setFieldError(inputId, errId, bad) {
  var input = document.getElementById(inputId);
  var err = document.getElementById(errId);
  if (input) { input.classList.toggle('invalid', !!bad); }
  if (err) { err.classList.toggle('show', !!bad); }
  return !bad;
}
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

/* ---------------- Eventos globales ---------------- */
function bindEvents() {
  document.addEventListener('click', async function (e) {
    var navToggle = e.target.closest('#hamburger');
    if (navToggle) {
      var nav = document.getElementById('mainnav');
      nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
      return;
    }
    var navLink = e.target.closest('.mainnav a');
    if (navLink) { document.getElementById('mainnav').classList.remove('open'); }
    var modalRoot = e.target.closest('#modal-root');
    if (modalRoot && e.target === modalRoot) { closeModal(); return; }

    var el = e.target.closest('[data-action]');
    if (!el) { return; }
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');

    if (action === 'logout') {
      await auth.logout();
      state.user = null; state.favs = [];
      toast('Sesión cerrada. ¡Hasta pronto!');
      go('#/');
      return;
    }
    if (action === 'fav') {
      if (!state.user) {
        toast('Entra para guardar favoritos.');
        go('#/login?next=' + encodeURIComponent(location.hash || '#/explorar'));
        return;
      }
      try {
        var added = await store.toggleFavorite(state.user.id, id);
        state.favs = await store.listFavorites(state.user.id);
        toast(added ? 'Guardado en tus favoritos.' : 'Quitado de tus favoritos.', 'ok');
        var parsed = parseHash();
        if (parsed.parts[0] === 'favoritos') { render(); return; }
        document.querySelectorAll('[data-action="fav"][data-id="' + id + '"]').forEach(function (btn) {
          var on = state.favs.indexOf(id) >= 0;
          btn.classList.toggle('active', on);
          btn.innerHTML = iconStar(on);
        });
      } catch (err) { toast('No se pudo guardar: ' + err.message, 'err'); }
      return;
    }
    if (action === 'clear-filters') {
      state.explore = { q: '', tipo: '', categoria: '', pais: '', ciudad: '' };
      render();
      return;
    }
    if (action === 'preset') {
      var hidden = document.getElementById('pf-tipo');
      if (hidden) { hidden.value = el.getAttribute('data-tipo'); }
      document.querySelectorAll('#preset-row .preset').forEach(function (b) { b.classList.toggle('active', b === el); });
      return;
    }
    if (action === 'delete-post') {
      var ok = await confirmDialog('Eliminar publicación', '¿Seguro que quieres eliminar esta publicación? No se puede deshacer.', 'Sí, eliminar');
      if (!ok) { return; }
      try {
        await store.deletePost(id);
        toast('Publicación eliminada.', 'ok');
        var r = parseHash();
        if (r.parts[0] === 'admin') { render(); } else { go('#/panel?tab=publicaciones'); }
      } catch (err) { toast('No se pudo eliminar: ' + err.message, 'err'); }
      return;
    }
    if (action === 'hide-post' || action === 'show-post') {
      try {
        await store.updatePost(id, { oculta: action === 'hide-post' });
        toast(action === 'hide-post' ? 'Publicación oculta por moderación.' : 'Publicación visible de nuevo.', 'ok');
        render();
      } catch (err) { toast('No se pudo actualizar: ' + err.message, 'err'); }
      return;
    }
    if (action === 'req-status') {
      try {
        await store.updateRequestStatus(id, el.getAttribute('data-status'));
        toast('Solicitud actualizada.', 'ok');
        render();
      } catch (err) { toast('No se pudo actualizar: ' + err.message, 'err'); }
      return;
    }
    if (action === 'feature-post') {
      paymentsModal('Destacar publicación');
      return;
    }
    if (action === 'open-payments') {
      paymentsModal(el.getAttribute('data-context') || 'Función de pago');
      return;
    }
    if (action === 'reset-demo') {
      if (isCloudMode()) {
        toast('Con Supabase conectado, «Restablecer demo» solo aplica al modo local.', 'err');
        return;
      }
      var ok2 = await confirmDialog('Restablecer demo', 'Se borrarán tus cuentas, publicaciones, favoritos y mensajes LOCALES y se restaurará el contenido de demostración. ¿Continuar?', 'Sí, restablecer');
      if (!ok2) { return; }
      resetLocalDemo();
      await seedLocal();
      toast('Demo restablecida.', 'ok');
      render();
      return;
    }
    if (action === 'copy-link') {
      var url = location.origin + location.pathname + '#/oportunidad/' + id;
      try {
        await navigator.clipboard.writeText(url);
        toast('Enlace copiado.', 'ok');
      } catch (err) {
        openModal('<h3>Enlace de la publicación</h3><p>Copia este enlace:</p><p style="word-break:break-all"><b>' + esc(url) + '</b></p><div class="modal-actions"><button class="btn btn-primary" id="cp-ok" type="button">Cerrar</button></div>');
        document.getElementById('cp-ok').addEventListener('click', closeModal);
      }
      return;
    }
    if (action === 'demo-fill') {
      var em = document.getElementById('li-email');
      var pw = document.getElementById('li-pass');
      if (em) { em.value = el.getAttribute('data-email'); }
      if (pw) { pw.value = el.getAttribute('data-pass'); }
      toast('Cuenta demo lista. Toca «Entrar».');
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); }
  });

  var applyFilters = debounce(function () { updateResults(); }, 220);
  document.addEventListener('input', function (e) {
    var f = e.target.closest('#filters');
    if (!f) { return; }
    state.explore.q = f.q ? f.q.value : '';
    state.explore.ciudad = f.ciudad ? f.ciudad.value : '';
    applyFilters();
  });
  document.addEventListener('change', function (e) {
    var f = e.target.closest('#filters');
    if (!f) { return; }
    state.explore.tipo = f.tipo ? f.tipo.value : '';
    state.explore.categoria = f.categoria ? f.categoria.value : '';
    state.explore.pais = f.pais ? f.pais.value : '';
    updateResults();
  });

  document.addEventListener('submit', async function (e) {
    var form = e.target;
    if (!form || !form.id) { return; }
    e.preventDefault();

    if (form.id === 'login-form') {
      var email = form.email.value.trim();
      var pass = form.pass.value;
      var okE = setFieldError('li-email', 'err-li-email', !validEmail(email));
      var okP = setFieldError('li-pass', 'err-li-pass', pass.length < 6);
      var box = document.getElementById('login-error');
      if (!okE || !okP) { return; }
      box.classList.remove('show');
      try {
        await auth.login(email, pass);
        toast('¡Bienvenido de nuevo!', 'ok');
        var next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
        go(next && next.indexOf('#/') === 0 ? next : '#/panel');
      } catch (err) { box.textContent = err.message; box.classList.add('show'); }
      return;
    }
    if (form.id === 'register-form') {
      var nombre = form.nombre.value.trim();
      var email2 = form.email.value.trim();
      var pass2 = form.pass.value;
      var okN = setFieldError('rg-nombre', 'err-rg-nombre', nombre.length < 2);
      var okE2 = setFieldError('rg-email', 'err-rg-email', !validEmail(email2));
      var okP2 = setFieldError('rg-pass', 'err-rg-pass', pass2.length < 6);
      var box2 = document.getElementById('register-error');
      if (!okN || !okE2 || !okP2) { return; }
      box2.classList.remove('show');
      try {
        await auth.register(nombre, email2, pass2, form.pais.value, form.ciudad.value.trim());
        toast('Cuenta creada. ¡Bienvenido a Oportunia!', 'ok');
        var next2 = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
        go(next2 && next2.indexOf('#/') === 0 ? next2 : '#/panel');
      } catch (err) { box2.textContent = err.message; box2.classList.add('show'); }
      return;
    }
    if (form.id === 'post-form') {
      var tipo = form.tipo.value;
      var categoria = form.categoria.value;
      var pais = form.pais.value;
      var titulo = form.titulo.value.trim();
      var descripcion = form.descripcion.value.trim();
      var emailC = form.emailContacto.value.trim();
      var okC = setFieldError('pf-categoria', 'err-pf-categoria', !categoria);
      var okPa = setFieldError('pf-pais', 'err-pf-pais', !pais);
      var okT = setFieldError('pf-titulo', 'err-pf-titulo', titulo.length < 10);
      var okD = setFieldError('pf-descripcion', 'err-pf-descripcion', descripcion.length < 30);
      var okEm = setFieldError('pf-email', 'err-pf-email', emailC !== '' && !validEmail(emailC));
      var box3 = document.getElementById('post-error');
      if (!okC || !okPa || !okT || !okD || !okEm) { return; }
      box3.classList.remove('show');
      var data = {
        autorId: state.user.id, autorNombre: state.user.nombre, tipo: tipo, categoria: categoria,
        titulo: titulo, descripcion: descripcion, pais: pais, ciudad: form.ciudad.value.trim(),
        presupuesto: form.presupuesto.value.trim(), contactoPreferido: form.contactoPreferido.value,
        whatsapp: form.whatsapp.value.trim(), emailContacto: emailC
      };
      try {
        var editId = form.getAttribute('data-id');
        if (editId) {
          await store.updatePost(editId, data);
          toast('Publicación actualizada.', 'ok');
          go('#/oportunidad/' + editId);
        } else {
          var created = await store.createPost(data);
          toast('¡Publicación creada! Ya está visible en Explorar.', 'ok');
          go('#/oportunidad/' + created.id);
        }
      } catch (err) { box3.textContent = 'No se pudo guardar: ' + err.message; box3.classList.add('show'); }
      return;
    }
    if (form.id === 'contact-form') {
      var msg = form.mensaje.value.trim();
      var contacto = form.contacto.value.trim();
      var okM = setFieldError('cf-msg', 'err-cf-msg', msg.length < 10);
      var okCt = setFieldError('cf-contacto', 'err-cf-contacto', contacto.length < 3);
      if (!okM || !okCt) { return; }
      var postId = form.getAttribute('data-id');
      try {
        var post = await store.getPost(postId);
        if (!post) { throw new Error('La publicación ya no existe.'); }
        await store.createRequest({
          publicacionId: post.id, publicacionTitulo: post.titulo, autorId: post.autorId,
          remitenteId: state.user.id, remitenteNombre: state.user.nombre,
          remitenteContacto: contacto, tipo: form.tipo.value, mensaje: msg
        });
        form.outerHTML = '<div class="form-ok show">Mensaje enviado. El dueño de la publicación lo verá en su panel y podrá responderte por el contacto que dejaste.</div>';
        toast('Mensaje enviado.', 'ok');
      } catch (err) { toast('No se pudo enviar: ' + err.message, 'err'); }
      return;
    }
    if (form.id === 'profile-form') {
      var nombre3 = form.nombre.value.trim();
      var emailC3 = form.emailContacto.value.trim();
      var okN3 = setFieldError('pr-nombre', 'err-pr-nombre', nombre3.length < 2);
      var okEm3 = setFieldError('pr-email', 'err-pr-email', emailC3 !== '' && !validEmail(emailC3));
      if (!okN3 || !okEm3) { return; }
      try {
        var updated = await store.saveProfile(state.user.id, {
          nombre: nombre3, pais: form.pais.value, ciudad: form.ciudad.value.trim(),
          bio: form.bio.value.trim(), habilidades: form.habilidades.value.trim(),
          whatsapp: form.whatsapp.value.trim(), emailContacto: emailC3
        });
        state.user = updated || state.user;
        renderTopbar();
        var okBox = document.getElementById('profile-ok');
        if (okBox) { okBox.textContent = 'Perfil guardado.'; okBox.classList.add('show'); }
        toast('Perfil guardado.', 'ok');
      } catch (err) { toast('No se pudo guardar: ' + err.message, 'err'); }
      return;
    }
  });
}

/* ---------------- Arranque ---------------- */
if (typeof document !== 'undefined') {
  bindEvents();
  window.addEventListener('hashchange', render);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
}

/* Exportaciones para pruebas automatizadas (Node) — sin efecto en el navegador */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { store: store, auth: auth, seedLocal: seedLocal, resetLocalDemo: resetLocalDemo, hashPassword: hashPassword, applyExploreFilters: applyExploreFilters, state: state, TIPO_LABEL: TIPO_LABEL };
}
