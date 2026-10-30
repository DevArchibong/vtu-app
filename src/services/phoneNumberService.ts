export type NetworkCode = "MTN" | "AIRTEL" | "GLO" | "9MOBILE";

const NETWORK_PREFIXES: Record<NetworkCode, string[]> = {
  MTN: [
    "0703", "0704", "0706", "0707",
    "0803", "0806",
    "0810", "0813", "0814", "0816",
    "0903", "0906", "0913", "0916",
  ],

  AIRTEL: [
    "0701", "0708",
    "0802", "0808", "0812",
    "0901", "0902", "0904", "0907",
    "0911", "0912",
  ],

  GLO: [
    "0705", "0805", "0807",
    "0811", "0815",
    "0905", "0915",
  ],

  "9MOBILE": [
    "0809", "0817", "0818",
    "0908", "0909",
  ],
};

/**
 * Converts supported Nigerian phone number formats
 * into the standard +234 format.
 */
export function normalizePhoneNumber(
  phone: string,
): string | null {
  const cleaned = phone.replace(/[\s()-]/g, "");

  let international: string;

  if (/^0[789]\d{9}$/.test(cleaned)) {
    international = `+234${cleaned.slice(1)}`;
  } else if (/^234[789]\d{9}$/.test(cleaned)) {
    international = `+${cleaned}`;
  } else if (/^\+234[789]\d{9}$/.test(cleaned)) {
    international = cleaned;
  } else {
    return null;
  }

  return international;
}

/**
 * Checks whether the phone number has the expected
 * Nigerian mobile number format.
 */
export function isValidNigerianPhoneNumber(
  phone: string,
): boolean {
  return normalizePhoneNumber(phone) !== null;
}

/**
 * Estimates the original network allocation from
 * the phone number prefix.
 *
 * Returns null if the prefix is not recognized.
 */
export function detectNetwork(
  phone: string,
): NetworkCode | null {
  const normalized = normalizePhoneNumber(phone);

  if (!normalized) {
    return null;
  }

  const nationalNumber = `0${normalized.slice(4)}`;
  const prefix = nationalNumber.slice(0, 4);

  for (const [network, prefixes] of Object.entries(
    NETWORK_PREFIXES,
  ) as [NetworkCode, string[]][]) {
    if (prefixes.includes(prefix)) {
      return network;
    }
  }

  return null;
}
export interface NetworkResolution {
    normalizedPhoneNumber: string;
    estimatedNetwork: NetworkCode | null;
    selectedNetwork: NetworkCode | null;
    resolvedNetwork: NetworkCode | null;
    isMismatch: boolean;
  }
  
  /**
   * Resolves the network to use for a phone number.
   *
   * A manual customer selection takes priority over
   * the network estimated from the phone number prefix.
   */
  export function resolveNetwork(
    phone: string,
    selectedNetwork?: NetworkCode | null,
  ): NetworkResolution | null {
    const normalizedPhoneNumber = normalizePhoneNumber(phone);
  
    if (!normalizedPhoneNumber) {
      return null;
    }
  
    const estimatedNetwork = detectNetwork(normalizedPhoneNumber);
  
    const resolvedNetwork = selectedNetwork ?? estimatedNetwork;
  
    const isMismatch =
      selectedNetwork !== undefined &&
      selectedNetwork !== null &&
      estimatedNetwork !== null &&
      selectedNetwork !== estimatedNetwork;
  
    return {
      normalizedPhoneNumber,
      estimatedNetwork,
      selectedNetwork: selectedNetwork ?? null,
      resolvedNetwork,
      isMismatch,
    };
  }