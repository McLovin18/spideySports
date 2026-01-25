// Servicio de upload de imágenes simplificado
console.log('🚀 CARGANDO imageUploadService_simple.ts');

class ImageUploadService {
  private basePath = 'products_dev';

  constructor() {
    console.log('🔧 ImageUploadService constructor ejecutado');
  }

  /**
   * Redimensionar y comprimir imagen para uso como Data URL
   */
  private async compressImageToDataUrl(file: File, maxWidth: number = 400, maxHeight: number = 300, quality: number = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = document.createElement('img') as HTMLImageElement;

      img.onload = () => {
        // Calcular nuevas dimensiones manteniendo proporción
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Dibujar imagen redimensionada
        ctx?.drawImage(img, 0, 0, width, height);

        // Convertir a Data URL con compresión
        const dataUrl = canvas.toBlob(
          (blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = (e) => {
                const result = e.target?.result as string;
                console.log(`✅ Imagen comprimida: ${file.name} - Tamaño reducido de ${(file.size / 1024).toFixed(1)}KB a ${(result.length / 1024).toFixed(1)}KB`);
                resolve(result);
              };
              reader.readAsDataURL(blob);
            } else {
              reject(new Error('Error comprimiendo imagen'));
            }
          },
          'image/png', // Usar PNG para preservar transparencia
          quality
        );
      };

      img.onerror = () => reject(new Error('Error cargando imagen'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Subir múltiples imágenes
   */
  async uploadMultipleImages(files: File[], productId: number): Promise<string[]> {
    console.log(`📤 uploadMultipleImages called with ${files.length} files for product ${productId}`);
    
    try {
      // Intentar cargar Firebase
      const firebaseModule = require('../utils/firebase');
      const storage = firebaseModule.storage;
      
      if (!storage) {
        throw new Error('Firebase Storage no disponible');
      }
      
      const storageModule = require('firebase/storage');
      const { ref, uploadBytes, getDownloadURL } = storageModule;
      
      if (!ref || !uploadBytes || !getDownloadURL) {
        throw new Error('Funciones de Firebase Storage no disponibles');
      }
      
      console.log('✅ Firebase Storage functions loaded successfully');
      
      // Subir archivos reales
      const uploadPromises = files.map(async (file, index) => {
        const timestamp = Date.now();
        const extension = file.name.split('.').pop()?.toLowerCase();
        const fileName = `${productId}_${index}_${timestamp}.${extension}`;
        
        const imageRef = ref(storage, `${this.basePath}/${fileName}`);
        const snapshot = await uploadBytes(imageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        console.log(`✅ Imagen ${index + 1} subida: ${downloadURL}`);
        return downloadURL;
      });
      
      const results = await Promise.all(uploadPromises);
      console.log(`✅ Todas las imágenes subidas exitosamente: ${results.length}`);
      return results;
      
    } catch (error) {
      console.warn('⚠️ Error con Firebase, usando servicio de respaldo con compresión:', error);
      
      // Usar servicio de respaldo con imágenes comprimidas
      console.log('🔄 Comprimiendo archivos reales para Data URLs optimizados...');
      
      // Validar tamaño total antes de procesar
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      console.log(`📊 Tamaño total de archivos: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);
      
      // Límite de 3MB total para archivos seleccionados
      const maxTotalSize = 3 * 1024 * 1024; // 3MB
      if (totalSize > maxTotalSize) {
        throw new Error(`El tamaño total de las imágenes (${(totalSize / (1024 * 1024)).toFixed(2)}MB) excede el límite de 3MB. Por favor selecciona imágenes más pequeñas o menos imágenes.`);
      }
      
      // Comprimir todas las imágenes con configuración agresiva para Firestore
      const compressedDataUrls = await Promise.all(files.map(async (file, index) => {
        console.log(`🔧 Comprimiendo imagen ${index + 1}: ${file.name}`);
        
        // Configuración más agresiva para Firestore (límite 1MB por documento)
        const maxWidth = files.length > 1 ? 300 : 400; // Más pequeño si hay múltiples imágenes
        const maxHeight = files.length > 1 ? 225 : 300;
        const quality = files.length > 1 ? 0.5 : 0.7; // Menor calidad si hay múltiples imágenes
        
        return await this.compressImageToDataUrl(file, maxWidth, maxHeight, quality);
      }));
      
      // Validar tamaño final de Data URLs
      const totalDataSize = compressedDataUrls.reduce((sum, dataUrl) => sum + dataUrl.length, 0);
      console.log(`📊 Tamaño total de Data URLs: ${(totalDataSize / 1024).toFixed(1)}KB`);
      
      // Firestore tiene límite de ~1MB por documento, reservar espacio para otros campos
      const firestoreLimit = 800 * 1024; // 800KB para ser seguros
      if (totalDataSize > firestoreLimit) {
        console.warn(`⚠️ Data URLs muy grandes (${(totalDataSize / 1024).toFixed(1)}KB), aplicando compresión adicional...`);
        
        // Segunda pasada con compresión más agresiva
        const ultraCompressed = await Promise.all(files.map(async (file, index) => {
          return await this.compressImageToDataUrl(file, 250, 188, 0.4); // Muy comprimido
        }));
        
        const finalSize = ultraCompressed.reduce((sum, dataUrl) => sum + dataUrl.length, 0);
        console.log(`📊 Tamaño final ultra-comprimido: ${(finalSize / 1024).toFixed(1)}KB`);
        
        if (finalSize > firestoreLimit) {
          throw new Error(`Las imágenes son demasiado grandes incluso después de la compresión. Por favor selecciona imágenes más pequeñas o menos cantidad.`);
        }
        
        console.log('✅ Imágenes ultra-comprimidas listas para Firestore');
        return ultraCompressed;
      }
      
      console.log('✅ Todas las imágenes comprimidas y listas para Firestore');
      return compressedDataUrls;
    }
  }

  /**
   * Eliminar una imagen del storage
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      console.log(`🗑️ Intentando eliminar imagen: ${imageUrl}`);
      
      // Intentar cargar Firebase
      const firebaseModule = require('../utils/firebase');
      const storage = firebaseModule.storage;
      
      if (!storage) {
        console.warn('Firebase Storage no disponible, saltando eliminación');
        return;
      }
      
      const storageModule = require('firebase/storage');
      const { ref, deleteObject } = storageModule;
      
      if (!ref || !deleteObject) {
        console.warn('Funciones de Firebase Storage no disponibles, saltando eliminación');
        return;
      }
      
      // Extraer el path de Firebase Storage desde la URL
      const baseUrl = 'https://firebasestorage.googleapis.com/v0/b/';
      if (!imageUrl.startsWith(baseUrl)) {
        console.warn('URL no es de Firebase Storage, saltando eliminación:', imageUrl);
        return;
      }
      
      const pathMatch = imageUrl.match(/\/o\/(.*?)\?/);
      if (!pathMatch) {
        console.warn('No se pudo extraer el path de la URL');
        return;
      }
      
      const imagePath = decodeURIComponent(pathMatch[1]);
      const imageRef = ref(storage, imagePath);
      
      await deleteObject(imageRef);
      console.log('✅ Imagen eliminada exitosamente:', imagePath);
      
    } catch (error) {
      console.warn('⚠️ Error eliminando imagen (no crítico):', error);
      // No lanzar error, solo advertencia
    }
  }

  /**
   * Validar archivo de imagen
   */
  validateImageFile(file: File): { isValid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: 'Tipo de archivo no permitido. Solo se permiten: JPG, PNG, WebP'
      };
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: 'El archivo es demasiado grande. Máximo 5MB permitido'
      };
    }

    return { isValid: true };
  }
}

// Export simple y directo
const imageUploadService = new ImageUploadService();
console.log('📋 ImageUploadService instance created:', !!imageUploadService);
console.log('📋 uploadMultipleImages method:', typeof imageUploadService.uploadMultipleImages);

export default imageUploadService;
export { imageUploadService };

console.log('✅ imageUploadService_simple.ts EXPORT COMPLETADO');
