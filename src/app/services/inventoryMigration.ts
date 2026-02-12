'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, import/no-anonymous-default-export */
import { inventoryService } from '../services/inventoryService';
import allProducts from '../products/productsData';

/**
 * Script de migración para transferir todos los productos de productsData.ts 
 * al sistema de inventario de Firestore
 */
export const migrateProductsToInventory = async () => {
  console.log('🚀 Iniciando migración de productos al inventario...');
  console.log(`📦 Total de productos a migrar: ${allProducts.length}`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];
  
  // Procesar productos en lotes para evitar sobrecarga
  const batchSize = 5;
  
  for (let i = 0; i < allProducts.length; i += batchSize) {
    const batch = allProducts.slice(i, i + batchSize);
    console.log(`📊 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(allProducts.length / batchSize)}`);
    
    // Procesar lote en paralelo
    const batchPromises = batch.map(async (product) => {
      try {
        // Asignar stock inicial aleatorio entre 5 y 25 unidades
        const initialStock = Math.floor(Math.random() * 21) + 5; // 5-25 unidades
        
        const inventoryData = {
          productId: product.id,
          name: product.name,
          price: product.price,
          stock: initialStock,
          image: product.images?.[0] || '',
          category: product.category || 'Sin categoría',
          description: product.description || '',
          isActive: product.inStock !== false, // true por defecto, false solo si explícitamente está inStock: false
          lastUpdated: new Date().toISOString()
        };
        
        console.log(`📝 Migrando: ${product.name} (ID: ${product.id}) - Stock inicial: ${initialStock}`);
        
        const success = await inventoryService.createOrUpdateProduct(inventoryData);
        
        if (success) {
          console.log(`✅ Producto migrado exitosamente: ${product.name}`);
          return { success: true, product: product.name };
        } else {
          throw new Error('Error al crear producto en inventario');
        }
      } catch (error: any) {
        const errorMsg = `❌ Error migrando ${product.name}: ${error.message}`;
        console.error(errorMsg);
        return { success: false, error: errorMsg, product: product.name };
      }
    });
    
    // Esperar a que termine el lote
    const batchResults = await Promise.all(batchPromises);
    
    // Contar resultados del lote
    batchResults.forEach(result => {
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
        if (result.error) {
          errors.push(result.error);
        }
      }
    });
    
    // Pausa pequeña entre lotes para no sobrecargar Firestore
    if (i + batchSize < allProducts.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Reporte final
  console.log('\n🎉 MIGRACIÓN COMPLETADA');
  console.log('====================');
  console.log(`✅ Productos migrados exitosamente: ${successCount}`);
  console.log(`❌ Productos con errores: ${errorCount}`);
  console.log(`📊 Total procesados: ${successCount + errorCount}/${allProducts.length}`);
  
  if (errors.length > 0) {
    console.log('\n⚠️ ERRORES ENCONTRADOS:');
    errors.forEach(error => console.log(error));
  }
  
  return {
    total: allProducts.length,
    success: successCount,
    errors: errorCount,
    errorDetails: errors
  };
};

/**
 * Función para verificar el estado de la migración
 */
export const checkMigrationStatus = async () => {
  try {
    console.log('🔍 Verificando estado de la migración...');
    
    const allInventoryProducts = await inventoryService.getAllProducts();
    const productDataIds = allProducts.map(p => p.id);
    
    const migratedIds = allInventoryProducts.map(p => p.productId);
    const notMigrated = productDataIds.filter(id => !migratedIds.includes(id));
    
    console.log(`📦 Productos en productsData.ts: ${allProducts.length}`);
    console.log(`🏪 Productos en inventario: ${allInventoryProducts.length}`);
    console.log(`✅ Productos migrados: ${migratedIds.length}`);
    console.log(`❌ Productos pendientes: ${notMigrated.length}`);
    
    if (notMigrated.length > 0) {
      console.log('📋 IDs pendientes de migrar:', notMigrated);
    }
    
    return {
      totalInData: allProducts.length,
      totalInInventory: allInventoryProducts.length,
      migrated: migratedIds.length,
      pending: notMigrated.length,
      pendingIds: notMigrated
    };
  } catch (error) {
    console.error('Error verificando estado de migración:', error);
    return null;
  }
};

/**
 * Función para limpiar el inventario (usar con cuidado)
 */
export const clearInventory = async () => {
  console.log('⚠️ ATENCIÓN: Esta función eliminará TODOS los productos del inventario');
  
  if (!confirm('¿Estás seguro de que quieres eliminar TODOS los productos del inventario? Esta acción no se puede deshacer.')) {
    console.log('🚫 Operación cancelada por el usuario');
    return false;
  }
  
  try {
    const allProducts = await inventoryService.getAllProducts();
    console.log(`🗑️ Eliminando ${allProducts.length} productos del inventario...`);
    
    let deletedCount = 0;
    
    for (const product of allProducts) {
      try {
        const success = await inventoryService.deleteProduct(product.productId);
        if (success) {
          deletedCount++;
          console.log(`🗑️ Eliminado: ${product.name} (ID: ${product.productId})`);
        }
      } catch (error) {
        console.error(`❌ Error eliminando ${product.name}:`, error);
      }
    }
    
    console.log(`✅ Inventario limpiado. Productos eliminados: ${deletedCount}/${allProducts.length}`);
    return true;
  } catch (error) {
    console.error('Error limpiando inventario:', error);
    return false;
  }
};

export default {
  migrateProductsToInventory,
  checkMigrationStatus,
  clearInventory
};
