import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Form, Button, Row, Col, Badge, Alert, Spinner, Image, Card, InputGroup } from 'react-bootstrap';
import {
  inventoryService,
  type ProductInventory,
  type JerseyVersion,
  type SizeStock
} from '../services/inventoryService';
import { useAuth } from '../context/AuthContext';
import CATEGORIES, { SUBCATEGORIES, getSubcategoryIdRange } from '../constants/categories'; // Categorías y subcategorías con rangos de ID
import { JERSEY_SIZE_OPTIONS, type JerseySizeCode } from '../constants/jersey';

// Función para cargar el servicio de imágenes de forma segura
const getImageUploadService = async () => {
  try {
    console.log('🔄 Intentando cargar servicio simplificado de Firebase Storage...');
    
    const module = await import('../services/imageUploadService_simple');
    console.log('📦 Módulo simplificado cargado:', !!module);
    console.log('📦 Default export:', !!module.default);
    console.log('📦 Named export:', !!module.imageUploadService);
    
    const service = module.default || module.imageUploadService;
    console.log('� Servicio extraído:', !!service);
    console.log('� uploadMultipleImages method:', typeof service?.uploadMultipleImages);
    
    if (service && typeof service.uploadMultipleImages === 'function') {
      console.log('✅ Servicio de Firebase Storage cargado correctamente');
      return service;
    } else {
      console.warn('⚠️ Servicio no tiene el método uploadMultipleImages');
      return null;
    }
  } catch (error) {
    console.error('❌ Error cargando servicio de Firebase Storage:', error);
    return null;
  }
};

// Servicio de respaldo para cuando Firebase no esté disponible
const createFallbackImageService = () => {
  
  // Función auxiliar para comprimir imágenes
  const compressImageToDataUrl = async (file: File, maxWidth: number = 400, maxHeight: number = 300, quality: number = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = document.createElement('img') as HTMLImageElement;

      img.onload = () => {
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
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = (e) => {
                const result = e.target?.result as string;
                console.log(`✅ Compresión respaldo: ${file.name} - ${(result.length / 1024).toFixed(1)}KB`);
                resolve(result);
              };
              reader.readAsDataURL(blob);
            } else {
              reject(new Error('Error comprimiendo imagen'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Error cargando imagen'));
      img.src = URL.createObjectURL(file);
    });
  };

  return {
    uploadMultipleImages: async (files: File[], productId: number): Promise<string[]> => {
      console.log('🔄 Servicio de respaldo - comprimiendo archivos reales...');
      
      // Validar tamaño total
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      console.log(`📊 Tamaño total: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);
      
      if (totalSize > 3 * 1024 * 1024) {
        throw new Error(`El tamaño total de las imágenes (${(totalSize / (1024 * 1024)).toFixed(2)}MB) excede el límite de 3MB.`);
      }
      
      // Configuración de compresión adaptativa
      const maxWidth = files.length > 1 ? 300 : 400;
      const maxHeight = files.length > 1 ? 225 : 300;
      const quality = files.length > 1 ? 0.5 : 0.7;
      
      const dataUrls = await Promise.all(files.map((file, index) => 
        compressImageToDataUrl(file, maxWidth, maxHeight, quality)
      ));
      
      // Validar tamaño final
      const totalDataSize = dataUrls.reduce((sum, dataUrl) => sum + dataUrl.length, 0);
      console.log(`📊 Tamaño final Data URLs: ${(totalDataSize / 1024).toFixed(1)}KB`);
      
      if (totalDataSize > 800 * 1024) { // 800KB límite para Firestore
        console.warn('⚠️ Aplicando compresión ultra para Firestore...');
        const ultraCompressed = await Promise.all(files.map((file) => 
          compressImageToDataUrl(file, 250, 188, 0.4)
        ));
        console.log('✅ Ultra-compresión completada');
        return ultraCompressed;
      }
      
      console.log('✅ Servicio de respaldo completado con imágenes comprimidas');
      return dataUrls;
    },
    
    deleteImage: async (imageUrl: string): Promise<void> => {
      console.log('🗑️ Servicio de respaldo - simulando eliminación de:', imageUrl);
    }
  };
};

interface ProductFormModalProps {
  show: boolean;
  onHide: () => void;
  product?: ProductInventory | null;
  onProductSaved: () => void;
}

export default function ProductFormModal({ show, onHide, product, onProductSaved }: ProductFormModalProps) {
  const { user } = useAuth();
  const defaultCategoryId = CATEGORIES[0]?.id ?? '';
  const defaultSubcategoryValue = SUBCATEGORIES.find((sub) => sub.id === defaultCategoryId)?.value ?? '';
  
  const [formData, setFormData] = useState({
    productId: 0,
    name: '',
    price: 0,
    stock: 0,
    category: defaultCategoryId,
    subcategory: defaultSubcategoryValue,
    description: '',
    details: [] as string[]
  });

  const [versions, setVersions] = useState<JerseyVersion[]>([]);
  const [defaultVersionId, setDefaultVersionId] = useState<string | null>(null);
  const [versionUploads, setVersionUploads] = useState<Record<string, File | null>>({});
  const [versionPreviews, setVersionPreviews] = useState<Record<string, string>>({});

  // Validación de archivos de imagen reutilizada en formularios y versiones
  const validateImageFile = useMemo(() => (file: File): { isValid: boolean; error?: string } => {
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

    if (!file.name || file.name.length < 1) {
      return {
        isValid: false,
        error: 'Nombre de archivo inválido'
      };
    }

    return { isValid: true };
  }, []);

  const createEmptySizeStocks = useCallback(
    (): SizeStock[] => JERSEY_SIZE_OPTIONS.map((size) => ({ code: size.code, quantity: 0 })),
    []
  );

  const computeTotalStock = useCallback(
    () =>
      versions.reduce((acc, version) => {
        const versionTotal = version.sizeStocks.reduce(
          (sum, entry) => sum + Math.max(0, Number(entry.quantity) || 0),
          0
        );
        return acc + versionTotal;
      }, 0),
    [versions]
  );

  const createVersionTemplate = useCallback(
    (index: number): JerseyVersion => ({
      id: `version-${Date.now()}-${index}`,
      label: `Versión ${index + 1}`,
      imageUrl: '',
      sizeStocks: createEmptySizeStocks(),
      availableStock: 0,
      isActive: false,
    }),
    [createEmptySizeStocks]
  );

  const handleVersionLabelChange = useCallback((versionId: string, value: string) => {
    setVersions((prev) =>
      prev.map((version) =>
        version.id === versionId ? { ...version, label: value } : version
      )
    );
  }, []);

  const handleVersionSizeQuantityChange = useCallback(
    (versionId: string, code: JerseySizeCode, rawValue: number) => {
      const sanitized = Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
      setVersions((prev) =>
        prev.map((version) => {
          if (version.id !== versionId) return version;

          const normalizedSizes = JERSEY_SIZE_OPTIONS.map((size) => {
            const existing = version.sizeStocks.find((entry) => entry.code === size.code) || {
              code: size.code,
              quantity: 0,
            };

            if (size.code === code) {
              return { ...existing, quantity: sanitized };
            }

            return existing;
          });

          const versionTotal = normalizedSizes.reduce((acc, entry) => acc + entry.quantity, 0);

          return {
            ...version,
            sizeStocks: normalizedSizes,
            availableStock: versionTotal,
            isActive: versionTotal > 0,
          };
        })
      );
    },
    []
  );

  const handleVersionImageSelect = useCallback(
    (versionId: string, files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }

      const file = files[0];
      const validation = validateImageFile(file);
      if (!validation.isValid) {
        setError(validation.error || 'Archivo inválido para la versión.');
        return;
      }

      setVersionUploads((prev) => ({
        ...prev,
        [versionId]: file,
      }));

      setVersionPreviews((prev) => {
        const existing = prev[versionId];
        if (existing && existing.startsWith('blob:')) {
          URL.revokeObjectURL(existing);
        }
        return {
          ...prev,
          [versionId]: URL.createObjectURL(file),
        };
      });
    },
    [validateImageFile]
  );

  const handleVersionImageClear = useCallback((versionId: string) => {
    setVersionUploads((prev) => {
      const next = { ...prev };
      delete next[versionId];
      return next;
    });

    setVersionPreviews((prev) => {
      const next = { ...prev };
      const existing = next[versionId];
      if (existing && existing.startsWith('blob:')) {
        URL.revokeObjectURL(existing);
      }
      delete next[versionId];
      return next;
    });

    setVersions((prev) =>
      prev.map((version) =>
        version.id === versionId
          ? { ...version, imageUrl: '' }
          : version
      )
    );
  }, []);

  const addNewVersion = useCallback(() => {
    setVersions((prev) => {
      const nextVersion = createVersionTemplate(prev.length);
      if (!defaultVersionId) {
        setDefaultVersionId(nextVersion.id);
      }
      return [...prev, nextVersion];
    });
  }, [createVersionTemplate, defaultVersionId]);

  const removeVersion = useCallback(
    (versionId: string) => {
      setVersions((prev) => {
        if (prev.length <= 1) {
          return prev;
        }

        const filtered = prev.filter((version) => version.id !== versionId);
        if (filtered.length === prev.length) {
          return prev;
        }

        if (defaultVersionId === versionId) {
          setDefaultVersionId(filtered[0]?.id ?? null);
        }

        setVersionUploads((prevUploads) => {
          const next = { ...prevUploads };
          delete next[versionId];
          return next;
        });

        setVersionPreviews((prevPreviews) => {
          const next = { ...prevPreviews };
          const preview = next[versionId];
          if (preview && preview.startsWith('blob:')) {
            URL.revokeObjectURL(preview);
          }
          delete next[versionId];
          return next;
        });

        return filtered;
      });
    },
    [defaultVersionId]
  );

  const handleSetDefaultVersion = useCallback((versionId: string) => {
    setDefaultVersionId(versionId);
  }, []);

  const [newDetail, setNewDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [autoIdInfo, setAutoIdInfo] = useState<string>('');
  const [autoIdLoading, setAutoIdLoading] = useState<boolean>(false);
  const [originalProductId, setOriginalProductId] = useState<number | null>(null);

  const isEditing = !!product;

  // Effect para actualizar los datos cuando cambia el producto
  useEffect(() => {
    const timestamp = Date.now();

    if (product) {
      let normalizedVersions: JerseyVersion[] = [];

      if (Array.isArray(product.versions) && product.versions.length > 0) {
        normalizedVersions = product.versions.map((version, index) => {
          const normalizedSizeStocks = JERSEY_SIZE_OPTIONS.map((size) => {
            const existing = version.sizeStocks?.find((entry) => entry.code === size.code);
            const parsedQuantity = Number(existing?.quantity);
            return {
              code: size.code,
              quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0
                ? Math.floor(parsedQuantity)
                : 0,
            };
          });

          const computedTotal = normalizedSizeStocks.reduce((acc, entry) => acc + entry.quantity, 0);
          const parsedStock = Number((version as JerseyVersion).availableStock);
          const sanitizedStock = Number.isFinite(parsedStock) && parsedStock >= 0
            ? Math.floor(parsedStock)
            : computedTotal;

          return {
            id: version.id || `version-${timestamp}-${index}`,
            label: version.label?.trim() || `Versión ${index + 1}`,
            imageUrl: version.imageUrl || '',
            sizeStocks: normalizedSizeStocks,
            availableStock: sanitizedStock,
            isActive: typeof version.isActive === 'boolean' ? version.isActive : sanitizedStock > 0,
          } as JerseyVersion;
        });
      } else {
        const fallbackSizeStocks = JERSEY_SIZE_OPTIONS.map((size) => {
          const existing = product.sizeStocks?.find((entry) => entry.code === size.code);
          const parsedQuantity = Number(existing?.quantity);
          return {
            code: size.code,
            quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0
              ? Math.floor(parsedQuantity)
              : 0,
          };
        });

        const fallbackTotal = fallbackSizeStocks.reduce((acc, entry) => acc + entry.quantity, 0);

        normalizedVersions = [
          {
            id: `version-${timestamp}-0`,
            label: 'Versión 1',
            imageUrl: product.images?.[0] ?? '',
            sizeStocks: fallbackSizeStocks,
            availableStock: fallbackTotal,
            isActive: fallbackTotal > 0,
          },
        ];
      }

      const aggregatedSizeStocks = JERSEY_SIZE_OPTIONS.map((size) => ({
        code: size.code,
        quantity: normalizedVersions.reduce((sum, version) => {
          const match = version.sizeStocks.find((entry) => entry.code === size.code);
          return sum + Math.max(0, match?.quantity ?? 0);
        }, 0),
      }));

      const aggregatedStock = aggregatedSizeStocks.reduce((acc, entry) => acc + entry.quantity, 0);

      setFormData({
        productId: product.productId,
        name: product.name,
        price: product.price,
        stock: aggregatedStock,
        category: product.category || defaultCategoryId,
        subcategory: product.subcategory || defaultSubcategoryValue,
        description: product.description || '',
        details: product.details || [],
      });
      setOriginalProductId(product.productId);
      setVersions(normalizedVersions);
      setDefaultVersionId(product.defaultVersionId && normalizedVersions.some((v) => v.id === product.defaultVersionId)
        ? product.defaultVersionId
        : normalizedVersions[0]?.id ?? null);
      setVersionUploads({});
      setVersionPreviews(
        normalizedVersions.reduce<Record<string, string>>((acc, version) => {
          acc[version.id] = version.imageUrl || '';
          return acc;
        }, {})
      );
    } else {
      // Reset para nuevo producto
      const initialVersion = createVersionTemplate(0);
      setFormData({
        productId: 0,
        name: '',
        price: 0,
        stock: 0,
        category: defaultCategoryId,
        subcategory: defaultSubcategoryValue,
        description: '',
        details: [],
      });
      setOriginalProductId(null);
      setVersions([initialVersion]);
      setDefaultVersionId(initialVersion.id);
      setVersionUploads({});
      setVersionPreviews({});
    }

    // Limpiar estados de archivos y errores
    setError('');
    setUploadProgress(0);
    setAutoIdInfo('');
    setAutoIdLoading(false);
  }, [product, createVersionTemplate, defaultCategoryId, defaultSubcategoryValue]);

  useEffect(() => {
    setFormData((prev) => {
      const currentTotal = computeTotalStock();
      if (prev.stock === currentTotal) {
        return prev;
      }

      return {
        ...prev,
        stock: currentTotal,
      };
    });
  }, [computeTotalStock]);

  // 🔄 Cuando se elige categoría o subcategoría en modo creación, calcular ID automático
  useEffect(() => {
    if (isEditing) return; // no tocar IDs en edición
    if (!formData.category || !formData.subcategory) {
      setAutoIdInfo('');
      return;
    }

    const range = getSubcategoryIdRange(formData.subcategory);
    if (!range) {
      setAutoIdInfo('Esta subcategoría aún no tiene rango de IDs definido. Ingresa el ID manualmente.');
      return;
    }

    let cancelled = false;
    const loadNextId = async () => {
      try {
        setAutoIdLoading(true);
        const nextId = await inventoryService.getNextProductIdInRange(range.minId, range.maxId);
        if (cancelled) return;
        setFormData(prev => ({
          ...prev,
          productId: nextId,
        }));
        setAutoIdInfo(`ID sugerido automáticamente para "${formData.subcategory}": ${nextId} (rango ${range.minId}-${range.maxId})`);
      } catch (err: any) {
        if (cancelled) return;
        setAutoIdInfo(err?.message || `No se pudo calcular un ID disponible en el rango ${range.minId}-${range.maxId}`);
      } finally {
        if (!cancelled) setAutoIdLoading(false);
      }
    };

    loadNextId();

    return () => {
      cancelled = true;
    };
  }, [formData.category, formData.subcategory, isEditing]);

  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const addDetail = useCallback(() => {
    if (newDetail.trim()) {
      setFormData(prev => ({
        ...prev,
        details: [...prev.details, newDetail.trim()]
      }));
      setNewDetail('');
    }
  }, [newDetail]);

  const removeDetail = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      details: prev.details.filter((_, i) => i !== index)
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!user) {
        throw new Error('Debes estar autenticado para crear/editar productos');
      }

      if (!formData.name.trim()) {
        throw new Error('El nombre del producto es requerido');
      }
      
      if (formData.price <= 0) {
        throw new Error('El precio debe ser mayor a 0');
      }
      
      if (!formData.category.trim()) {
        throw new Error('Debes seleccionar una categoría para el producto');
      }

      if (!formData.subcategory.trim()) {
        throw new Error('Debes seleccionar una subcategoría para asignar correctamente el ID');
      }

      const uploadImagesWithFallback = async (files: File[]): Promise<string[]> => {
        if (!files.length) {
          return [];
        }

        try {
          console.log(`📤 Intentando subir ${files.length} imagen(es) a Firebase Storage...`);
          const imageService = await getImageUploadService();

          if (imageService && typeof imageService.uploadMultipleImages === 'function') {
            console.log('✅ Servicio de Firebase disponible, subiendo archivos reales...');
            return await imageService.uploadMultipleImages(files, formData.productId);
          }

          console.warn('⚠️ Servicio de Firebase no disponible, usando servicio de respaldo...');
          const fallbackService = createFallbackImageService();
          return await fallbackService.uploadMultipleImages(files, formData.productId);
        } catch (primaryError) {
          console.error('❌ Error subiendo imágenes, intentando con servicio de respaldo:', primaryError);
          const fallbackService = createFallbackImageService();
          return await fallbackService.uploadMultipleImages(files, formData.productId);
        }
      };

      const sanitizedSizes: SizeStock[] = JERSEY_SIZE_OPTIONS.map((size) => ({
        code: size.code,
        quantity: versions.reduce((sum, version) => {
          const match = version.sizeStocks.find((entry) => entry.code === size.code);
          return sum + Math.max(0, Number(match?.quantity) || 0);
        }, 0),
      }));

      const totalStock = sanitizedSizes.reduce((acc, entry) => acc + entry.quantity, 0);

      if (totalStock <= 0) {
        throw new Error('Debes registrar al menos una camiseta disponible en inventario.');
      }

      if (!versions.length) {
        throw new Error('Agrega al menos una versión de la camiseta (por ejemplo local o visitante).');
      }

      const versionWithoutImage = versions.find((version) => {
        const existingImage = typeof version.imageUrl === 'string' && version.imageUrl.trim() !== '';
        const pendingUpload = versionUploads[version.id] instanceof File;
        return !existingImage && !pendingUpload;
      });

      if (versionWithoutImage) {
        throw new Error(`Agrega una imagen para la versión "${versionWithoutImage.label || 'Sin nombre'}" antes de guardar.`);
      }

      const versionImageUploads: Record<string, string> = {};
      const versionUploadEntries = Object.entries(versionUploads).filter(([, file]) => file instanceof File);

      if (versionUploadEntries.length > 0) {
        setUploadProgress((prev) => (prev < 20 ? 20 : prev));
      }

      for (const [versionId, file] of versionUploadEntries) {
        if (!file) continue;

        try {
          const uploadedUrls = await uploadImagesWithFallback([file]);
          if (uploadedUrls[0]) {
            versionImageUploads[versionId] = uploadedUrls[0];
          }
        } catch (uploadError) {
          console.error(`❌ Error subiendo imagen para versión ${versionId}:`, uploadError);
          throw new Error('Error al subir las imágenes específicas de cada versión.');
        }
      }

      if (versionUploadEntries.length > 0) {
        setUploadProgress((prev) => (prev < 80 ? 80 : prev));
      }

      const normalizedVersions: JerseyVersion[] = versions.map((version, index) => {
        const sanitizedSizeStocks = JERSEY_SIZE_OPTIONS.map((size) => {
          const match = version.sizeStocks.find((entry) => entry.code === size.code);
          const parsedQuantity = Number(match?.quantity);
          return {
            code: size.code,
            quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0
              ? Math.floor(parsedQuantity)
              : 0,
          };
        });

        const sanitizedTotal = sanitizedSizeStocks.reduce((sum, entry) => sum + entry.quantity, 0);

        return {
          id: version.id || `version-${Date.now()}-${index}`,
          label: version.label.trim() || `Versión ${index + 1}`,
          imageUrl: (versionImageUploads[version.id] ?? version.imageUrl)?.trim() || '',
          sizeStocks: sanitizedSizeStocks,
          availableStock: sanitizedTotal,
          isActive: sanitizedTotal > 0,
        };
      });

      const effectiveDefaultVersion = normalizedVersions.some((v) => v.id === defaultVersionId)
        ? (defaultVersionId as string)
        : normalizedVersions[0].id;

      const primaryVersion = normalizedVersions.find((version) => version.id === effectiveDefaultVersion) ?? normalizedVersions[0];
      const primaryImage = primaryVersion?.imageUrl?.trim() || '/images/product1.svg';
      const secondaryImages = normalizedVersions
        .filter((version) => version.id !== primaryVersion?.id)
        .map((version) => version.imageUrl?.trim())
        .filter((url): url is string => Boolean(url && url.length > 0));

      const productImages = [primaryImage, ...secondaryImages].filter((url, index, arr) => url && arr.indexOf(url) === index);

      // Validar que el ID esté dentro del rango de la subcategoría (si existe rango configurado)
      const range = getSubcategoryIdRange(formData.subcategory);
      if (range) {
        if (formData.productId < range.minId || formData.productId > range.maxId) {
          throw new Error(`El ID del producto debe estar entre ${range.minId} y ${range.maxId} para la subcategoría seleccionada.`);
        }
      }

      const productData: Omit<ProductInventory, 'lastUpdated' | 'isActive'> = {
        productId: formData.productId,
        name: formData.name.trim(),
        price: formData.price,
        stock: totalStock,
        images: productImages.length > 0 ? productImages : ['/images/product1.svg'],
        category: formData.category.trim(),
        subcategory: formData.subcategory.trim(),
        description: formData.description.trim(),
        details: formData.details,
        sizeStocks: sanitizedSizes,
        versions: normalizedVersions,
        defaultVersionId: effectiveDefaultVersion,
      };

      let success: boolean;

      // Si estamos editando y tenemos un ID original, usar la lógica que permite cambio de ID sin duplicar
      if (isEditing && originalProductId !== null) {
        success = await inventoryService.updateProductWithIdChange(originalProductId, productData);
      } else {
        success = await inventoryService.createOrUpdateProduct(productData);
      }
      
      if (success) {
        setUploadProgress(100);
        console.log('✅ Producto guardado exitosamente con imágenes reales');
        onProductSaved();
        handleClose();
      } else {
        throw new Error('Error al guardar el producto en el inventario');
      }

    } catch (error: any) {
      console.error('❌ Error completo:', error);
      setError(error.message || 'Error al procesar el formulario');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    Object.values(versionPreviews).forEach((preview) => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    });

    const initialVersion = createVersionTemplate(0);
    setFormData({
      productId: 0,
      name: '',
      price: 0,
      stock: 0,
      category: defaultCategoryId,
      subcategory: defaultSubcategoryValue,
      description: '',
      details: [] as string[]
    });
    setNewDetail('');
    setError('');
    setUploadProgress(0);
    setAutoIdInfo('');
    setAutoIdLoading(false);
    setVersions([initialVersion]);
    setDefaultVersionId(initialVersion.id);
    setVersionUploads({});
    setVersionPreviews({});
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-box me-2"></i>
          {isEditing ? 'Editar Producto' : 'Crear Nuevo Producto'}
        </Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && (
            <Alert variant="danger">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {error}
            </Alert>
          )}

          {uploadProgress > 0 && (
            <Alert variant="info">
              <div className="d-flex align-items-center">
                <Spinner animation="border" size="sm" className="me-2" />
                Procesando imágenes desde tu computadora... {uploadProgress}%
                <br />
                <small className="text-muted">
                  Intentando Firebase Storage, con respaldo automático si es necesario
                </small>
              </div>
            </Alert>
          )}

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>ID del Producto *</Form.Label>
                <Form.Control
                  type="number"
                  value={formData.productId || ''}
                  onChange={(e) => handleInputChange('productId', parseInt(e.target.value) || 0)}
                  disabled={!isEditing} // en creación se calcula automáticamente
                  required
                />
                {!isEditing && autoIdInfo && (
                  <Form.Text className="text-muted d-block mt-1">
                    {autoIdLoading && <Spinner animation="border" size="sm" className="me-2" />} 
                    {autoIdInfo}
                  </Form.Text>
                )}
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Nombre del Producto *</Form.Label>
                <Form.Control
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Precio *</Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  value={formData.price || ''}
                  onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || 0)}
                  required
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Stock *</Form.Label>
                <Form.Control
                  type="number"
                  value={computeTotalStock()}
                  readOnly
                  disabled
                />
                <Form.Text className="text-muted">
                  El stock total se calcula automáticamente con base en las tallas disponibles.
                </Form.Text>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>Categoría *</Form.Label>
                <Form.Select
                  value={formData.category}
                  onChange={(e) => {
                    const value = e.target.value;
                    const nextSubcategory = SUBCATEGORIES.find((sub) => sub.id === value)?.value ?? '';
                    // al cambiar categoría, limpiar subcategoría e ID
                    setFormData(prev => ({
                      ...prev,
                      category: value,
                      subcategory: nextSubcategory,
                      productId: isEditing ? prev.productId : 0,
                    }));
                    setAutoIdInfo('');
                  }}
                  required
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  Esta categoría determinará en qué sección aparecerá el producto en la tienda
                </Form.Text>
              </Form.Group>
            </Col>
          </Row>

          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="fw-bold d-flex align-items-center gap-2 mb-0">
                <i className="bi bi-palette2"></i>
                Versiones de la camiseta
              </h5>
              <Button variant="outline-primary" size="sm" onClick={addNewVersion}>
                <i className="bi bi-plus-circle me-2"></i>
                Añadir versión
              </Button>
            </div>

            {versions.map((version, index) => (
              <Card key={version.id} className="border-0 shadow-sm mb-3">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div className="d-flex align-items-start gap-2">
                      <Badge bg="primary">#{index + 1}</Badge>
                      <div>
                        <span className="fw-semibold d-block">{version.label || `Versión ${index + 1}`}</span>
                        <div className="d-flex align-items-center gap-2 small text-muted">
                          <span>Total disponible:</span>
                          <Badge bg={version.availableStock > 0 ? 'success' : 'secondary'}>
                            {version.availableStock > 0 ? `${version.availableStock} unidades` : 'Sin stock'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <Form.Check
                        type="radio"
                        name="defaultVersion"
                        label="Versión principal"
                        checked={defaultVersionId === version.id}
                        onChange={() => handleSetDefaultVersion(version.id)}
                      />
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeVersion(version.id)}
                        disabled={versions.length === 1}
                      >
                        <i className="bi bi-trash"></i>
                      </Button>
                    </div>
                  </div>

                  <Row className="g-3">
                    <Col md={4}>
                      <Form.Group className="mb-3">
                        <Form.Label>Nombre de la versión *</Form.Label>
                        <Form.Control
                          type="text"
                          value={version.label}
                          placeholder="Ej: Local, Visitante, Tercera"
                          onChange={(e) => handleVersionLabelChange(version.id, e.target.value)}
                        />
                      </Form.Group>

                      <Form.Group>
                        <Form.Label>Imagen principal *</Form.Label>
                        <Form.Control
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            handleVersionImageSelect(version.id, e.target.files);
                            e.target.value = '';
                          }}
                        />
                        <Form.Text className="text-muted">
                          Sube la foto de esta versión directamente desde tu computadora.
                        </Form.Text>
                        {(versionPreviews[version.id] || version.imageUrl) && (
                          <div className="mt-3 text-center">
                            <Image
                              src={versionPreviews[version.id] || version.imageUrl}
                              alt={version.label || `Previsualización versión ${index + 1}`}
                              fluid
                              rounded
                              className="border"
                            />
                            <Button
                              variant="link"
                              size="sm"
                              className="mt-2"
                              onClick={() => handleVersionImageClear(version.id)}
                            >
                              Quitar imagen
                            </Button>
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                    <Col md={8}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="fw-semibold">Stock por talla</span>
                        <Badge bg={version.availableStock > 0 ? 'success' : 'secondary'}>
                          {version.availableStock > 0 ? `${version.availableStock} en inventario` : 'Sin stock cargado'}
                        </Badge>
                      </div>
                      <Row className="g-2">
                        {JERSEY_SIZE_OPTIONS.map((size) => {
                          const entry = version.sizeStocks.find((item) => item.code === size.code) || {
                            code: size.code,
                            quantity: 0,
                          };

                          return (
                            <Col md={6} key={`${version.id}-${size.code}`}>
                              <Form.Group className="p-3 border rounded-3 bg-light-subtle h-100">
                                <Form.Label className="fw-semibold mb-1">{size.label}</Form.Label>
                                <InputGroup size="sm">
                                  <InputGroup.Text>Cantidad</InputGroup.Text>
                                  <Form.Control
                                    type="number"
                                    min={0}
                                    value={entry.quantity}
                                    onChange={(e) => handleVersionSizeQuantityChange(version.id, size.code, Number(e.target.value))}
                                    onBlur={(e) => handleVersionSizeQuantityChange(version.id, size.code, Number(e.target.value))}
                                  />
                                </InputGroup>
                                <Form.Text className="text-muted">{size.description}</Form.Text>
                              </Form.Group>
                            </Col>
                          );
                        })}
                      </Row>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            ))}
          </div>

          {/* Subcategoría, dependiente de la categoría seleccionada */}
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Subcategoría *</Form.Label>
                <Form.Select
                  value={formData.subcategory}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      subcategory: value,
                    }));
                  }}
                  disabled={!formData.category}
                  required
                >
                  <option value="">Selecciona una subcategoría</option>
                  {SUBCATEGORIES.filter((s) => s.id === formData.category).map((sub) => (
                    <option key={sub.value} value={sub.value}>
                      {sub.label}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  Define el rango de IDs y ayuda a organizar el inventario.
                </Form.Text>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3">
            <Form.Label>Descripción</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
            />
          </Form.Group>

          {/* Detalles */}
          <Form.Group className="mb-3">
            <Form.Label>Detalles del Producto</Form.Label>
            <div className="d-flex mb-2">
              <Form.Control
                type="text"
                placeholder="Ej: Hipoalergénico, Vitamina E, Libre de parabenos"
                value={newDetail}
                onChange={(e) => setNewDetail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addDetail())}
              />
              <Button variant="outline-primary" className="ms-2" onClick={addDetail}>
                <i className="bi bi-plus"></i>
              </Button>
            </div>
            <div className="d-flex flex-column gap-1">
              {formData.details.map((detail: string, index: number) => (
                <div key={index} className="d-flex align-items-center">
                  <span className="flex-grow-1">• {detail}</span>
                  <i 
                    className="bi bi-x text-danger" 
                    style={{ cursor: 'pointer' }}
                    onClick={() => removeDetail(index)}
                  ></i>
                </div>
              ))}
            </div>
          </Form.Group>

        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                {isEditing ? 'Actualizando...' : 'Creando...'}
              </>
            ) : (
              <>
                <i className="bi bi-save me-2"></i>
                {isEditing ? 'Actualizar Producto' : 'Crear Producto'}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
