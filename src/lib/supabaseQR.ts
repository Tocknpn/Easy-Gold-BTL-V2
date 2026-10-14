import { createClient } from '@supabase/supabase-js';

// Dedicated Supabase connection for the "QR code Download tracking" database
const qrSupabaseUrl =
  import.meta.env.VITE_QR_SUPABASE_URL || 'https://dijswodliksqchohozkx.supabase.co';

const qrSupabaseKey =
  import.meta.env.VITE_QR_SUPABASE_KEY ||
  import.meta.env.VITE_QR_SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpanN3b2RsaWtzcWNob2hvemt4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTM2MTY1OCwiZXhwIjoyMTA2OTM3NjU4fQ.UukqJ0Vtrw2HNjanYLu_axWSPPF3xXPZGXgXfUNqNQM';

export const supabaseQR = createClient(qrSupabaseUrl, qrSupabaseKey, {
  auth: { persistSession: false },
});

export interface QRScanRecord {
  id: string;
  campaign_id: string;
  device_fingerprint?: string;
  os_type: 'ios' | 'android' | 'other' | string;
  user_agent: string;
  ip_address: string;
  created_at: string;
}

/**
 * Returns a composite identifier combining IP address and User Agent.
 * Used to count distinct physical devices as requested.
 */
export function getDeviceFingerprint(scan: { ip_address?: string; user_agent?: string }): string {
  const ip = (scan.ip_address || '').trim();
  const ua = (scan.user_agent || '').trim();
  return `${ip}___${ua}`;
}

/**
 * Categorizes a campaign ID into a team (Agency, KPV, or Direct/Other)
 */
export function getTeamFromCampaign(campaignId: string): 'Agency' | 'KPV' | 'Direct/Other' {
  const c = (campaignId || '').toLowerCase();
  if (c.includes('agency') || c.includes('team-b')) return 'Agency';
  if (c.includes('kpv') || c.includes('marketing') || c.includes('team-a')) return 'KPV';
  return 'Direct/Other';
}

/**
 * Humanizes raw user agent strings into readable device & browser names
 */
export function parseUserAgentDevice(ua: string = '', os: string = ''): string {
  if (!ua) return os.toUpperCase() || 'Unknown Device';
  
  // iOS detection
  if (/iPhone/i.test(ua)) {
    const verMatch = ua.match(/OS (\d+[._]\d+)/i);
    const ver = verMatch ? `iOS ${verMatch[1].replace('_', '.')}` : 'iOS';
    return `Apple iPhone (${ver})`;
  }
  if (/iPad/i.test(ua)) {
    return 'Apple iPad';
  }
  if (/Android/i.test(ua)) {
    const brandMatch = ua.match(/;\s*([^;]+?)\s*Build/i);
    const verMatch = ua.match(/Android\s*([\d.]+)/i);
    const brand = brandMatch ? brandMatch[1].trim() : '';
    const ver = verMatch ? `Android ${verMatch[1]}` : 'Android';
    return brand ? `${brand} (${ver})` : `Android Device (${ver})`;
  }
  if (/Windows/i.test(ua)) {
    return 'Windows PC';
  }
  if (/Macintosh/i.test(ua)) {
    return 'Mac OS';
  }
  return os ? os.toUpperCase() : 'Web Browser';
}

/**
 * Fetches all QR scan records from the QR tracking Supabase database
 */
export async function fetchQRScans(): Promise<{ data: QRScanRecord[] | null; error: any }> {
  try {
    const { data, error } = await supabaseQR
      .from('qr_scans')
      .select('*')
      .order('created_at', { ascending: false });

    return { data, error };
  } catch (err: any) {
    return { data: null, error: err };
  }
}
