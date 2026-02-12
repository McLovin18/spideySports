/**
 * ?? API ENDPOINT - Storage Monitoring
 * 
 * NOTE: This endpoint requires Firebase Admin SDK which is only available in Cloud Functions.
 * It is NOT used by the e-commerce store and can be safely disabled during Next.js build.
 * 
 * This is a monitoring/analytics endpoint only - does NOT affect:
 * ? Shopping cart
 * ? Checkout
 * ? Payments
 * ? Delivery system
 * ? Order creation
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/storage/monitoring
 * Monitoring endpoint (requires Admin SDK - not available in Next.js)
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: false,
    message: 'Storage monitoring requires Firebase Admin SDK. Use Cloud Functions for production monitoring.',
    details: {
      endpoint: 'Monitoring only',
      tier: 'Cloud Functions',
      impact: 'Not used by store',
      affectedFeatures: []
    },
    available: false
  }, { status: 501 });
}
