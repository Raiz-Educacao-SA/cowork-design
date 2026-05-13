import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { localNetworkAccessHeaders } from './src/integrations/raiz/local-network-access';

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = localNetworkAccessHeaders(origin);

  if (request.method === 'OPTIONS') {
    if (headers) return new NextResponse(null, { status: 204, headers });
    return NextResponse.next();
  }

  const response = NextResponse.next();
  if (headers) {
    headers.forEach((value, key) => response.headers.set(key, value));
  }
  return response;
}

export const config = {
  matcher: '/:path*',
};
