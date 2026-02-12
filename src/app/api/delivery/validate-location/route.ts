import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/app/utils/firebase';
import { checkRateLimit, getClientIP } from '@/app/utils/rateLimiter';
import { isValidEmail, isSafeString } from '@/app/utils/validation';
import { logAudit } from '@/app/utils/auditLogger';

interface DeliveryValidationRequest {
  latitude?: number;
  longitude?: number;
  zone?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface DeliveryZone {
  id: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  shippingCost: number;
  estimatedDays: number;
}

/**
 * Validate geographic coordinates are within valid Earth bounds
 */
function validateCoordinates(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Check if coordinates fall within a zone's bounding box
 */
function isPointInZone(lat: number, lng: number, zone: DeliveryZone): boolean {
  return (
    lat >= zone.minLat &&
    lat <= zone.maxLat &&
    lng >= zone.minLng &&
    lng <= zone.maxLng
  );
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitKey = `delivery-validation-${clientIP}`;
    
    const limitCheck = await checkRateLimit(rateLimitKey, {
      maxRequests: 20,
      windowMs: 60000,
    });
    
    if (!limitCheck.allowed) {
      await logAudit('DELIVERY_VALIDATE_RATE_LIMIT', { clientIP }, request, {
        status: 'blocked',
        severity: 'medium',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many location validation requests. Please try again later.',
          retryAfter: limitCheck.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': limitCheck.retryAfter?.toString() || '60',
          },
        }
      );
    }
    
    const body: DeliveryValidationRequest = await request.json();
    const { latitude, longitude, zone, city, address, phone, email } = body;
    
    // ✅ VALIDAR EMAIL SI ES PROPORCIONADO
    if (email) {
      const emailValidation = isValidEmail(email);
      if (!emailValidation.valid) {
        console.log('[DELIVERY-VALIDATE] Email inválido:', emailValidation.reason);
        await logAudit('DELIVERY_VALIDATE_INVALID_EMAIL', { email, reason: emailValidation.reason }, request, {
          status: 'failed',
          severity: 'low',
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid email',
            message: emailValidation.reason || 'Email format is invalid',
          },
          { status: 400 }
        );
      }
    }

    // ✅ VALIDAR DIRECCIÓN SI ES PROPORCIONADA
    if (address) {
      if (!isSafeString(address, 200)) {
        console.log('[DELIVERY-VALIDATE] Dirección sospechosa:', address);
        await logAudit('DELIVERY_VALIDATE_UNSAFE_ADDRESS', { address: 'redacted', email }, request, {
          status: 'failed',
          severity: 'medium',
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid address',
            message: 'Address contains invalid characters or is too long',
          },
          { status: 400 }
        );
      }
    }

    // ✅ VALIDAR TELÉFONO SI ES PROPORCIONADO
    if (phone) {
      if (typeof phone !== 'string' || phone.length < 7 || phone.length > 20 || !/^\+?[\d\s\-()]+$/.test(phone)) {
        console.log('[DELIVERY-VALIDATE] Teléfono inválido:', phone);
        await logAudit('DELIVERY_VALIDATE_INVALID_PHONE', { email }, request, {
          status: 'failed',
          severity: 'low',
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid phone',
            message: 'Phone number format is invalid',
          },
          { status: 400 }
        );
      }
    }
    
    // Validate input - must have either coordinates or zone info
    if ((latitude === undefined || longitude === undefined) && !zone) {
      await logAudit('DELIVERY_VALIDATE_MISSING_DATA', { email }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Missing location data',
          message: 'Provide either coordinates (latitude/longitude) or zone information',
        },
        { status: 400 }
      );
    }
    
    // Query delivery zones
    const zonesRef = collection(db, 'deliveryZones');
    const querySnapshot = await getDocs(zonesRef);
    
    if (querySnapshot.empty) {
      await logAudit('DELIVERY_VALIDATE_NO_ZONES', { email }, request, {
        status: 'failed',
        severity: 'high',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'No delivery zones configured',
          message: 'Delivery service is not available at this time',
        },
        { status: 503 }
      );
    }
    
    let matchingZone: DeliveryZone | null = null;
    
    // If coordinates provided, use them to find zone
    if (latitude !== undefined && longitude !== undefined) {
      // Validate coordinates are valid numbers within Earth bounds
      if (!validateCoordinates(latitude, longitude)) {
        await logAudit('DELIVERY_VALIDATE_INVALID_COORDS', { latitude, longitude, email }, request, {
          status: 'failed',
          severity: 'low',
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid coordinates',
            message: 'Coordinates must be valid (latitude: -90 to 90, longitude: -180 to 180)',
          },
          { status: 400 }
        );
      }
      
      // Find zone by coordinates
      querySnapshot.forEach((doc) => {
        const zoneData = { id: doc.id, ...doc.data() } as DeliveryZone;
        if (isPointInZone(latitude, longitude, zoneData)) {
          matchingZone = zoneData;
        }
      });
    } else if (zone) {
      // Find zone by name - first try exact match, then partial match
      const zoneLower = zone.toLowerCase().trim();
      const cityLower = city?.toLowerCase().trim() || '';
      
      // 1️⃣ INTENTAR COINCIDENCIA EXACTA
      querySnapshot.forEach((doc) => {
        const zoneData = { id: doc.id, ...doc.data() } as DeliveryZone;
        if (zoneData.name.toLowerCase() === zoneLower) {
          matchingZone = zoneData;
        }
      });
      
      // 2️⃣ SI NO ENCONTRÓ, BUSCAR POR CIUDAD Y PALABRA CLAVE
      if (!matchingZone && cityLower) {
        querySnapshot.forEach((doc) => {
          const zoneData = { id: doc.id, ...doc.data() } as DeliveryZone;
          const zoneName = zoneData.name.toLowerCase();
          
          // Si la ciudad está en el nombre de la zona, coincide
          if (zoneName.includes(cityLower)) {
            // Si se especificó más de una palabra en zone, buscar esas palabras también
            const zoneKeywords = zoneLower.split(/\s+/).filter(w => w.length > 2);
            const hasKeywords = zoneKeywords.length === 0 || 
              zoneKeywords.some(kw => zoneName.includes(kw));
              
            if (hasKeywords) {
              matchingZone = zoneData;
            }
          }
        });
      }
      
      // Log detalle para debugging
      console.log('[DELIVERY-VALIDATE] Zone search:', {
        searchZone: zoneLower,
        searchCity: cityLower,
        found: matchingZone ? matchingZone.name : 'NO MATCH',
        availableZones: querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: (doc.data() as any).name
        }))
      });
    }
    
    if (!matchingZone) {
      await logAudit('DELIVERY_VALIDATE_LOCATION_NOT_SUPPORTED', { zone, email }, request, {
        status: 'failed',
        severity: 'low',
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Location not supported',
          message: 'The selected location is not within our delivery zones',
          zone,
          ...(latitude && longitude && { coordinates: { latitude, longitude } }),
        },
        { status: 400 }
      );
    }
    
    // Log successful validation
    console.log(`✅ Location validated: ${matchingZone.name}${latitude && longitude ? ` (${latitude}, ${longitude})` : ''}`);
    
    await logAudit('DELIVERY_VALIDATE_SUCCESS', { zone: matchingZone.name, email }, request, {
      status: 'success',
      severity: 'low',
    });
    
    return NextResponse.json(
      {
        success: true,
        valid: true,
        zone: {
          id: matchingZone.id,
          name: matchingZone.name,
          shippingCost: matchingZone.shippingCost,
          estimatedDays: matchingZone.estimatedDays,
        },
        ...(latitude && longitude && { coordinates: { latitude, longitude } }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delivery validation error:', error);
    
    await logAudit('DELIVERY_VALIDATE_ERROR', { error: String(error) }, request, {
      status: 'failed',
      severity: 'high',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        message: error instanceof Error ? error.message : 'An error occurred during location validation',
      },
      { status: 500 }
    );
  }
}
