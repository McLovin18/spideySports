'use client';

import React, { useState, useEffect , useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Container, Row, Col, Button, Form, Tabs, Tab, Badge, Card } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import NavbarComponent from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';
import LoginRequired from '../../components/LoginRequired';
import { addFavourite, removeFavourite, getUserFavourites, addProductComment, getProductComments, updateProductRating, addReplyToComment } from '../../services/purchaseService';
import allProducts from '../productsData';
import FavouriteButton from '../../components/FavouriteButton';
import Footer from "../../components/Footer";
import { recommendationEngine, type Product } from '../../services/recommendationService';
import { cartService, type CartItem } from '../../services/cartService';
import { inventoryService, type ProductInventory, type JerseyVersion, type SizeStock } from '../../services/inventoryService';
import ProductStockIndicator from '../../components/ProductStockIndicator';
import { getSeasonalDiscountConfig, type SeasonalDiscountConfig, getProductSeasonalDiscountPercent } from '../../services/seasonalDiscountService';
import { jerseySizeLabel, type JerseySizeCode } from '../../constants/jersey';

// Función para convertir ProductInventory a Product
const convertInventoryToProduct = (inventory: ProductInventory): Product => {
  // Mapeo de categorías a sus rutas correspondientes
  const categoryLinkMap: { [key: string]: string } = {
    clubKits: '/categories/liga-espanola',
    nationalTeams: '/categories/europe',
    specialEditions: '/categories/limited-edition',
    retroClassics: '/categories/retro-90s',
    trainingLifestyle: '/categories/pre-match',
    goalkeeperKits: '/categories/club-goalkeeper',
    youthKits: '/categories/kids-clubs'
  };
  
  const categoryLink = categoryLinkMap[inventory.category || ''] || '/productos';
  const versions: JerseyVersion[] = Array.isArray(inventory.versions) ? inventory.versions : [];
  const defaultVersionId = inventory.defaultVersionId ?? (versions[0]?.id ?? null);
  const sizeOptions = Array.isArray(inventory.sizeStocks)
    ? inventory.sizeStocks.map((size) => ({
        code: size.code,
        label: jerseySizeLabel(size.code),
        quantity: size.quantity ?? 0,
      }))
    : [];

  const resolvedImages = Array.isArray(inventory.images) && inventory.images.length > 0
    ? inventory.images
    : ['/images/product1.svg'];
  
  return {
    id: inventory.productId,
    name: inventory.name,
    price: inventory.price,
    images: resolvedImages,
    category: inventory.category || 'Sin categoría',
    categoryLink: categoryLink,
    description: inventory.description || '',
    inStock: inventory.stock > 0 && inventory.isActive,
    details: inventory.details || [],
    featured: false,
    versions,
    defaultVersionId,
    sizeOptions,
  };
};

// 🔹 Fallback de recomendaciones cuando la IA no devuelve resultados
const getFallbackRecommendations = (currentProduct: Product, count: number): Product[] => {
  const allAvailableProducts = allProducts.filter(p => p.inStock && p.id !== currentProduct.id);
  return allAvailableProducts.slice(0, count);
};

// 🔹 Helpers simples para similitud de nombres
const STOP_WORDS = new Set([
  'de','la','el','y','para','con','a','en','del','las','los','por','un','una'
]);

const tokenizeName = (text: string): string[] => {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .split(/[^a-z0-9]+/i)
    .filter(t => t && !STOP_WORDS.has(t));
};

const getNameSimilarity = (a: Product, b: Product): number => {
  const aTokens = new Set(tokenizeName(a.name));
  const bTokens = new Set(tokenizeName(b.name));
  if (!aTokens.size || !bTokens.size) return 0;

  let common = 0;
  aTokens.forEach(t => { if (bTokens.has(t)) common++; });
  return common / Math.min(aTokens.size, bTokens.size); // 0–1
};

const ProductDetailPage = () => {
  // Control de comentarios y respuestas visibles
  //constantes y variables
  const INITIAL_COMMENTS_TO_SHOW = 3;
  const INITIAL_REPLIES_TO_SHOW = 2;
  const [commentsToShow, setCommentsToShow] = useState(INITIAL_COMMENTS_TO_SHOW);
  const [repliesToShow, setRepliesToShow] = useState<{ [key: number]: number }>({});
  const [isFavourite, setIsFavourite] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [smartRecommendations, setSmartRecommendations] = useState<Product[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);
  // Comentarios por producto (Firestore)
  const [rating, setRating] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [averageRating, setAverageRating] = useState(0);
  const [replyText, setReplyText] = useState<{ [key: number]: string | undefined }>({}); // para respuestas
  // Estado para mostrar el botón y picker de emojis en comentario principal
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = React.useRef<HTMLButtonElement>(null);
  const emojiPickerRef = React.useRef<HTMLDivElement>(null);
  const [showCommentActions, setShowCommentActions] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { user } = useAuth();
  const params = useParams();
  const productId = Number(params.id);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('details');
  const [addSuccess, setAddSuccess] = useState(false);
  const [stockAvailable, setStockAvailable] = useState<boolean>(true);
  const [stockAmount, setStockAmount] = useState<number>(0);
  const [product, setProduct] = useState<Product | undefined>(undefined);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [seasonalConfig, setSeasonalConfig] = useState<SeasonalDiscountConfig | null>(null);
  const [loadingSeasonal, setLoadingSeasonal] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedSizeCode, setSelectedSizeCode] = useState<JerseySizeCode | null>(null);

  const [replyEmojiState, setReplyEmojiState] = useState<{ [key: number]: { button?: boolean; picker?: boolean } }>({});
  const replyEmojiButtonRefs = React.useRef<{ [key: number]: HTMLButtonElement | null }>({});
  const replyEmojiPickerRefs = React.useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Función para mostrar más comentarios
  const handleShowMoreComments = () => {
    setCommentsToShow((prev) => prev + INITIAL_COMMENTS_TO_SHOW);
  };

  // Función para mostrar más respuestas de un comentario
  const handleShowMoreReplies = (idx: number, totalReplies: number) => {
    setRepliesToShow((prev) => ({
      ...prev,
      [idx]: Math.min((prev[idx] || INITIAL_REPLIES_TO_SHOW) + INITIAL_REPLIES_TO_SHOW, totalReplies)
    }));
  };

  
  // ✅ Buscar producto priorizando inventario (precio y datos actualizados) con fallback a productos estáticos
  useEffect(() => {
    const findProduct = async () => {
      setLoadingProduct(true);

      let foundProduct: Product | undefined;

      try {
        // Primero intentar obtenerlo desde el inventario (fuente de verdad para precio/stock)
        const inventoryProducts = await inventoryService.getAllProducts();
        const inventoryProduct = inventoryProducts.find((p: ProductInventory) => p.productId === productId);

        if (inventoryProduct) {
          foundProduct = convertInventoryToProduct(inventoryProduct);
        } else {
          // Si no existe en inventario, usar definición estática
          foundProduct = allProducts.find(p => p.id === productId);
        }
      } catch (error) {
        console.error('Error buscando producto:', error);
        // En caso de error con inventario, al menos intentar con la lista estática
        foundProduct = allProducts.find(p => p.id === productId);
      }

      if (!foundProduct) {
        setSelectedVersionId(null);
        setSelectedSizeCode(null);
        setProduct(undefined);
        setLoadingProduct(false);
        return;
      }

      setProduct(foundProduct);
      setCurrentImageIndex(0);
      setSelectedVersionId(null);
      setSelectedSizeCode(null);
      setLoadingProduct(false);
    };

    if (productId) {
      findProduct();
    }
  }, [productId]);
  


  // ✅ Verificar stock disponible cuando cambie el producto o la cantidad
  useEffect(() => {
    const checkStock = async () => {
      if (!product?.id) return;

      const versions: JerseyVersion[] = Array.isArray((product as any).versions)
        ? (product as any).versions
        : [];

      if (versions.length > 1 && !selectedVersionId) {
        setStockAvailable(false);
        setStockAmount(0);
        return;
      }

      const activeVersionId =
        versions.length === 1
          ? versions[0].id
          : (selectedVersionId ?? undefined);
      const versionRecord = activeVersionId
        ? versions.find((version) => version.id === activeVersionId)
        : undefined;

      if (versions.length > 0 && (!activeVersionId || !versionRecord)) {
        setStockAvailable(false);
        setStockAmount(0);
        return;
      }

      const versionHasSizes = Boolean(
        versionRecord?.sizeStocks?.some((size) => (size.quantity ?? 0) > 0)
      );

      const aggregatedSizes = Array.isArray((product as any).sizeOptions)
        ? (product as any).sizeOptions
        : [];
      const productHasSizes = aggregatedSizes.some((size: { quantity?: number }) => (size.quantity ?? 0) > 0);

      if (versionRecord && (versionRecord.availableStock ?? 0) <= 0) {
        setStockAvailable(false);
        setStockAmount(0);
        return;
      }

      let effectiveSize: JerseySizeCode | undefined;

      if (versionHasSizes) {
        const availableCodes = versionRecord!.sizeStocks
          .filter((size) => (size.quantity ?? 0) > 0)
          .map((size) => size.code as JerseySizeCode);

        if (!selectedSizeCode || !availableCodes.includes(selectedSizeCode)) {
          setStockAvailable(false);
          setStockAmount(0);
          return;
        }

        effectiveSize = selectedSizeCode;
      } else if (!versions.length && productHasSizes) {
        const availableCodes = aggregatedSizes
          .filter((size: { quantity?: number }) => (size.quantity ?? 0) > 0)
          .map((size: { code: JerseySizeCode }) => size.code as JerseySizeCode);

        if (!selectedSizeCode || !availableCodes.includes(selectedSizeCode)) {
          setStockAvailable(false);
          setStockAmount(0);
          return;
        }

        effectiveSize = selectedSizeCode;
      }

      try {
        const stock = await inventoryService.getProductStock(
          product.id,
          effectiveSize,
          activeVersionId ?? undefined
        );
        const isAvailable = await inventoryService.isProductAvailable(
          product.id,
          quantity,
          effectiveSize,
          activeVersionId ?? undefined
        );

        setStockAmount(stock);
        setStockAvailable(isAvailable && stock > 0);
      } catch (error) {
        console.error('Error verificando stock:', error);
        setStockAvailable(false);
        setStockAmount(0);
      }
    };

    const timeoutId = setTimeout(checkStock, 300);
    return () => clearTimeout(timeoutId);
  }, [product, quantity, selectedVersionId, selectedSizeCode]);

  useEffect(() => {
    if (!product) {
      return;
    }

    if (!product) {
      if (selectedSizeCode !== null) {
        setSelectedSizeCode(null);
      }
      return;
    }

    const versions: JerseyVersion[] = Array.isArray((product as any).versions)
      ? (product as any).versions
      : [];

    if (versions.length > 0) {
      if (!selectedVersionId) {
        if (selectedSizeCode !== null) {
          setSelectedSizeCode(null);
        }
        return;
      }

      const versionRecord = versions.find((version) => version.id === selectedVersionId);
      if (!versionRecord) {
        if (selectedSizeCode !== null) {
          setSelectedSizeCode(null);
        }
        return;
      }

      const availableCodes = versionRecord.sizeStocks
        ?.filter((size) => (size.quantity ?? 0) > 0)
        .map((size) => size.code as JerseySizeCode) ?? [];

      if (availableCodes.length === 0) {
        if (selectedSizeCode !== null) {
          setSelectedSizeCode(null);
        }
        return;
      }

      if (!selectedSizeCode) {
        return;
      }

      if (!availableCodes.includes(selectedSizeCode)) {
        setSelectedSizeCode(null);
      }
      return;
    }

    const aggregatedSizes = Array.isArray((product as any).sizeOptions)
      ? (product as any).sizeOptions
      : [];

    const availableAggregatedCodes = aggregatedSizes
      .filter((size: { quantity?: number }) => (size.quantity ?? 0) > 0)
      .map((size: { code: JerseySizeCode }) => size.code as JerseySizeCode);

    if (availableAggregatedCodes.length === 0) {
      if (selectedSizeCode !== null) {
        setSelectedSizeCode(null);
      }
      return;
    }

    if (!selectedSizeCode) {
      return;
    }

    if (!availableAggregatedCodes.includes(selectedSizeCode)) {
      setSelectedSizeCode(null);
    }
  }, [product, selectedVersionId, selectedSizeCode]);

  const versions: JerseyVersion[] = useMemo(() => (
    product && Array.isArray((product as any).versions)
      ? ((product as any).versions as JerseyVersion[])
      : []
  ), [product]);

  const currentVersion = useMemo(() => {
    if (!versions.length || !selectedVersionId) return undefined;
    return versions.find((version) => version.id === selectedVersionId);
  }, [versions, selectedVersionId]);

  const productImages = useMemo(() => (product?.images ?? []), [product]);

  const availableSizes = useMemo(() => {
    if (versions.length > 0) {
      if (!currentVersion) {
        return [] as Array<{ code: JerseySizeCode; label: string; quantity: number }>;
      }

      return (currentVersion.sizeStocks || [])
        .filter((size) => (size.quantity ?? 0) > 0)
        .map((size) => ({
          code: size.code as JerseySizeCode,
          label: jerseySizeLabel(size.code as JerseySizeCode),
          quantity: size.quantity ?? 0,
        }));
    }

    if (product && Array.isArray((product as any).sizeOptions)) {
      return ((product as any).sizeOptions as Array<{ code: JerseySizeCode; label?: string; quantity?: number }>)
        .filter((size) => (size.quantity ?? 0) > 0)
        .map((size) => ({
          code: size.code as JerseySizeCode,
          label: size.label || jerseySizeLabel(size.code as JerseySizeCode),
          quantity: size.quantity ?? 0,
        }));
    }

    return [] as Array<{ code: JerseySizeCode; label: string; quantity: number }>;
  }, [versions, currentVersion, product]);

  const versionOptions = useMemo(
    () =>
      versions.map((version) => ({
        version,
        isAvailable: (version.availableStock ?? 0) > 0 && (version.isActive ?? true),
      })),
    [versions]
  );

  const hasAvailableVersions = versionOptions.some((option) => option.isAvailable);

  const sizeSelectionRequired = availableSizes.length > 0;
  const versionSelectionRequired = versions.length > 1;
  const shouldRenderSizeBlock = sizeSelectionRequired && (!versionSelectionRequired || !!selectedVersionId);
  const selectionComplete = (!versionSelectionRequired || !!selectedVersionId) && (!sizeSelectionRequired || !!selectedSizeCode);
  const disableAddToCart = !selectionComplete || !stockAvailable;

  useEffect(() => {
    if (!currentVersion?.imageUrl) return;
    const index = productImages.findIndex((img) => img === currentVersion.imageUrl);
    if (index >= 0 && index !== currentImageIndex) {
      setCurrentImageIndex(index);
    }
  }, [currentVersion, productImages, currentImageIndex]);

  const handleVersionSelect = useCallback((versionId: string) => {
    setSelectedVersionId((prev) => {
      if (prev !== versionId) {
        setSelectedSizeCode(null);
      }
      return versionId;
    });
    const candidate = versions.find((version) => version.id === versionId);
    if (!candidate?.imageUrl) {
      return;
    }

    const index = productImages.findIndex((img) => img === candidate.imageUrl);
    if (index >= 0) {
      setCurrentImageIndex(index);
    }
  }, [versions, productImages]);

  useEffect(() => {
    if (versions.length === 1) {
      const soleVersion = versions[0];
      if (selectedVersionId !== soleVersion.id) {
        handleVersionSelect(soleVersion.id);
      }
    }
  }, [versions, selectedVersionId, handleVersionSelect]);

  const handleSizeSelect = useCallback((sizeCode: JerseySizeCode) => {
    setSelectedSizeCode(sizeCode);
  }, [setSelectedSizeCode]);

  const renderAddToCartContent = useCallback(() => {
    if (!selectionComplete) {
      if (sizeSelectionRequired && !selectedSizeCode) {
        return (
          <>
            <i className="bi bi-arrow-down-circle me-2"></i>
            Selecciona tu talla
          </>
        );
      }

      if (versionSelectionRequired && !selectedVersionId) {
        return (
          <>
            <i className="bi bi-arrow-down-circle me-2"></i>
            Selecciona versión
          </>
        );
      }
    }

    if (!stockAvailable) {
      if (stockAmount === 0) {
        return (
          <>
            <i className="bi bi-x-circle me-2"></i>
            Sin stock
          </>
        );
      }

      return (
        <>
          <i className="bi bi-exclamation-triangle me-2"></i>
          Stock insuficiente
        </>
      );
    }

    return (
      <>
        <i className="bi bi-cart-plus me-2"></i>
        Añadir al carrito
      </>
    );
  }, [selectionComplete, sizeSelectionRequired, selectedSizeCode, versionSelectionRequired, selectedVersionId, stockAvailable, stockAmount]);


  // Cerrar el emoji picker solo si se hace clic fuera del input, botón y picker
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        emojiButtonRef.current && emojiButtonRef.current.contains(target)
      ) {
        return;
      }
      if (
        emojiPickerRef.current && emojiPickerRef.current.contains(target)
      ) {
        return;
      }
      setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);
  // Estado para mostrar el botón y picker de emojis en cada campo de respuesta
  // Estado para controlar el flujo de emoji en cada reply
  // Estado para controlar el emoji en cada reply: { idx: { button: bool, picker: bool } }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(replyEmojiState).forEach(idxStr => {
        const idx = Number(idxStr);
        if (!replyEmojiState[idx]?.picker) return;
        const btnRef = replyEmojiButtonRefs.current[idx];
        const pickerRef = replyEmojiPickerRefs.current[idx];
        if (btnRef && btnRef.contains(event.target as Node)) return;
        if (pickerRef && pickerRef.contains(event.target as Node)) return;
        setReplyEmojiState(prev => ({ ...prev, [idx]: { ...prev[idx], picker: false } }));
      });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [replyEmojiState]);
  const emojiList = [
    "😀","😂","😍","👍","🙏","🔥","🎉","😎","🥳","😢","😡","❤️","🤩","👏","😅","😇","😜","🤔","🙌","💯","😱","😏","😃","😆","😋","😌","😔","😤","😩","😬","😳","😵","😭","😰","😓","😪","😴","😷","🤒","🤕","🤢","🤧","🤠","🤡","🤥","🤫","🤭","🧐","🤓","😈","👿","👹","👺","💀","👻","👽","🤖","💩","😺","😸","😹","😻","😼","😽","🙀","😿","😾"
  ];



  const updateFavouriteState = useCallback(async () => {
    if (!user?.uid || !product?.id) {
      setIsFavourite(false);
      return;
    }
  
    // 🔥 Siempre obtener favoritos del usuario actual desde Firestore
    const favs = await getUserFavourites(user.uid);
    const fav = favs.some((item: any) => item.id == product.id);
    setIsFavourite(fav);
  }, [user?.uid, product?.id]);
  
  useEffect(() => {
    updateFavouriteState();
  }, [updateFavouriteState]);

  // Cargar configuración pública de descuentos de temporada
  useEffect(() => {
    const loadSeasonal = async () => {
      try {
        setLoadingSeasonal(true);
        const config = await getSeasonalDiscountConfig();
        setSeasonalConfig(config);
      } catch (err) {
        console.error('Error cargando configuración de descuentos de temporada en detalle de producto:', err);
      } finally {
        setLoadingSeasonal(false);
      }
    };

    loadSeasonal();
  }, []);

  // Cargar recomendaciones inteligentes cuando cambie el producto
  useEffect(() => {
    const loadSmartRecommendations = async () => {
      if (!product) return;

      setLoadingRecommendations(true);
      const RECOMMENDATION_COUNT = 3;

      try {
        // Pequeño delay opcional para ver el spinner
        await new Promise(resolve => setTimeout(resolve, 400));

        // 1) Unificar catálogo estático + inventario
        const inventoryRaw = await inventoryService.getAllProducts();
        const inventoryProducts: Product[] = inventoryRaw
          .filter((p: ProductInventory) => p.isActive && p.stock > 0)
          .map(convertInventoryToProduct);

        const candidatesMap = new Map<string | number, Product>();
        [...allProducts, ...inventoryProducts].forEach(p => {
          if (!p) return;
          candidatesMap.set(p.id, p);
        });

        let candidates = Array.from(candidatesMap.values())
          .filter(p => p.id !== product.id && p.inStock);

        if (!candidates.length) {
          setSmartRecommendations([]);
          return;
        }

        const currentCategory = (product.category || '').toLowerCase();

        // 2) Intentar primero con el motor actual, pero filtrando por relevancia
        let engineRecs: Product[] = [];
        try {
          const raw = recommendationEngine.getSmartRecommendations(product.id, RECOMMENDATION_COUNT) || [];
          engineRecs = raw
            .map(r => candidatesMap.get(r.id) || r) // usar versión unificada si existe
            .filter(r =>
              r.id !== product.id &&
              r.inStock &&
              (r.category || '').toLowerCase() === currentCategory // misma categoría
            );
        } catch {
          engineRecs = [];
        }

        // 3) Pool por categoría (si existe al menos otro en la misma categoría)
        const sameCategory = candidates.filter(
          p => (p.category || '').toLowerCase() === currentCategory
        );
        const pool = sameCategory.length ? sameCategory : candidates;

        // 4) Ordenar pool por similitud de nombre y luego por precio parecido
        const sortedPool = [...pool].sort((a, b) => {
          const simA = getNameSimilarity(product, a);
          const simB = getNameSimilarity(product, b);
          if (simB !== simA) return simB - simA;

          const diffA = Math.abs(a.price - product.price);
          const diffB = Math.abs(b.price - product.price);
          return diffA - diffB;
        });

        // 5) Construir lista final: primero lo del engine filtrado, luego rellenar con pool
        const final: Product[] = [];
        const usedIds = new Set<string | number>();

        for (const rec of engineRecs) {
          if (final.length >= RECOMMENDATION_COUNT) break;
          if (usedIds.has(rec.id)) continue;
          final.push(rec);
          usedIds.add(rec.id);
        }

        for (const cand of sortedPool) {
          if (final.length >= RECOMMENDATION_COUNT) break;
          if (usedIds.has(cand.id)) continue;
          final.push(cand);
          usedIds.add(cand.id);
        }

        setSmartRecommendations(final.slice(0, RECOMMENDATION_COUNT));
      } catch (error) {
        console.error('❌ Error al cargar recomendaciones:', error);
        setSmartRecommendations([]);
      } finally {
        setLoadingRecommendations(false);
      }
    };

    loadSmartRecommendations();
  }, [product]);

  // Migrar carrito desde localStorage cuando el usuario esté autenticado
  useEffect(() => {
    const migrateCartIfNeeded = async () => {
      if (!user?.uid) return;
      
      try {
        await cartService.migrateFromLocalStorage(user.uid);
      } catch (error) {
        console.error('❌ Error durante la migración del carrito:', error);
      }
    };

    migrateCartIfNeeded();
  }, [user?.uid]);

  const discountInfo = React.useMemo(() => {
    if (!product || loadingSeasonal || !seasonalConfig) return null;

    const percent = getProductSeasonalDiscountPercent(seasonalConfig, product.id);
    if (!percent || percent <= 0) return null;

    const discountedPrice = Math.max(0, product.price * (1 - percent / 100));
    return { discountPercent: percent, discountedPrice };
  }, [product, seasonalConfig, loadingSeasonal]);



  const handleAddToFavourites = async () => {
    if (!user?.uid || !product) return;
  
    if (isFavourite) {
      await removeFavourite(user.uid, product.id);
    } else {
      await addFavourite(user.uid, {
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.images?.[0] || "/images/product1.svg",
      });
    }

    window.dispatchEvent(new Event("favourites-updated"));


  
    // 🔥 Volvemos a cargar favoritos desde Firestore
    await updateFavouriteState();
  };
  


  // Cargar comentarios desde Firestore
  useEffect(() => {
    const fetchComments = async () => {
      if (!product?.id) return;
      setLoadingComments(true);
      const fetched = await getProductComments(product.id);

      const mappedComments = fetched.map((c: any) => ({
        id: c.id,
        name: c.name || "Usuario",
        text: c.text || "",
        date: c.date || "",
        rating: c.rating || 0,
        replies: c.replies || [],
        photoURL: c.photoURL || "/new_user.png"
      }));
      
      setComments(mappedComments);

      // 🔹 Calcular promedio (por si no existe en Firestore)
      if (mappedComments.length > 0) {
        const avg = mappedComments.reduce((acc, c) => acc + (c.rating || 0), 0) / mappedComments.length;
        setAverageRating(avg);
      } else {
        setAverageRating(0);
      }
  
      setLoadingComments(false);
    };
  
    fetchComments();
  }, [product?.id]);
  

  // Guardar comentario en Firestore
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    let error = "";
    if (!user) return;
    if (!commentText.trim()) return;
    if (rating < 1) {
      error = 'Por favor selecciona una calificación antes de comentar';
      setErrorMessage(error);
      setTimeout(() => {
        setErrorMessage("");
      }, 2000);
      return;
    }

    try {
      const newComment = {
        name: user.displayName || "Usuario",
        text: commentText.trim(),
        date: new Date().toISOString(),
        rating,
        replies: [],
        photoURL: user.photoURL || "/new_user.png", // 🔹 Se guarda la foto de perfil
      };

      if (!product) return;

      await addProductComment(product.id, newComment);

      // Reset campos antes de actualizar comentarios
      setCommentText("");
      setRating(0);
      setErrorMessage("");

      // 🔹 Obtener comentarios actualizados
      const fetched = await getProductComments(product.id);
      const mappedComments = fetched.map((c: any) => ({
        id: c.id, // ✅ IMPORTANTE: incluir el ID
        name: c.name || "Usuario",
        text: c.text || "",
        date: c.date || "",
        rating: c.rating || 0,
        replies: c.replies || [],
        photoURL: c.photoURL || "/new_user.png"
      }));
      setComments(mappedComments);

      // 🔹 Calcular y guardar promedio (con manejo de errores)
      try {
        const avg = mappedComments.reduce((acc, c) => acc + (c.rating || 0), 0) / mappedComments.length;
        setAverageRating(avg);
        await updateProductRating(product.id, avg);
      } catch (ratingError) {
        // No mostrar error al usuario, el comentario se guardó correctamente
      }
      
    } catch (error) {
      console.error('❌ Error al enviar comentario:', error);
      setErrorMessage('Error al enviar el comentario. Inténtalo de nuevo.');
    }
  };
  


  const handleReply = async (commentIndex: number) => {
    try {
      const replyMessage = replyText[commentIndex]?.trim();
      if (!replyMessage || !user || !product) {
        return;
      }

      const reply = {
        name: user.displayName || "Usuario",
        text: replyMessage,
        date: new Date().toISOString(),
        photoURL: user.photoURL || "/new_user.png"
      };

      // 🔹 Obtener ID real del comentario y verificar que existe
      const comment = comments[commentIndex];
      
      if (!comment) {
        console.error("❌ Comentario no encontrado en índice:", commentIndex);
        return;
      }
      
      if (!comment.id) {
        console.error("❌ Comentario sin ID:", comment);
        return;
      }
      
      // Agregar la respuesta a Firestore
      const success = await addReplyToComment(product.id, comment.id, reply);
      
      if (!success) {
        console.error("❌ Error al guardar respuesta en Firestore");
        return;
      }

      // 🔹 Recargar comentarios desde Firestore
      const fetched = await getProductComments(product.id);
      const mappedComments = fetched.map((c: any) => ({
        id: c.id,
        name: c.name || "Usuario",
        text: c.text || "",
        date: c.date || "",
        rating: c.rating || 0,
        replies: c.replies || [],
        photoURL: c.photoURL || "/new_user.png"
      }));
      
      setComments(mappedComments);

      // Limpiar y ocultar el campo de respuesta y emoji después de responder
      setReplyText((prev) => {
        const updated = { ...prev };
        delete updated[commentIndex];
        return updated;
      });
      setReplyEmojiState(prev => {
        const updated = { ...prev };
        delete updated[commentIndex];
        return updated;
      });

    } catch (error) {
      console.error("❌ Error al enviar respuesta:", error);
    }
  };


  
  const handleAddToCart = async () => {
    setErrorMessage("");

    if (!product) {
      setErrorMessage("Error: Producto no cargado");
      return;
    }

    if (quantity < 1) {
      setErrorMessage("La cantidad debe ser mayor a 0");
      return;
    }

    if (versionSelectionRequired && (!selectedVersionId || !currentVersion)) {
      setErrorMessage('Selecciona una versión disponible.');
      return;
    }

    if (sizeSelectionRequired && !selectedSizeCode) {
      setErrorMessage('Selecciona una talla disponible.');
      return;
    }

    if (!stockAvailable) {
      setErrorMessage(`Solo hay ${stockAmount} unidades disponibles`);
      return;
    }

    const effectivePrice = discountInfo?.discountedPrice ?? product.price;
    const cartVersion = currentVersion || (selectedVersionId ? versions.find((version) => version.id === selectedVersionId) : undefined);
    const versionIdForCart = cartVersion?.id;
    const sizeCodeForCart = sizeSelectionRequired ? selectedSizeCode ?? undefined : undefined;
    const cartImage = cartVersion?.imageUrl?.trim()
      ? cartVersion.imageUrl
      : product.images?.[0] || "/images/product1.svg";

    const cartItem: Omit<CartItem, 'userId' | 'dateAdded'> = {
      id: product.id,
      name: product.name,
      price: effectivePrice,
      image: cartImage,
      quantity,
      versionId: versionIdForCart,
      versionLabel: cartVersion?.label,
      sizeCode: sizeCodeForCart,
    };

    try {
      await cartService.addToCart(user?.uid || '', cartItem);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 3000);
      setQuantity(1);
    } catch (error: any) {
      console.error("Error adding to cart:", error);
      setErrorMessage(error.message || "Error al agregar el producto al carrito");
    }
  };





  // Si no se encuentra el producto, mostrar mensaje de error
  if (!product) {
    return (
      <div className="d-flex flex-column min-vh-100">
        <Container className="py-5 flex-grow-1 text-center">
          <i className="bi bi-exclamation-circle" style={{ fontSize: '3rem' }}></i>
          <h2 className="mt-3">Producto no encontrado</h2>
          <p className="text-muted">El producto que estás buscando no existe o ha sido eliminado.</p>
          <Button as={Link} href="/products" className="btn-outline-cosmetic-primary mt-3 rounded-1 px-4">
            Ver todos los productos
          </Button>
        </Container>
        
        <footer className="bg-cosmetic-secondary text-cosmetic-tertiary py-5 border-top">
          <Container>
            <Row>
              <Col md={3}>
                <h5 className="fw-bold mb-3">Comprar</h5>
                <ul className="list-unstyled">
                  <li className="mb-2"><Link href="/products/mujer" className="text-cosmetic-tertiary text-decoration-none">Mujer</Link></li>
                  <li className="mb-2"><Link href="/products/hombre" className="text-cosmetic-tertiary text-decoration-none">Hombre</Link></li>
                  <li className="mb-2"><Link href="/products/ninos" className="text-cosmetic-tertiary text-decoration-none">Niños</Link></li>
                  <li className="mb-2"><Link href="/products/bebe" className="text-cosmetic-tertiary text-decoration-none">Bebé</Link></li>
                  <li className="mb-2"><Link href="/products/sport" className="text-cosmetic-tertiary text-decoration-none">Sport</Link></li>
                </ul>
              </Col>
              <Col md={3}>
                <h5 className="fw-bold mb-3">Información Corporativa</h5>
                <ul className="list-unstyled">
                  <li className="mb-2"><Link href="/about" className="text-cosmetic-tertiary text-decoration-none">Acerca de nosotros</Link></li>
                  <li className="mb-2"><Link href="/sustainability" className="text-cosmetic-tertiary text-decoration-none">Sostenibilidad</Link></li>
                  <li className="mb-2"><Link href="/press" className="text-cosmetic-tertiary text-decoration-none">Sala de prensa</Link></li>
                  <li className="mb-2"><Link href="/investors" className="text-cosmetic-tertiary text-decoration-none">Relación con inversores</Link></li>
                </ul>
              </Col>
              <Col md={3}>
                <h5 className="fw-bold mb-3">Ayuda</h5>
                <ul className="list-unstyled">
                  <li className="mb-2"><Link href="/customer-service" className="text-cosmetic-tertiary text-decoration-none">Servicio al cliente</Link></li>
                  <li className="mb-2"><Link href="/my-account" className="text-cosmetic-tertiary text-decoration-none">Mi cuenta</Link></li>
                  <li className="mb-2"><Link href="/store-locator" className="text-cosmetic-tertiary text-decoration-none">Encontrar tiendas</Link></li>
                  <li className="mb-2"><Link href="/legal" className="text-cosmetic-tertiary text-decoration-none">Términos legales</Link></li>
                </ul>
              </Col>
              <Col md={3}>
                <h5 className="fw-bold mb-3">Únete a nosotros</h5>
                <p>Recibe noticias sobre nuevas colecciones y ofertas exclusivas</p>
                <div className="d-flex gap-3 mt-3">
                  <Link href="#" className="text-cosmetic-tertiary fs-5"><i className="bi bi-facebook"></i></Link>
                  <Link href="#" className="text-cosmetic-tertiary fs-5"><i className="bi bi-instagram"></i></Link>
                  <Link href="#" className="text-cosmetic-tertiary fs-5"><i className="bi bi-twitter"></i></Link>
                  <Link href="#" className="text-cosmetic-tertiary fs-5"><i className="bi bi-youtube"></i></Link>
                </div>
              </Col>
            </Row>
            <hr className="my-4" />
            <div className="text-center">
              <p className="small">&copy; {new Date().getFullYear()} Fashion Store. Todos los derechos reservados.</p>
            </div>
          </Container>
        </footer>
      </div>
    );
  }

  // Mostrar pantalla de carga mientras se busca el producto
  if (loadingProduct) {
    return (
      <div className="d-flex flex-column min-vh-100">
        <NavbarComponent />
        <main className="flex-grow-1 d-flex align-items-center justify-content-center">
          <Container>
            <div className="text-center">
              <div className="spinner-border text-cosmetic-primary mb-3" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
              <h5 className="text-muted">Cargando producto...</h5>
            </div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  // Mostrar mensaje de error si no se encuentra el producto
  if (!product) {
    return (
      <div className="d-flex flex-column min-vh-100">
        <NavbarComponent />
        <main className="flex-grow-1 d-flex align-items-center justify-content-center">
          <Container>
            <div className="text-center">
              <i className="bi bi-exclamation-triangle-fill text-warning mb-3" style={{ fontSize: '4rem' }}></i>
              <h3 className="mb-3">Producto no encontrado</h3>
              <p className="text-muted mb-4">
                Lo sentimos, el producto que buscas no existe o ha sido eliminado.
              </p>
              <Button 
                as={Link} 
                href="/products" 
                className="btn-cosmetic-primary rounded-pill px-4"
              >
                Ver todos los productos
              </Button>
            </div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="d-flex flex-column min-vh-100" style={{backgroundColor: "var(--cosmetic-secondary)"}}>
      <main>
        <Container className="py-5">
          <Row className="g-5 align-items-center">
            <Col xs={12} md={6} style={{ width: '40%' }}>
              <Card className="border-0 shadow-sm bg-cosmetic-secondary">
                <div className="position-relative bg-cosmetic-secondary product-image-background" style={{ width: '300px', height: '450px', margin: '0 auto', background: 'rgba(5, 44, 51, 0.92) !important', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '1rem 1rem 0 0', overflow: 'hidden' }}>
                  {discountInfo && (
                    <div
                      className="position-absolute"
                      style={{
                        top: '0.8rem',
                        right: '0.8rem',
                        transform: 'rotate(8deg)',
                        backgroundColor: '#e53935',
                        color: '#fff',
                        padding: '0.55rem 1.9rem',
                        borderRadius: '0.8rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2
                      }}
                    >
                      <span
                        style={{
                          fontSize: '1.6rem',
                          fontWeight: 800,
                          lineHeight: 1
                        }}
                      >
                        -{discountInfo.discountPercent}%
                      </span>
                      <span
                        style={{
                          fontSize: '0.85rem',
                          letterSpacing: '0.14em',
                          fontWeight: 600
                        }}
                      >
                        OFF
                      </span>
                    </div>
                  )}
                  {product.images && product.images.length > 0 && (
                    <>
                      <Image
                        src={product.images[currentImageIndex]}
                        alt={product.name}
                        fill
                        style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                      />
                      {product.images.length > 1 && (
                        <>
                          <button
                            onClick={() => setCurrentImageIndex((prev) => prev === 0 ? product.images.length - 1 : prev - 1)}
                            style={{
                              position: 'absolute',
                              left: 10,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'rgba(0,0,0,0.4)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 32,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              zIndex: 2
                            }}
                            aria-label="Imagen anterior"
                          >
                            &#8592;
                          </button>
                          <button
                            onClick={() => setCurrentImageIndex((prev) => prev === product.images.length - 1 ? 0 : prev + 1)}
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'rgba(0,0,0,0.4)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 32,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              zIndex: 2
                            }}
                            aria-label="Imagen siguiente"
                          >
                            &#8594;
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </Card>
              {versionSelectionRequired && (
                <div className="mt-4">
                  <h6 className="fw-semibold mb-2">Selecciona la versión</h6>
                  <div className="d-flex flex-wrap gap-2">
                    {versionOptions.map(({ version, isAvailable }) => {
                      const isSelected = selectedVersionId === version.id;
                      return (
                        <button
                          key={version.id}
                          type="button"
                          className="btn rounded-1 px-3 py-2 text-start"
                          style={{
                            backgroundColor: isSelected ? 'var(--cosmetic-primary)' : '#fff',
                            color: isSelected ? '#fff' : '#212529',
                            border: `1px solid ${isSelected ? 'var(--cosmetic-primary)' : '#d1d5db'}`,
                            opacity: isAvailable ? 1 : 0.55,
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            boxShadow: isSelected ? '0 6px 12px rgba(0,0,0,0.14)' : '0 2px 6px rgba(0,0,0,0.05)',
                            transition: 'all 0.18s ease-in-out',
                            minWidth: '140px'
                          }}
                          onClick={() => {
                            if (isAvailable) {
                              handleVersionSelect(version.id);
                            }
                          }}
                          disabled={!isAvailable}
                          aria-pressed={isSelected}
                        >
                          <span className="fw-semibold d-block">{version.label || 'Versión'}</span>
                          <small className="text-muted">
                            {isAvailable ? `${version.availableStock ?? 0} en stock` : 'Agotada'}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  {hasAvailableVersions && !selectedVersionId && (
                    <div className="text-muted small mt-2">
                      Selecciona una versión para ver tallas disponibles.
                    </div>
                  )}
                  {!hasAvailableVersions && (
                    <div className="text-muted small mt-2">
                      No hay versiones con stock disponible en este momento.
                    </div>
                  )}
                </div>
              )}
            </Col>
            <Col xs={12} md={6}>
              <h2 className="fw-bold mb-3">{product.name}</h2>
              <div className="d-flex align-items-center gap-3 mb-3">
                <div className="fw-bold fs-3 mb-0" style={{ color: "var(--cosmetic-primary)" }}>
                  {discountInfo ? (
                    <>
                      <span
                        style={{
                          textDecoration: 'line-through',
                          color: '#888',
                          fontSize: '1.05rem',
                          marginRight: '0.75rem'
                        }}
                      >
                        ${product.price.toFixed(2)}
                      </span>
                      <span>
                        ${discountInfo.discountedPrice.toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <>${product.price.toFixed(2)}</>
                  )}
                </div>
                <ProductStockIndicator productId={product.id} />
              </div>
              <div className="mb-4">{product.description}</div>
              {shouldRenderSizeBlock && (
                <div className="mb-4">
                  <h6 className="fw-semibold mb-2">Selecciona tu talla</h6>
                  <div className="d-flex flex-wrap gap-2">
                    {availableSizes.map((size) => {
                      const isSelected = selectedSizeCode === size.code;
                      return (
                        <button
                          key={size.code}
                          type="button"
                          className="btn rounded-1 px-3 py-2 text-start"
                          style={{
                            backgroundColor: isSelected ? 'var(--cosmetic-primary)' : '#fff',
                            color: isSelected ? '#fff' : '#212529',
                            border: `1px solid ${isSelected ? 'var(--cosmetic-primary)' : '#d1d5db'}`,
                            boxShadow: isSelected ? '0 6px 12px rgba(0,0,0,0.14)' : '0 2px 6px rgba(0,0,0,0.05)',
                            transition: 'all 0.18s ease-in-out',
                            minWidth: '110px'
                          }}
                          onClick={() => handleSizeSelect(size.code)}
                          aria-pressed={isSelected}
                        >
                          <span className="fw-semibold d-block">{size.label}</span>
                          <small className="text-muted">
                            {size.quantity} disponibl{size.quantity === 1 ? 'e' : 'es'}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!sizeSelectionRequired && versionSelectionRequired && selectedVersionId && (
                <div className="text-muted small mb-4">
                  No hay tallas con stock disponible para esta versión.
                </div>
              )}
              <div className="mb-4">
                <Form.Group className="mb-3">
                  <Form.Label>Cantidad</Form.Label>
                  <Form.Control type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="rounded-1" />
                </Form.Group>
              </div>
              {/* Alertas de stock */}
              {!stockAvailable && stockAmount === 0 && (
                <div className="alert alert-danger text-center mb-3" role="alert">
                  <i className="bi bi-x-circle-fill me-2"></i>
                  <strong>Producto sin stock</strong> - No disponible para compra
                </div>
              )}
              {!stockAvailable && stockAmount > 0 && (
                <div className="alert alert-warning text-center mb-3" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  <strong>Stock insuficiente</strong> - Disponible: {stockAmount} unidades, solicitado: {quantity}
                </div>
              )}
              
              {addSuccess && (
                <div className="alert alert-success text-center" role="alert">
                  Producto añadido correctamente a tu carrito
                </div>
              )}
              {/* El error de calificación solo se muestra debajo del comentario, no aquí */}
              {/* Otros errores de carrito sí se muestran aquí */}
              {errorMessage && errorMessage !== 'Por favor selecciona una calificación antes de comentar' && (
                <div className="alert alert-danger text-center" role="alert">
                  {errorMessage}
                </div>
              )}
              <div className="d-flex gap-2 align-items-stretch">
                <Button 
                  className={disableAddToCart ? "btn-cosmetic-secondary w-100 rounded-1 mb-3" : "btn-cosmetic-primary w-100 rounded-1 mb-3"} 
                  size="lg" 
                  onClick={handleAddToCart}
                  disabled={disableAddToCart}
                >
                  {renderAddToCartContent()}
                </Button>
                <FavouriteButton product={product} size="lg" fullHeight />
              </div>
            </Col>
          </Row>
        </Container>
      </main>

      {/* Sección de comentarios */}
      <div className="my-5">
        <Container className="product-comments-container">
          <div className="product-comments-summary">
            <h5 className="fw-bold mb-2">Calificación promedio:</h5>
            <div
              className="product-rating-display"
              aria-label={`Calificación promedio ${averageRating.toFixed(1)} de 5`}
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const full = star <= Math.floor(averageRating);
                const half = star === Math.ceil(averageRating) && averageRating % 1 >= 0.5;
                const fillWidth = full ? "100%" : half ? "50%" : "0%";

                return (
                  <span key={star} className="rating-star-shell">
                    <span className="rating-star-base">★</span>
                    <span className="rating-star-fill" style={{ width: fillWidth }}>★</span>
                  </span>
                );
              })}
              <span className="product-rating-value">({averageRating.toFixed(1)}/5)</span>
            </div>
          </div>

          <h3 className="fw-bold mb-4">Comentarios</h3>

          {user ? (
            <Form
              onSubmit={handleAddComment}
              className="mb-4 p-3 rounded shadow-sm product-comment-form"
            >
              <Row className="g-3 align-items-start">
                <Col xs={12} className="d-flex align-items-start gap-3">
                  <div className="product-comment-avatar">
                    <Image
                      src={user?.photoURL || "/new_user.png"}
                      alt="avatar"
                      width={40}
                      height={40}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div className="flex-grow-1">
                    <Form.Group className="w-100 mb-3">
                      <Form.Label className="mb-2" style={{ fontWeight: 500, fontSize: "0.98rem" }}>
                        Calificación
                      </Form.Label>
                      <div className="product-rating-input">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            role="button"
                            tabIndex={0}
                            className={`rating-input-star ${star <= rating ? "is-active" : ""}`}
                            onClick={() => setRating(star)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setRating(star);
                              }
                            }}
                            aria-label={`Calificar con ${star} estrella${star > 1 ? "s" : ""}`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </Form.Group>
                    <Form.Group className="w-100 mb-0">
                      <Form.Label className="mb-2" style={{ fontWeight: 500, fontSize: "0.98rem" }}>
                        Comentario
                      </Form.Label>
                      <div className="product-comment-input-shell">
                        <Form.Control
                          as="textarea"
                          rows={1}
                          className="youtube-input"
                          style={{
                            resize: "vertical",
                            minHeight: "38px",
                            maxHeight: "120px",
                            fontSize: "1rem",
                            padding: "8px 42px 8px 0px",
                          }}
                          value={commentText}
                          onChange={(e) => {
                            setCommentText(e.target.value);
                            if (!showCommentActions) setShowCommentActions(true);
                          }}
                          placeholder="Escribe un comentario..."
                          maxLength={200}
                          onFocus={() => setShowCommentActions(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              setCommentText((prev) => prev + "\n");
                            }
                          }}
                        />
                        {showEmojiPicker && (
                          <div ref={emojiPickerRef} className="product-comment-emoji-picker">
                            {emojiList.map((emoji) => (
                              <span
                                key={emoji}
                                className="product-comment-emoji"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setCommentText((prev) => prev + emoji);
                                }}
                              >
                                {emoji}
                              </span>
                            ))}
                          </div>
                        )}
                        {showCommentActions && (
                          <div className="product-comment-actions">
                            <button
                              type="button"
                              ref={emojiButtonRef}
                              className="product-comment-emoji-trigger"
                              title="Agregar emoji"
                              onClick={() => setShowEmojiPicker((prev) => !prev)}
                            >
                              😊
                            </button>
                            <div className="product-comment-actions-buttons">
                              <Button
                                type="button"
                                variant="link"
                                className="product-comments-action"
                                onClick={() => {
                                  setCommentText("");
                                  setShowCommentActions(false);
                                  setShowEmojiPicker(false);
                                }}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="submit"
                                className="btn-cosmetic-primary d-inline-flex align-items-center gap-2"
                                disabled={!commentText.trim()}
                              >
                                <i className="bi bi-chat-left-text" style={{ fontSize: "1.05rem" }}></i>
                                Comentar
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      {errorMessage === "Por favor selecciona una calificación antes de comentar" && (
                        <div className="text-danger mt-2" style={{ fontSize: "0.95rem" }}>
                          {errorMessage}
                        </div>
                      )}
                    </Form.Group>
                  </div>
                </Col>
              </Row>
            </Form>
          ) : (
            <div className="mb-4 p-3 rounded shadow-sm product-comment-form text-center">
              <p className="mb-3 product-comment-text">
                Inicia sesión para dejar un comentario sobre este producto.
              </p>
              <Button as={Link} href="/auth/login" className="btn-cosmetic-primary rounded-1">
                Inicia sesión para comentar
              </Button>
            </div>
          )}

          {loadingComments ? (
            <div className="text-center py-4 product-comments-feedback">
              <span className="spinner-border spinner-border-sm me-2"></span>
              Cargando comentarios...
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-4 product-comments-feedback">
              Aún no hay comentarios para este producto.
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {comments.slice(0, commentsToShow).map((c, idx) => (
                <div key={idx} className="product-comment-card">
                  <div className="product-comment-avatar">
                    <Image
                      src={c.photoURL || "/new_user.png"}
                      alt={c.name}
                      width={40}
                      height={40}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div className="flex-grow-1">
                    <div className="product-comment-meta">
                      <span className="product-comment-author">{c.name}</span>
                      <span
                        className="product-comment-stars"
                        aria-label={`Calificación de ${c.rating} sobre 5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`rating-static-star ${star <= c.rating ? "is-active" : ""}`}
                          >
                            ★
                          </span>
                        ))}
                      </span>
                      <span className="product-comment-date">
                        {new Date(c.date).toLocaleString()}
                      </span>
                    </div>
                    <p className="product-comment-text">{c.text}</p>

                    {c.replies && c.replies.length > 0 && (
                      <div className="product-comment-replies">
                        {c.replies
                          .slice(0, repliesToShow[idx] || INITIAL_REPLIES_TO_SHOW)
                          .map((r: any, i: number) => (
                            <div key={i} className="product-comment-reply-card">
                              <div className="product-comment-reply-avatar">
                                <Image
                                  src={r.photoURL || "/new_user.png"}
                                  alt={r.name}
                                  width={28}
                                  height={28}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              </div>
                              <div>
                                <div className="product-comment-reply-meta">
                                  <span className="product-comment-author">{r.name}</span>
                                  <span className="product-comment-date">
                                    {new Date(r.date).toLocaleString()}
                                  </span>
                                </div>
                                <p className="product-comment-reply-text">{r.text}</p>
                              </div>
                            </div>
                          ))}
                        {c.replies.length > (repliesToShow[idx] || INITIAL_REPLIES_TO_SHOW) && (
                          <Button
                            variant="link"
                            className="product-comments-action"
                            onClick={() => handleShowMoreReplies(idx, c.replies.length)}
                          >
                            Ver más respuestas ({c.replies.length - (repliesToShow[idx] || INITIAL_REPLIES_TO_SHOW)})
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="link"
                        className="product-comments-action"
                        onClick={() =>
                          setReplyText((prev) => ({
                            ...prev,
                            [idx]: prev[idx] === undefined ? "" : undefined,
                          }))
                        }
                      >
                        Responder
                      </Button>
                    </div>

                    {replyText[idx] !== undefined && (
                      <div style={{ position: "relative" }}>
                        <Form
                          className="mt-2 product-comment-reply-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleReply(idx);
                          }}
                        >
                          <Form.Control
                            className="mb-2 youtube-input"
                            style={{
                              minHeight: "32px",
                              maxHeight: "80px",
                              fontSize: "0.98rem",
                              resize: "vertical",
                              padding: "6px 42px 6px 0px",
                            }}
                            value={replyText[idx] || ""}
                            onChange={(e) =>
                              setReplyText((prev) => ({ ...prev, [idx]: e.target.value }))
                            }
                            placeholder="Responder..."
                            onFocus={() => {
                              if (!replyEmojiState[idx]?.button) {
                                setReplyEmojiState((prev) => ({
                                  ...prev,
                                  [idx]: { button: true, picker: false },
                                }));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                setReplyText((prev) => ({
                                  ...prev,
                                  [idx]: (prev[idx] || "") + "\n",
                                }));
                              }
                            }}
                          />
                          {replyEmojiState[idx]?.button && (
                            <button
                              type="button"
                              ref={(el) => {
                                replyEmojiButtonRefs.current[idx] = el;
                              }}
                              className="product-comment-emoji-trigger product-comment-reply-emoji"
                              title="Agregar emoji"
                              onClick={() =>
                                setReplyEmojiState((prev) => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], picker: !prev[idx]?.picker },
                                }))
                              }
                            >
                              😊
                            </button>
                          )}
                          {replyEmojiState[idx]?.picker && (
                            <div
                              ref={(el) => {
                                replyEmojiPickerRefs.current[idx] = el;
                              }}
                              className="product-comment-emoji-picker product-comment-reply-picker"
                            >
                              {emojiList.map((emoji) => (
                                <span
                                  key={emoji}
                                  className="product-comment-emoji"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setReplyText((prev) => ({
                                      ...prev,
                                      [idx]: (prev[idx] || "") + emoji,
                                    }));
                                  }}
                                >
                                  {emoji}
                                </span>
                              ))}
                            </div>
                          )}
                          <Button
                            size="sm"
                            type="submit"
                            className="btn-cosmetic-primary d-inline-flex align-items-center gap-2 product-comment-reply-submit"
                          >
                            <i className="bi bi-reply" style={{ fontSize: "1rem" }}></i>
                            Responder
                          </Button>
                        </Form>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {comments.length > commentsToShow && (
                <div className="text-center mt-3">
                  <Button
                    variant="link"
                    className="product-comments-action"
                    onClick={handleShowMoreComments}
                  >
                    Ver más comentarios ({comments.length - commentsToShow})
                  </Button>
                </div>
              )}
            </div>
          )}
        </Container>
      </div>





      <div className="my-5">
        <Container>
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => k && setActiveTab(k)}
            className="mb-4"
          >
            <Tab eventKey="details" title="Detalles">
              <div className="p-4 bg-light">
                <h5 className="fw-bold mb-3">Características del producto</h5>
                <ul>
                  {Array.isArray(product.details) && product.details.length > 0 ? (
                    product.details.map((detail, index) => (
                      <li key={index} className="mb-2">{detail}</li>
                    ))
                  ) : (
                    <li className="mb-2 text-muted">Sin detalles adicionales</li>
                  )}
                </ul>
                <p className="mt-3 mb-0">Referencia: {product.id.toString().padStart(6, '0')}</p>
              </div>
            </Tab>
            <Tab eventKey="shipping" title="Envío y devoluciones">
              <div className="p-4 bg-light">
                <h5 className="fw-bold mb-3">Información de envío</h5>
                <p>Envío 1-2: días hábiles</p>
                
                <h5 className="fw-bold mb-3 mt-4">Política de devoluciones</h5>
                <p>Tienes 30 días para devolver tu compra. Los artículos deben estar en su estado original con las etiquetas intactas.</p>
              </div>
            </Tab>
          </Tabs>
        </Container>
      </div>

      
      {/* Productos recomendados inteligentes */}
      <div className="my-5">
        <Container>
          <div className="d-flex align-items-center mb-4">
            <h3 className="fw-bold mb-0 me-3">Productos recomendados para ti</h3>
            <div className="d-flex align-items-center text-muted">
              <i className="bi bi-robot me-2" style={{ fontSize: '1.2rem' }}></i>
              <small>Seleccionados por IA</small>
            </div>
          </div>
          
          {loadingRecommendations ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Cargando recomendaciones...</span>
              </div>
              <p className="text-muted">Analizando productos similares...</p>
            </div>
          ) : (
            <Row>
              {smartRecommendations.length > 0 ? (
                smartRecommendations
                  .filter((recommendedProduct) => recommendedProduct && recommendedProduct.id !== undefined) // 🛡️ filtrar nulos
                  .map((recommendedProduct) => (
                    <Col key={recommendedProduct.id} md={4} className="mb-4">
                      <Card className="h-100 shadow-sm border-0 product-recommendation-card">
                        <div className="position-relative overflow-hidden" style={{ height: '350px' }}>
                          <Image 
                            src={recommendedProduct.images?.[0] ?? '/images/product1.svg'}  // 🛡️ proteger images[0]
                            alt={recommendedProduct.name || 'Producto recomendado'} 
                            fill 
                            style={{ objectFit: 'cover' }}
                            className="product-image"
                          />
                          {/* Badge de recomendación */}
                          <Badge 
                            bg="primary" 
                            className="position-absolute top-0 start-0 m-2 px-2 py-1"
                            style={{ fontSize: '0.7rem' }}
                          >
                            <i className="bi bi-stars me-1"></i>
                            Recomendado
                          </Badge>
                          
                          {/* Overlay con acciones */}
                          <div className="position-absolute bottom-0 start-0 w-100 p-3 bg-gradient" style={{ 
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' 
                          }}>
                            <div className="d-flex justify-content-between align-items-center">
                              <Button 
                                as={Link} 
                                href={`/products/${recommendedProduct.id}`} 
                                variant="light" 
                                className="rounded-pill px-3 py-1 fw-bold"
                                size="sm"
                              >
                                Ver Detalles
                              </Button>
                              <FavouriteButton product={recommendedProduct} />
                            </div>
                          </div>
                        </div>
                        
                        <Card.Body className="p-3">
                          <h6 className="fw-bold mb-1 text-truncate">
                            {recommendedProduct.name || 'Producto'}
                          </h6>
                          {recommendedProduct.category && (
                            <p className="text-muted small mb-2">
                              {recommendedProduct.category}
                            </p>
                          )}

                          {/* Indicadores de similitud para cosméticos */}
                          <div className="mt-2">
                            <div className="d-flex flex-wrap gap-1">
                              {recommendedProduct.category &&
                                product?.category &&
                                recommendedProduct.category.toLowerCase() === product.category.toLowerCase() && (
                                  <Badge bg="success" className="small">Misma categoría</Badge>
                                )}

                              {Array.isArray(recommendedProduct.details) &&
                                Array.isArray(product?.details) &&
                                recommendedProduct.details.some(detail => 
                                  product.details!.some(productDetail => 
                                    detail.toLowerCase().includes('hidratante') &&
                                    productDetail.toLowerCase().includes('hidratante')
                                  )
                                ) && (
                                  <Badge bg="info" className="small">Beneficios similares</Badge>
                                )}

                              {typeof recommendedProduct.price === 'number' &&
                                typeof product?.price === 'number' &&
                                Math.abs(recommendedProduct.price - product.price) <= product.price * 0.3 && (
                                  <Badge bg="warning" className="small">Precio similar</Badge>
                                )}
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))
              ) : (
                <div className="text-center py-5">
                  <i className="bi bi-search" style={{ fontSize: '3rem', color: '#ccc' }}></i>
                  <h5 className="mt-3 text-muted">No se encontraron recomendaciones</h5>
                  <p className="text-muted">Intenta explorar otros productos de nuestro catálogo.</p>
                  <Button 
                    as={Link} 
                    href="/products" 
                    variant="outline-primary" 
                    className="mt-2 rounded-pill px-4"
                  >
                    Ver todos los productos
                  </Button>
                </div>
              )}
            </Row>
          )}
        </Container>
      </div>

    {/* Footer */}
      <Footer/>
    </div>
  );
};

export default ProductDetailPage;