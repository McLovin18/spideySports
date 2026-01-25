import { useState, useEffect } from 'react';
import { inventoryService } from '../services/inventoryService';
import allProducts from '../products/productsData';
import { jerseySizeLabel } from '../constants/jersey';

// 🚀 CACHE GLOBAL para evitar múltiples consultas a Firebase
let inventoryCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 segundos

// ⭐ Función para invalidar cache (útil después de actualizaciones)
export const invalidateProductsCache = () => {
  inventoryCache = null;
  cacheTimestamp = 0;
  console.log('🔄 Cache de productos invalidado');
};

const resolveProductImages = (product: any): string[] => {
  const versions = Array.isArray(product?.versions) ? product.versions : [];
  const defaultVersionId = product?.defaultVersionId || versions[0]?.id || null;

  if (versions.length > 0) {
    const defaultVersion = versions.find((version: any) => version?.id === defaultVersionId) ?? versions[0];
    const primaryImage = defaultVersion?.imageUrl && typeof defaultVersion.imageUrl === 'string'
      ? defaultVersion.imageUrl.trim()
      : null;

    const additionalImages = versions
      .filter((version: any) => version?.id !== defaultVersion?.id)
      .map((version: any) => (typeof version?.imageUrl === 'string' ? version.imageUrl.trim() : null))
      .filter((url: string | null): url is string => Boolean(url && url.length > 0));

    const ordered = [primaryImage, ...additionalImages].filter((url): url is string => Boolean(url));

    if (ordered.length > 0) {
      return ordered.filter((url, index, arr) => arr.indexOf(url) === index);
    }
  }

  if (Array.isArray(product?.images) && product.images.length > 0) {
    return product.images.filter((url: any): url is string => typeof url === 'string' && url.trim().length > 0);
  }

  return ['/images/product1.svg'];
};

// Hook personalizado para cargar productos combinados (estáticos + inventario) - ULTRA OPTIMIZADO
export const useProducts = (categoryFilter?: string) => {
  const [products, setProducts] = useState(allProducts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Función para convertir productos del inventario al formato de la tienda
  const convertInventoryToProduct = (inventoryProduct: any) => {
    const sizeOptions = Array.isArray(inventoryProduct.sizeStocks)
      ? inventoryProduct.sizeStocks.map((size: any) => ({
          code: size.code,
          label: jerseySizeLabel(size.code),
          quantity: size.quantity ?? 0,
        }))
      : [];

    const versions = Array.isArray(inventoryProduct.versions)
      ? inventoryProduct.versions
      : [];
    const defaultVersionId = inventoryProduct.defaultVersionId || versions[0]?.id || null;

    const resolvedImages = resolveProductImages({ ...inventoryProduct, versions, defaultVersionId });

    return {
      id: inventoryProduct.productId,
      name: inventoryProduct.name,
      price: inventoryProduct.price,
      images: resolvedImages,
      category: inventoryProduct.category || 'general',
      subcategory: inventoryProduct.subcategory || '',
      categoryLink: getCategoryLink(inventoryProduct.category),
      description: inventoryProduct.description || '',
      inStock: inventoryProduct.stock > 0 && inventoryProduct.isActive !== false,
      stockQuantity: inventoryProduct.stock || 0, // Incluir cantidad de stock
      sizeOptions,
      versions,
      defaultVersionId,
      colors: versions.length > 0 ? versions.map((v: any) => v.label ?? 'Versión') : ['Versión única'],
      details: inventoryProduct.details || [],
      featured: inventoryProduct.featured || false, // ⭐ Leer estado featured desde Firebase
      isFromFirebase: true // Marcar que viene de Firebase
    };
  };

  // Función para determinar categoryLink basado en la categoría
  const getCategoryLink = (category?: string): string => {
    if (!category) return '/general';
    
    const categoryLower = category.toLowerCase().trim();
    
    // Mapeo exacto de categorías
    const categoryMap: { [key: string]: string } = {
      'mujer': '/mujer',
      'hombre': '/hombre',
      'ninos': '/ninos',
      'niños': '/ninos',
      'bebe': '/bebe',
      'bebé': '/bebe',
      'sport': '/sport'
    };
    
    return categoryMap[categoryLower] || '/general';
  };

  useEffect(() => {
    // 🚀 MOSTRAR PRODUCTOS ESTÁTICOS INMEDIATAMENTE
    let initialProducts = allProducts;
    if (categoryFilter) {
      const filterLc = categoryFilter.toLowerCase();
      initialProducts = allProducts.filter(
        product =>
          product.categoryLink === categoryFilter ||
          (product as any).subcategory?.toLowerCase() === filterLc
      );
    }
    
    // Mostrar productos estáticos con su propio campo inStock primero
    const staticProductsFiltered = initialProducts.filter(product => product.inStock);
    setProducts(staticProductsFiltered);
    
    // 📦 CARGAR STOCK DE FIREBASE EN SEGUNDO PLANO (con cache)
    const optimizeWithFirebaseStock = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let allInventoryProducts;
        const now = Date.now();
        
        // � VERIFICAR CACHE antes de consultar Firebase
        if (inventoryCache && (now - cacheTimestamp) < CACHE_DURATION) {
          allInventoryProducts = inventoryCache;
        } else {
          allInventoryProducts = await inventoryService.getAllProducts();
          // Actualizar cache
          inventoryCache = allInventoryProducts;
          cacheTimestamp = now;
        }
        
        // 🔍 PASO 2: Crear un mapa de stock para búsqueda rápida
        const stockMap = new Map();
        allInventoryProducts.forEach(product => {
          stockMap.set(product.productId, product);
        });
        
        // 🔍 PASO 3: Procesar productos estáticos con el mapa de stock (RÁPIDO)
        const optimizedStaticProducts = [];
        for (const staticProduct of allProducts) {
          const firebaseData = stockMap.get(staticProduct.id);
          
          if (firebaseData) {
            // Producto existe en Firebase: usar precio y stock desde inventario
            if (firebaseData.stock > 0) {
              const firebaseImages = resolveProductImages(firebaseData);
              const hasRealFirebaseImage = firebaseImages.some((url) => url !== '/images/product1.svg');

              optimizedStaticProducts.push({
                ...staticProduct,
                // Datos que vienen del inventario (fuente de verdad)
                name: firebaseData.name ?? staticProduct.name,
                price: typeof firebaseData.price === 'number' ? firebaseData.price : staticProduct.price,
                images: hasRealFirebaseImage ? firebaseImages : staticProduct.images,
                category: firebaseData.category || staticProduct.category,
                subcategory: firebaseData.subcategory || (staticProduct as any).subcategory,
                description: firebaseData.description || staticProduct.description,
                details: Array.isArray(firebaseData.details) && firebaseData.details.length > 0
                  ? firebaseData.details
                  : staticProduct.details,
                inStock: firebaseData.stock > 0 && firebaseData.isActive !== false,
                stockQuantity: firebaseData.stock,
                versions: Array.isArray(firebaseData.versions) ? firebaseData.versions : (staticProduct as any).versions || [],
                defaultVersionId: firebaseData.defaultVersionId || (staticProduct as any).defaultVersionId || (firebaseData.versions?.[0]?.id ?? null),
                sizeOptions: Array.isArray(firebaseData.sizeStocks)
                  ? firebaseData.sizeStocks.map((size: any) => ({
                      code: size.code,
                      label: jerseySizeLabel(size.code),
                      quantity: size.quantity ?? 0,
                    }))
                  : (staticProduct as any).sizeOptions || [],
                featured: firebaseData.featured || staticProduct.featured || false, // ⭐ Incluir estado featured
                isFromFirebase: false // Es producto estático enriquecido con datos de Firebase
              });
            }
          } else {
            // Producto NO existe en Firebase: usar inStock original
            if (staticProduct.inStock) {
              optimizedStaticProducts.push({
                ...staticProduct,
                inStock: true,
                stockQuantity: 999, // Valor por defecto para productos estáticos sin inventario Firebase
                featured: staticProduct.featured || false, // ⭐ Mantener estado featured original
                isFromFirebase: false
              });
            }
          }
        }
        
        // 🔍 PASO 4: Convertir productos únicamente de Firebase (no estáticos)
        const convertedInventoryProducts = allInventoryProducts
          .filter((inventoryProduct: any) => inventoryProduct.stock > 0) // Solo productos con stock
          .map(convertInventoryToProduct);
        
        // 🔍 PASO 5: Obtener IDs de productos estáticos para evitar duplicados
        const staticProductIds = new Set(allProducts.map(p => p.id));
        
        // 🔍 PASO 6: Filtrar productos del inventario que no estén ya en productos estáticos
        const newInventoryProducts = convertedInventoryProducts.filter(
          (p: any) => !staticProductIds.has(p.id)
        );
        
        // 🔍 PASO 7: Combinar productos estáticos optimizados + productos únicos de Firebase
        let combinedProducts = [...optimizedStaticProducts, ...newInventoryProducts];
        
        // 🔍 PASO 8: Aplicar filtro de categoría si se especifica
        if (categoryFilter) {
          const filterLc = categoryFilter.toLowerCase();
          combinedProducts = combinedProducts.filter(product => {
            // 1) Coincidencia directa por subcategoría (nuevo sistema de IDs)
            if ((product as any).subcategory?.toLowerCase() === filterLc) return true;

            // 2) Coincidencia por enlace de categoría clásico (/mujer, /hombre, etc.)
            if (product.categoryLink === categoryFilter) return true;

            // 3) Coincidencia por nombre de categoría en minúsculas
            if (product.category?.toLowerCase() === filterLc) return true;
            
            // Mapeo adicional para compatibilidad
            const categoryMap: { [key: string]: string[] } = {
              '/mujer': ['mujer', 'dama'],
              '/hombre': ['hombre', 'caballero'], 
              '/ninos': ['ninos', 'niños', 'kids'],
              '/bebe': ['bebe', 'bebé', 'baby'],
              '/sport': ['sport', 'deportivo']
            };
            
            const validCategories = categoryMap[categoryFilter] || [];
            return validCategories.some(cat => 
              product.category?.toLowerCase().includes(cat)
            );
          });
        }
        
        setProducts(combinedProducts);
      } catch (err) {
        console.error('❌ Error optimizando productos:', err);
        setError('Error al cargar productos');
        
        // Como fallback, usar productos estáticos ya mostrados (no hacer nada más)
      } finally {
        setLoading(false);
      }
    };

    // 🚀 Ejecutar optimización en segundo plano
    optimizeWithFirebaseStock();
  }, [categoryFilter]);

  return { products, loading, error };
};
