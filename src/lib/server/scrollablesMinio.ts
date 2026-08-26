import * as Minio from "minio";
import { config } from 'dotenv';

config({ path: '.env' });

// Scrollables live on their own MinIO instance (a Raspberry Pi, exposed
// publicly via Cloudflare Tunnel at SCROLLABLES_PUBLIC_CDN_URL) rather than
// the main app's S3_BUCKET_NAME instance. Deliberately a separate client,
// not a second bucket on the same instance — the whole point is that this
// storage lives on different hardware you control directly, so an outage
// or resize on the Pi doesn't touch the main image/avatar CDN and vice
// versa.
//
// Talking to it goes through the public tunnel hostname just like a
// browser would (SCROLLABLES_MINIO_ENDPOINT), not a private LAN address —
// unless this app happens to run on the same network as the Pi, in which
// case point SCROLLABLES_MINIO_ENDPOINT at the Pi's LAN IP instead and
// skip the tunnel round-trip for uploads. Either works; the tunnel
// hostname is the one guaranteed to work regardless of where this app is
// deployed.
export const scrollablesMinioClient = new Minio.Client({
	endPoint: process.env.SCROLLABLES_MINIO_ENDPOINT!,
	port: process.env.SCROLLABLES_MINIO_PORT ? parseInt(process.env.SCROLLABLES_MINIO_PORT) : 443,
	useSSL: process.env.SCROLLABLES_MINIO_USE_SSL !== 'false',
	accessKey: process.env.SCROLLABLES_MINIO_ACCESS_KEY!,
	secretKey: process.env.SCROLLABLES_MINIO_SECRET_KEY!,
});

export const SCROLLABLES_BUCKET = process.env.SCROLLABLES_S3_BUCKET_NAME!;
