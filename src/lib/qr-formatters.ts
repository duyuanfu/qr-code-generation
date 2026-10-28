import { VCardData, WiFiData } from '@/types/qr';

/**
 * Transforms UTF-16 JavaScript string into raw UTF-8 byte stream representation.
 * Solves the issue where qrcode-generator / qr-code-styling truncates charCode > 255,
 * ensuring WeChat, iOS Camera, and Android phones decode Chinese without mojibake.
 */
export function toQRCodeUTF8(str: string): string {
  if (!str) return '';
  try {
    return unescape(encodeURIComponent(str));
  } catch (e) {
    return str;
  }
}

/**
 * Builds a compliant vCard 3.0 string from form data.
 * Adheres strictly to RFC 2426 with CRLF (\r\n) line endings,
 * enabling WeChat, iOS, and Android Contacts apps to recognize and import contacts.
 */
export function buildVCardString(data: VCardData): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
  ];

  const lastName = (data.lastName || '').trim();
  const firstName = (data.firstName || '').trim();
  // Chinese name order: LastName + FirstName
  const fullName = [lastName, firstName].filter(Boolean).join('');

  if (fullName) {
    lines.push(`N;CHARSET=UTF-8:${lastName};${firstName};;;`);
    lines.push(`FN;CHARSET=UTF-8:${fullName}`);
  }

  if (data.organization) {
    lines.push(`ORG;CHARSET=UTF-8:${data.organization.trim()}`);
  }
  if (data.title) {
    lines.push(`TITLE;CHARSET=UTF-8:${data.title.trim()}`);
  }
  if (data.phone) {
    // Both standard TEL and CELL for mobile contacts compatibility
    lines.push(`TEL;TYPE=CELL,VOICE:${data.phone.trim()}`);
  }
  if (data.email) {
    lines.push(`EMAIL;TYPE=PREF,INTERNET:${data.email.trim()}`);
  }
  if (data.website) {
    lines.push(`URL:${data.website.trim()}`);
  }
  if (data.address) {
    lines.push(`ADR;TYPE=WORK;CHARSET=UTF-8:;;${data.address.trim()};;;;`);
  }

  lines.push('END:VCARD');
  // RFC 2426 requires CRLF line breaks
  return lines.join('\r\n');
}

/**
 * Builds a standard WiFi configuration string
 * Format: WIFI:S:<SSID>;T:<WPA|WEP|nopass>;P:<PASSWORD>;H:<true|false>;;
 */
export function buildWiFiString(data: WiFiData): string {
  const escapeStr = (str: string) => str.replace(/([\\;,:"])/g, '\\$1');
  const ssid = escapeStr(data.ssid);
  const pass = data.encryption === 'nopass' ? '' : escapeStr(data.password);
  const hidden = data.hidden ? 'true' : 'false';

  return `WIFI:S:${ssid};T:${data.encryption};P:${pass};H:${hidden};;`;
}

/**
 * Formats QR text based on content type
 */
export function formatQRContent(type: string, value: any): string {
  switch (type) {
    case 'url':
      return typeof value === 'string' && value.trim() ? value.trim() : 'https://example.com';
    case 'text':
      return typeof value === 'string' ? value : '';
    case 'vcard':
      return buildVCardString(value as VCardData);
    case 'wifi':
      return buildWiFiString(value as WiFiData);
    case 'image':
    case 'video':
    case 'file':
      return typeof value === 'string' ? value : '';
    default:
      return typeof value === 'string' ? value : '';
  }
}
