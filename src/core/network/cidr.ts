// =====================================================================
// CIDR MATH — IP/subnet calculations (no external deps)
// Used by IPAM: calculate total/usable addresses, generate IP ranges,
// validate CIDR, convert between notations.
// =====================================================================

/**
 * Validate an IPv4 address string.
 */
export function isValidIp(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

/**
 * Validate a CIDR prefix (0-32).
 */
export function isValidCidr(cidr: number): boolean {
  return cidr >= 0 && cidr <= 32;
}

/**
 * Validate "network/cidr" notation.
 */
export function isValidCidrNotation(notation: string): boolean {
  const parts = notation.split("/");
  if (parts.length !== 2) return false;
  return isValidIp(parts[0]) && isValidCidr(Number(parts[1]));
}

/**
 * Convert an IP string to a 32-bit unsigned integer.
 */
export function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Convert a 32-bit unsigned integer to an IP string.
 */
export function intToIp(int: number): string {
  return [
    (int >>> 24) & 0xff,
    (int >>> 16) & 0xff,
    (int >>> 8) & 0xff,
    int & 0xff,
  ].join(".");
}

/**
 * Calculate total addresses in a subnet (2^(32-cidr)).
 */
export function totalAddresses(cidr: number): number {
  if (cidr === 32) return 1;
  return Math.pow(2, 32 - cidr);
}

/**
 * Calculate usable addresses (total - 2 for network + broadcast, except /31 and /32).
 */
export function usableAddresses(cidr: number): number {
  if (cidr === 32) return 1;
  if (cidr === 31) return 2; // point-to-point
  return totalAddresses(cidr) - 2;
}

/**
 * Get the network address from an IP and CIDR.
 */
export function getNetworkAddress(ip: string, cidr: number): string {
  const ipInt = ipToInt(ip);
  if (cidr === 0) return "0.0.0.0";
  const mask = (0xffffffff << (32 - cidr)) >>> 0;
  return intToIp(ipInt & mask);
}

/**
 * Get the broadcast address from an IP and CIDR.
 */
export function getBroadcastAddress(ip: string, cidr: number): string {
  const ipInt = ipToInt(ip);
  if (cidr === 0) return "255.255.255.255";
  const mask = (0xffffffff << (32 - cidr)) >>> 0;
  return intToIp((ipInt & mask) | (~mask >>> 0));
}

/**
 * Get the first usable host IP.
 */
export function getFirstHost(ip: string, cidr: number): string {
  if (cidr === 32) return ip;
  return intToIp(ipToInt(getNetworkAddress(ip, cidr)) + 1);
}

/**
 * Get the last usable host IP.
 */
export function getLastHost(ip: string, cidr: number): string {
  if (cidr === 32) return ip;
  if (cidr === 31) return getBroadcastAddress(ip, cidr);
  return intToIp(ipToInt(getBroadcastAddress(ip, cidr)) - 1);
}

/**
 * Generate all usable IP addresses in a subnet (limited to prevent memory issues).
 */
export function listUsableIps(network: string, cidr: number, limit = 500): string[] {
  const total = usableAddresses(cidr);
  if (total === 0) return [];
  const first = ipToInt(getFirstHost(network, cidr));
  const last = ipToInt(getLastHost(network, cidr));

  if (total <= limit) {
    const ips: string[] = [];
    for (let ip = first; ip <= last; ip++) {
      ips.push(intToIp(ip));
    }
    return ips;
  }

  // For large subnets, return first N and last N
  const half = Math.floor(limit / 2);
  const result: string[] = [];
  for (let i = 0; i < half; i++) {
    result.push(intToIp(first + i));
  }
  for (let i = total - half; i < total; i++) {
    result.push(intToIp(first + i));
  }
  return result;
}

/**
 * Check if an IP is within a subnet.
 */
export function isIpInSubnet(ip: string, network: string, cidr: number): boolean {
  if (cidr === 0) return true;
  const mask = (0xffffffff << (32 - cidr)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

/**
 * Format bytes for display (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format a CIDR notation string from network + cidr.
 */
export function formatCidr(network: string, cidr: number): string {
  return `${network}/${cidr}`;
}

/**
 * Parse "network/cidr" into { network, cidr }.
 */
export function parseCidr(notation: string): { network: string; cidr: number } {
  const [network, cidrStr] = notation.split("/");
  return { network, cidr: Number(cidrStr) };
}
