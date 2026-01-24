'use client';

import { db } from '../utils/firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  increment,
  runTransaction
} from 'firebase/firestore';
import {
  DEFAULT_JERSEY_SIZE_STOCK,
  JERSEY_SIZE_OPTIONS,
  type JerseySizeCode,
  jerseySizeLabel
} from '../constants/jersey';

export interface JerseyVersion {
  id: string;
  label: string;
  imageUrl?: string;
  sizeStocks: SizeStock[];
  availableStock: number;
  isActive: boolean;
}

export interface SizeStock {
  code: JerseySizeCode;
  quantity: number;
}

export interface ProductInventory {
  productId: number;
  name: string;
  stock: number;
  price: number;
  images: string[]; // Array de URLs de imágenes
  category?: string;
  subcategory?: string; // subcategoría interna (papeles, tijeras, etc.)
  isActive: boolean; // Controlado automáticamente por stock
  lastUpdated: string;
  description?: string;
  details?: string[]; // Detalles del producto
  versions?: JerseyVersion[];
  defaultVersionId?: string;
  sizeStocks?: SizeStock[];
}

const normalizeSizeStocks = (data?: SizeStock[]): SizeStock[] => {
  if (!data || data.length === 0) {
    return Object.entries(DEFAULT_JERSEY_SIZE_STOCK).map(([code, quantity]) => ({
      code: code as JerseySizeCode,
      quantity,
    }));
  }

  const seen = new Set<JerseySizeCode>();
  const normalized: SizeStock[] = [];

  for (const size of data) {
    if (!size?.code) continue;
    if (seen.has(size.code)) continue;

    normalized.push({
      code: size.code,
      quantity: typeof size.quantity === 'number' && size.quantity >= 0 ? size.quantity : 0,
    });
    seen.add(size.code);
  }

  // Asegurar que existan todas las tallas base aunque no tengan stock
  JERSEY_SIZE_OPTIONS.forEach((size) => {
    if (!seen.has(size.code)) {
      normalized.push({ code: size.code, quantity: 0 });
    }
  });

  return normalized;
};

const computeTotalStock = (sizeStocks?: SizeStock[], fallbackStock?: number): number => {
  if (!sizeStocks || sizeStocks.length === 0) {
    return typeof fallbackStock === 'number' ? fallbackStock : 0;
  }

  return sizeStocks.reduce((acc, item) => acc + Math.max(0, item.quantity || 0), 0);
};

const generateVersionId = (index: number) => `version-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;

const normalizeVersion = (raw: any, index: number): JerseyVersion => {
  const sizeStocks = normalizeSizeStocks(raw?.sizeStocks);
  const availableStock = computeTotalStock(sizeStocks, raw?.availableStock);

  return {
    id: typeof raw?.id === 'string' && raw.id.trim() !== '' ? raw.id : generateVersionId(index),
    label: typeof raw?.label === 'string' && raw.label.trim() !== '' ? raw.label : `Versión ${index + 1}`,
    imageUrl: typeof raw?.imageUrl === 'string' ? raw.imageUrl : undefined,
    sizeStocks,
    availableStock,
    isActive: raw?.isActive ?? availableStock > 0,
  };
};

const normalizeVersions = (rawVersions: any[] | undefined | null): JerseyVersion[] => {
  if (!Array.isArray(rawVersions) || rawVersions.length === 0) {
    return [];
  }

  return rawVersions.map((version, index) => normalizeVersion(version, index));
};

const aggregateSizeStocksFromVersions = (versions: JerseyVersion[]): SizeStock[] => {
  if (!versions.length) return [];

  const totals = new Map<JerseySizeCode, number>();
  JERSEY_SIZE_OPTIONS.forEach((size) => totals.set(size.code, 0));

  versions.forEach((version) => {
    version.sizeStocks.forEach((size) => {
      const current = totals.get(size.code) ?? 0;
      totals.set(size.code, current + Math.max(0, size.quantity || 0));
    });
  });

  return Array.from(totals.entries()).map(([code, quantity]) => ({
    code,
    quantity,
  }));
};

const refreshVersionAggregate = (version: JerseyVersion): JerseyVersion => {
  const normalizedSizes = normalizeSizeStocks(version.sizeStocks);
  const availableStock = computeTotalStock(normalizedSizes, version.availableStock);
  return {
    ...version,
    sizeStocks: normalizedSizes,
    availableStock,
    isActive: availableStock > 0,
  };
};

const hydrateProductFromFirestore = (data: any, fallbackId: number): ProductInventory => {
  const normalizedVersions = normalizeVersions(data?.versions);
  let normalizedSizes = normalizeSizeStocks(data?.sizeStocks);

  if (normalizedVersions.length > 0) {
    normalizedSizes = aggregateSizeStocksFromVersions(normalizedVersions);
  }

  const stock = computeTotalStock(normalizedSizes, data?.stock);

  const defaultVersionId = normalizedVersions.length > 0
    ? (typeof data?.defaultVersionId === 'string' && normalizedVersions.some((v) => v.id === data.defaultVersionId)
        ? data.defaultVersionId
        : normalizedVersions[0].id)
    : undefined;

  const resolvedImages = (() => {
    if (normalizedVersions.length > 0) {
      const defaultVersion = normalizedVersions.find((version) => version.id === defaultVersionId) ?? normalizedVersions[0];
      const primaryImage = defaultVersion?.imageUrl?.trim();
      const additionalImages = normalizedVersions
        .filter((version) => version.id !== defaultVersion?.id)
        .map((version) => version.imageUrl?.trim())
        .filter((url): url is string => Boolean(url && url.length > 0));

      const ordered = [primaryImage, ...additionalImages].filter((url): url is string => Boolean(url));
      if (ordered.length > 0) {
        return ordered.filter((url, index, arr) => arr.indexOf(url) === index);
      }
    }

    if (Array.isArray(data?.images) && data.images.length > 0) {
      return data.images;
    }

    return ['/images/product1.svg'];
  })();

  return {
    ...(data as ProductInventory),
    productId: data?.productId ?? fallbackId,
    sizeStocks: normalizedSizes,
    versions: normalizedVersions.length > 0 ? normalizedVersions : undefined,
    defaultVersionId,
    images: resolvedImages,
    stock,
    isActive: stock > 0 ? data?.isActive !== false : false,
    lastUpdated: data?.lastUpdated ?? new Date().toISOString(),
  };
};

class InventoryService {
  private collectionName = 'inventory';

  // ✅ Obtener stock de un producto específico
  async getProductStock(productId: number, sizeCode?: JerseySizeCode, versionId?: string): Promise<number> {
    try {
      const docRef = doc(db, this.collectionName, productId.toString());
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return 0;
      }

      const product = hydrateProductFromFirestore(docSnap.data(), productId);

      if (versionId && Array.isArray(product.versions) && product.versions.length > 0) {
        const targetVersion = product.versions.find((version) => version.id === versionId);
        if (!targetVersion) {
          return 0;
        }

        if (sizeCode) {
          const size = targetVersion.sizeStocks.find((s) => s.code === sizeCode);
          return size ? size.quantity : 0;
        }

        return targetVersion.availableStock;
      }

      const sizeStocks = normalizeSizeStocks(product.sizeStocks);

      if (sizeCode) {
        const found = sizeStocks.find((size) => size.code === sizeCode);
        return found ? found.quantity : 0;
      }

      return computeTotalStock(sizeStocks, product.stock);
    } catch (error) {
      console.error('Error obteniendo stock:', error);
      return 0;
    }
  }

  // ✅ Verificar si un producto está disponible (automático basado en stock)
  async isProductAvailable(
    productId: number,
    requestedQuantity: number = 1,
    sizeCode?: JerseySizeCode,
    versionId?: string
  ): Promise<boolean> {
    try {
      const docRef = doc(db, this.collectionName, productId.toString());
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) return false;
      
      const product = hydrateProductFromFirestore(docSnap.data(), productId);

      if (versionId && Array.isArray(product.versions) && product.versions.length > 0) {
        const targetVersion = product.versions.find((version) => version.id === versionId);
        if (!targetVersion) return false;

        if (sizeCode) {
          const selectedSize = targetVersion.sizeStocks.find((size) => size.code === sizeCode);
          if (!selectedSize) return false;
          return selectedSize.quantity >= requestedQuantity;
        }

        return targetVersion.availableStock >= requestedQuantity;
      }

      const sizeStocks = normalizeSizeStocks(product.sizeStocks);

      if (sizeCode) {
        const selectedSize = sizeStocks.find((size) => size.code === sizeCode);
        if (!selectedSize) return false;
        return selectedSize.quantity >= requestedQuantity;
      }

      return product.stock >= requestedQuantity;
    } catch (error) {
      console.error('Error verificando disponibilidad:', error);
      return false;
    }
  }

  // ✅ Reducir stock cuando se hace una compra
  async reduceStock(productId: number, quantity: number, sizeCode?: JerseySizeCode, versionId?: string): Promise<boolean> {
    try {
      const docRef = doc(db, this.collectionName, productId.toString());
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        console.error(`❌ Producto ${productId} no encontrado en inventario`);
        throw new Error(`El producto ${productId} no está registrado en el inventario`);
      }

      const product = hydrateProductFromFirestore(docSnap.data(), productId);
      const versions = Array.isArray(product.versions) ? [...product.versions] : [];
      const hasVersions = versions.length > 0;

      if (hasVersions) {
        const effectiveVersionId = versionId || product.defaultVersionId || versions[0].id;
        if (!sizeCode) {
          throw new Error('Debes seleccionar una talla para actualizar el stock de esta versión.');
        }

        const versionIndex = versions.findIndex((version) => version.id === effectiveVersionId);
        if (versionIndex === -1) {
          throw new Error('La versión seleccionada no pertenece a este producto.');
        }

        const currentVersion = versions[versionIndex];
        const versionSizes = normalizeSizeStocks(currentVersion.sizeStocks);
        const sizeIndex = versionSizes.findIndex((size) => size.code === sizeCode);

        if (sizeIndex === -1) {
          throw new Error(`La talla seleccionada (${jerseySizeLabel(sizeCode)}) no existe en esta versión.`);
        }

        const selectedSize = versionSizes[sizeIndex];

        if (selectedSize.quantity < quantity) {
          console.error(`❌ Stock insuficiente para producto ${productId} versión ${effectiveVersionId} talla ${sizeCode}: Disponible ${selectedSize.quantity}, Solicitado ${quantity}`);
          throw new Error(`Stock insuficiente para la talla ${jerseySizeLabel(sizeCode)} en esta versión. Disponible: ${selectedSize.quantity}, solicitado: ${quantity}`);
        }

        const updatedVersionSizes = versionSizes.map((size, idx) =>
          idx === sizeIndex
            ? { ...size, quantity: size.quantity - quantity }
            : size
        );

        const updatedVersions = versions.map((version, idx) =>
          idx === versionIndex
            ? refreshVersionAggregate({ ...version, sizeStocks: updatedVersionSizes })
            : refreshVersionAggregate(version)
        );

        const aggregatedSizeStocks = aggregateSizeStocksFromVersions(updatedVersions);
        const newTotal = computeTotalStock(aggregatedSizeStocks);

        await updateDoc(docRef, {
          versions: updatedVersions,
          sizeStocks: aggregatedSizeStocks,
          stock: newTotal,
          isActive: newTotal > 0,
          defaultVersionId: effectiveVersionId,
          lastUpdated: new Date().toISOString(),
        });

        return true;
      }

      const sizeStocks = normalizeSizeStocks(product.sizeStocks);

      if (Array.isArray(product.sizeStocks) && product.sizeStocks.length > 0) {
        if (!sizeCode) {
          throw new Error('Debes seleccionar una talla para actualizar el stock de esta camiseta.');
        }

        const sizeIndex = sizeStocks.findIndex((size) => size.code === sizeCode);

        if (sizeIndex === -1) {
          throw new Error(`La talla seleccionada (${jerseySizeLabel(sizeCode)}) no existe en este producto.`);
        }

        const selectedSize = sizeStocks[sizeIndex];

        if (selectedSize.quantity < quantity) {
          console.error(`❌ Stock insuficiente para producto ${productId} en talla ${sizeCode}: Disponible: ${selectedSize.quantity}, Solicitado: ${quantity}`);
          throw new Error(`Stock insuficiente para la talla ${jerseySizeLabel(sizeCode)}. Disponible: ${selectedSize.quantity}, solicitado: ${quantity}`);
        }

        const updatedStocks = sizeStocks.map((size, idx) =>
          idx === sizeIndex
            ? { ...size, quantity: size.quantity - quantity }
            : size
        );

        const newTotal = computeTotalStock(updatedStocks, product.stock - quantity);

        await updateDoc(docRef, {
          sizeStocks: updatedStocks,
          stock: newTotal,
          isActive: newTotal > 0,
          lastUpdated: new Date().toISOString(),
        });
      } else {
        if (product.stock < quantity) {
          console.error(`❌ Stock insuficiente para producto ${productId}: Disponible: ${product.stock}, Solicitado: ${quantity}`);
          throw new Error(`Stock insuficiente para "${product.name}". Stock disponible: ${product.stock}, cantidad solicitada: ${quantity}`);
        }

        await updateDoc(docRef, {
          stock: increment(-quantity),
          isActive: (product.stock - quantity) > 0,
          lastUpdated: new Date().toISOString()
        });
      }

      return true;
    } catch (error) {
      console.error('❌ Error reduciendo stock:', error);
      throw error; // Re-lanzar el error para que el sistema de compras lo maneje
    }
  }

  // ✅ Agregar stock (para admin) - actualiza isActive automáticamente
  async addStock(productId: number, quantity: number, sizeCode?: JerseySizeCode, versionId?: string): Promise<boolean> {
    try {
      const docRef = doc(db, this.collectionName, productId.toString());
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        console.error(`❌ Producto ${productId} no encontrado en inventario`);
        return false;
      }

      const product = hydrateProductFromFirestore(docSnap.data(), productId);
      const versions = Array.isArray(product.versions) ? [...product.versions] : [];
      const hasVersions = versions.length > 0;

      if (hasVersions) {
        const effectiveVersionId = versionId || product.defaultVersionId || versions[0].id;
        if (!sizeCode) {
          throw new Error('Debes seleccionar una talla para agregar stock de camisetas.');
        }

        const versionIndex = versions.findIndex((version) => version.id === effectiveVersionId);
        if (versionIndex === -1) {
          throw new Error('La versión seleccionada no pertenece a este producto.');
        }

        const currentVersion = versions[versionIndex];
        const versionSizes = normalizeSizeStocks(currentVersion.sizeStocks);
        const sizeIndex = versionSizes.findIndex((size) => size.code === sizeCode);

        if (sizeIndex === -1) {
          throw new Error(`La talla seleccionada (${jerseySizeLabel(sizeCode)}) no pertenece a esta versión.`);
        }

        const updatedVersionSizes = versionSizes.map((size, idx) =>
          idx === sizeIndex
            ? { ...size, quantity: size.quantity + quantity }
            : size
        );

        const updatedVersions = versions.map((version, idx) =>
          idx === versionIndex
            ? refreshVersionAggregate({ ...version, sizeStocks: updatedVersionSizes })
            : refreshVersionAggregate(version)
        );

        const aggregatedSizeStocks = aggregateSizeStocksFromVersions(updatedVersions);
        const newTotal = computeTotalStock(aggregatedSizeStocks);

        await updateDoc(docRef, {
          versions: updatedVersions,
          sizeStocks: aggregatedSizeStocks,
          stock: newTotal,
          isActive: newTotal > 0,
          defaultVersionId: effectiveVersionId,
          lastUpdated: new Date().toISOString(),
        });

        return true;
      }

      const sizeStocks = normalizeSizeStocks(product.sizeStocks);

      if (Array.isArray(product.sizeStocks) && product.sizeStocks.length > 0) {
        if (!sizeCode) {
          throw new Error('Debes seleccionar una talla para agregar stock de camisetas.');
        }

        const sizeIndex = sizeStocks.findIndex((size) => size.code === sizeCode);

        if (sizeIndex === -1) {
          throw new Error(`La talla seleccionada (${jerseySizeLabel(sizeCode)}) no pertenece a este producto.`);
        }

        const updatedStocks = sizeStocks.map((size, idx) =>
          idx === sizeIndex
            ? { ...size, quantity: size.quantity + quantity }
            : size
        );

        const newTotal = computeTotalStock(updatedStocks, product.stock + quantity);

        await updateDoc(docRef, {
          sizeStocks: updatedStocks,
          stock: newTotal,
          isActive: newTotal > 0,
          lastUpdated: new Date().toISOString(),
        });
      } else {
        const newStock = product.stock + quantity;

        await updateDoc(docRef, {
          stock: increment(quantity),
          isActive: newStock > 0,
          lastUpdated: new Date().toISOString()
        });
      }

      return true;
    } catch (error) {
      console.error('Error agregando stock:', error);
      return false;
    }
  }

  // ✅ Crear o actualizar producto en inventario (para admin)
  async createOrUpdateProduct(productData: Omit<ProductInventory, 'lastUpdated' | 'isActive' | 'stock'> & { stock?: number }): Promise<boolean> {
    try {
      const docRef = doc(db, this.collectionName, productData.productId.toString());
      const normalizedVersions = normalizeVersions(productData.versions);

      const normalizedSizes = normalizedVersions.length > 0
        ? aggregateSizeStocksFromVersions(normalizedVersions)
        : normalizeSizeStocks(productData.sizeStocks);

      const totalStock = computeTotalStock(normalizedSizes, productData.stock);

      const effectiveDefaultVersionId = normalizedVersions.length > 0
        ? (productData.defaultVersionId && normalizedVersions.some((v) => v.id === productData.defaultVersionId)
            ? productData.defaultVersionId
            : normalizedVersions[0].id)
        : undefined;

      await setDoc(docRef, {
        ...productData,
        sizeStocks: normalizedSizes,
        versions: normalizedVersions.length > 0 ? normalizedVersions : [],
        defaultVersionId: effectiveDefaultVersionId,
        stock: totalStock,
        isActive: totalStock > 0, // Activar automáticamente basado en stock
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      
      return true;
    } catch (error) {
      console.error('Error creando/actualizando producto:', error);
      return false;
    }
  }

  // ✅ Actualizar producto permitiendo cambio de ID sin duplicar documento
  async updateProductWithIdChange(
    originalProductId: number,
    productData: Omit<ProductInventory, 'lastUpdated' | 'isActive'>
  ): Promise<boolean> {
    try {
      // Si el ID no cambió, usar la lógica estándar
      if (originalProductId === productData.productId) {
        return this.createOrUpdateProduct(productData);
      }

      await runTransaction(db, async (tx) => {
        const oldRef = doc(db, this.collectionName, originalProductId.toString());
        const newRef = doc(db, this.collectionName, productData.productId.toString());

        const oldSnap = await tx.get(oldRef);
        if (!oldSnap.exists()) {
          throw new Error(`El producto con ID ${originalProductId} no existe en el inventario.`);
        }

        const newSnap = await tx.get(newRef);
        if (newSnap.exists()) {
          throw new Error(`Ya existe un producto con el ID ${productData.productId}. Elige otro ID dentro del rango.`);
        }

        const oldData = hydrateProductFromFirestore(oldSnap.data(), originalProductId);
        const normalizedVersions = normalizeVersions(productData.versions ?? oldData.versions);

        const normalizedSizes = normalizedVersions.length > 0
          ? aggregateSizeStocksFromVersions(normalizedVersions)
          : normalizeSizeStocks(productData.sizeStocks ?? oldData.sizeStocks);

        const totalStock = computeTotalStock(normalizedSizes, productData.stock ?? oldData.stock);

        const effectiveDefaultVersionId = normalizedVersions.length > 0
          ? ((productData.defaultVersionId && normalizedVersions.some((v) => v.id === productData.defaultVersionId))
              ? productData.defaultVersionId
              : normalizedVersions[0].id)
          : oldData.defaultVersionId;

        const merged: ProductInventory = {
          ...oldData,
          ...productData,
          versions: normalizedVersions.length > 0 ? normalizedVersions : [],
          sizeStocks: normalizedSizes,
          defaultVersionId: effectiveDefaultVersionId,
          stock: totalStock,
          isActive: totalStock > 0,
          lastUpdated: new Date().toISOString(),
        };

        tx.set(newRef, merged);
        tx.delete(oldRef);
      });

      return true;
    } catch (error) {
      console.error('Error actualizando producto con cambio de ID:', error);
      // Propagar mensaje específico para que la capa de UI pueda mostrarlo
      throw error;
    }
  }

  // ✅ Obtener productos disponibles por categoría
  async getProductsByCategory(category: string): Promise<ProductInventory[]> {
    try {
      // Consulta simplificada para evitar el error de índice compuesto
      // Solo filtramos por categoría y luego filtramos por stock en memoria
      const q = query(
        collection(db, this.collectionName),
        where('category', '==', category) // Solo filtrar por categoría
      );
      
      const querySnapshot = await getDocs(q);
      const products: ProductInventory[] = [];
      
      querySnapshot.forEach((doc) => {
        const productData = hydrateProductFromFirestore(doc.data(), parseInt(doc.id, 10));
        // Filtrar por stock en memoria (solo productos con stock > 0)
        if (productData.stock > 0) {
          products.push(productData);
        }
      });
      
      console.log(`📦 Productos encontrados para categoría "${category}":`, products.length);
      return products.sort((a, b) => a.productId - b.productId);
    } catch (error) {
      console.error(`Error obteniendo productos de categoría "${category}":`, error);
      return [];
    }
  }

  // ✅ Obtener solo productos disponibles (para clientes) - basado en stock
  async getAvailableProducts(): Promise<ProductInventory[]> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where('stock', '>', 0) // Solo productos con stock
      );
      
      const querySnapshot = await getDocs(q);
      const products: ProductInventory[] = [];
      
      querySnapshot.forEach((doc) => {
        products.push(hydrateProductFromFirestore(doc.data(), parseInt(doc.id, 10)));
      });
      
      return products.sort((a, b) => a.productId - b.productId);
    } catch (error) {
      console.error('Error obteniendo productos disponibles:', error);
      return [];
    }
  }

  // ✅ Eliminar producto completamente (para admin)
  async deleteProduct(productId: number): Promise<boolean> {
    try {
      const docRef = doc(db, this.collectionName, productId.toString());
      await deleteDoc(docRef);
      
      return true;
    } catch (error) {
      console.error('Error eliminando producto:', error);
      return false;
    }
  }

  // ✅ Obtener todos los productos del inventario (para admin)
  async getAllProducts(): Promise<ProductInventory[]> {
    try {
      const querySnapshot = await getDocs(collection(db, this.collectionName));
      const products: ProductInventory[] = [];
      
      querySnapshot.forEach((doc) => {
        products.push(hydrateProductFromFirestore(doc.data(), parseInt(doc.id, 10)));
      });
      
      return products.sort((a, b) => a.productId - b.productId);
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }
  }

  // ✅ Obtener el siguiente ID disponible dentro de un rango [minId, maxId]
  async getNextProductIdInRange(minId: number, maxId: number): Promise<number> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where('productId', '>=', minId),
        where('productId', '<=', maxId)
      );

      const snapshot = await getDocs(q);
      const usedIds = new Set<number>();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<ProductInventory>;
        if (typeof data.productId === 'number') {
          usedIds.add(data.productId);
        } else {
          const numericId = parseInt(docSnap.id, 10);
          if (!isNaN(numericId)) {
            usedIds.add(numericId);
          }
        }
      });

      let candidate = minId;
      while (usedIds.has(candidate) && candidate <= maxId) {
        candidate++;
      }

      if (candidate > maxId) {
        throw new Error(`No hay IDs disponibles en el rango ${minId}-${maxId}`);
      }

      return candidate;
    } catch (error) {
      console.error('Error calculando siguiente ID en rango:', error);
      throw error;
    }
  }

  // ✅ Procesar compra y reducir stock de múltiples productos
  async processOrder(items: { productId: number; quantity: number; sizeCode?: JerseySizeCode; versionId?: string }[]): Promise<boolean> {
    const processedItems: { productId: number; quantity: number; sizeCode?: JerseySizeCode; versionId?: string }[] = [];
    
    try {
      // Verificar stock de todos los productos primero
      for (const item of items) {
        const available = await this.isProductAvailable(item.productId, item.quantity, item.sizeCode, item.versionId);
        if (!available) {
          const productStock = await this.getProductStock(item.productId, item.sizeCode, item.versionId);
          const sizeLabel = item.sizeCode ? ` (${jerseySizeLabel(item.sizeCode)})` : '';
          throw new Error(`Stock insuficiente para producto ${item.productId}${sizeLabel}. Stock disponible: ${productStock}, cantidad solicitada: ${item.quantity}`);
        }
      }
      
      // Si todo está disponible, reducir stock uno por uno
      for (const item of items) {
        try {
          await this.reduceStock(item.productId, item.quantity, item.sizeCode, item.versionId);
          processedItems.push(item);
        } catch (error) {
          console.error(`❌ Error reduciendo stock para producto ${item.productId}:`, error);
          
          // Revertir cambios si algo falla a mitad del proceso
          for (const processedItem of processedItems) {
            try {
              await this.addStock(processedItem.productId, processedItem.quantity, processedItem.sizeCode, processedItem.versionId);
              console.log(`↩️ Stock revertido para producto ${processedItem.productId}: ${processedItem.quantity} unidades`);
            } catch (revertError) {
              console.error(`❌ Error revirtiendo stock para producto ${processedItem.productId}:`, revertError);
            }
          }
          
          throw error;
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error procesando orden:', error);
      throw error; // Re-lanzar para que purchaseService lo maneje
    }
  }
}

export const inventoryService = new InventoryService();
