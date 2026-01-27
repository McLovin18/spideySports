export const CATEGORIES = [
  { id: "clubKits", label: "Clubes Internacionales" }, // 1000-1999
  { id: "nationalTeams", label: "Selecciones Nacionales" }, // 2000-2999
  { id: "specialEditions", label: "Ediciones Especiales" }, // 3000-3999
  { id: "retroClassics", label: "Retro & Leyendas" }, // 4000-4999
];

export const SUBCATEGORIES = [
  // Categoría 1: Clubes Internacionales (1000-1999)
  { id: "clubKits", value: "liga-espanola", label: "La Liga (España)", minId: 1000, maxId: 1199 },
  { id: "clubKits", value: "premier-league", label: "Premier League (Inglaterra)", minId: 1200, maxId: 1399 },
  { id: "clubKits", value: "serie-a", label: "Serie A (Italia)", minId: 1400, maxId: 1599 },
  { id: "clubKits", value: "bundesliga", label: "Bundesliga (Alemania)", minId: 1600, maxId: 1799 },
  { id: "clubKits", value: "ligue-1", label: "Ligue 1 (Francia)", minId: 1800, maxId: 1899 },
    { id: "clubKits", value: "liga-sudamericana", label: "Liga Sudamericana", minId: 1900, maxId: 1999 },


  // Categoría 2: Selecciones Nacionales (2000-2999)
  { id: "nationalTeams", value: "europe", label: "Europa (UEFA)", minId: 2000, maxId: 2199 },
  { id: "nationalTeams", value: "americas", label: "Américas (CONMEBOL/CONCACAF)", minId: 2200, maxId: 2399 },
  { id: "nationalTeams", value: "africa", label: "África (CAF)", minId: 2400, maxId: 2599 },
  { id: "nationalTeams", value: "asia-oceania", label: "Asia & Oceanía (AFC/OFC)", minId: 2600, maxId: 2799 },

  // Categoría 3: Ediciones Especiales (3000-3999)
  { id: "specialEditions", value: "limited-edition", label: "Limited Edition", minId: 3000, maxId: 3299 },

  // Categoría 4: Retro & Leyendas (4000-4999)
  { id: "retroClassics", value: "retro-80s", label: "Década de los 80", minId: 4000, maxId: 4199 },
  { id: "retroClassics", value: "retro-90s", label: "Década de los 90", minId: 4200, maxId: 4399 },
  { id: "retroClassics", value: "retro-2000s", label: "Década de los 2000", minId: 4400, maxId: 4599 },
  { id: "retroClassics", value: "retro-iconic", label: "Iconos Eternos", minId: 4600, maxId: 4799 },
];

// Lista plana alternativa de subcategorías (solo id + nombre)
export const subcategories = SUBCATEGORIES.map((cat) => ({
  id: cat.id,
  name: cat.label,
}));

// Helper para obtener el rango de IDs de una subcategoría a partir de su value
export const getSubcategoryIdRange = (value: string) => {
  const sub = SUBCATEGORIES.find((s) => s.value === value);
  if (!sub || typeof (sub as any).minId !== "number" || typeof (sub as any).maxId !== "number") {
    return null;
  }
  return { categoryId: sub.id, minId: (sub as any).minId as number, maxId: (sub as any).maxId as number };
};

// Export por defecto: categorías principales (usado en Navbar, páginas de categorías, etc.)
export default CATEGORIES;
