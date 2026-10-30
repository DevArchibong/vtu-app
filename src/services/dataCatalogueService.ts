
import { prisma } from "../lib/prisma";

export const DATA_TYPES = [
  {
    code: "SME",
    name: "SME",
  },
  {
    code: "GIFTING",
    name: "Gifting",
  },
  {
    code: "CORPORATE_GIFTING",
    name: "Corporate Gifting",
  },
] as const;

export type DataType = (typeof DATA_TYPES)[number]["code"];

/**
 * Retrieve all active mobile networks.
 */
export async function getActiveNetworks() {
  return prisma.network.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

/**
 * Retrieve the supported data types.
 */
export function getDataTypes() {
  return DATA_TYPES;
}

/**
 * Retrieve active bundles belonging to an active network
 * and matching the requested data type.
 */
export async function getActiveDataBundles(
  networkCode: string,
  dataType: DataType,
) {
  const bundles = await prisma.dataBundle.findMany({
    where: {
        isActive: true,
        dataType,
        network: {
          isActive: true,
          code: networkCode,
        },
        supplierProducts: {
          some: {
            isAvailable: true,
            supplier: {
              isActive: true,
            },
          },
        },
      },
    select: {
      id: true,
      name: true,
      dataType: true,
      dataAmountMb: true,
      validityDays: true,
      sellingPriceKobo: true,
      network: {
        select: {
          code: true,
          name: true,
        },
      },
    },
    orderBy: {
      sellingPriceKobo: "asc",
    },
  });

  return bundles.map((bundle) => ({
    id: bundle.id,
    name: bundle.name,
    network: bundle.network,
    dataType: bundle.dataType,
    dataAmountMb: bundle.dataAmountMb,
    validityDays: bundle.validityDays,
    sellingPriceKobo: bundle.sellingPriceKobo,
    sellingPriceNaira: bundle.sellingPriceKobo / 100,
  }));
}
