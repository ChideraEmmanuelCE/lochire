import { env } from 'cloudflare:workers';
import { handleRequest } from '../../../lib/service.mjs';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleRequest(request, env); }
export async function POST(request: Request) { return handleRequest(request, env); }
export async function OPTIONS(request: Request) { return handleRequest(request, env); }
