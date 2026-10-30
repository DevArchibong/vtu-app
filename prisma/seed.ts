
import { prisma } from "../src/lib/prisma";

const networks = [
  { code: "MTN", name: "MTN" },
  { code: "AIRTEL", name: "Airtel" },
  { code: "GLO", name: "Glo" },
  { code: "9MOBILE", name: "9mobile" },
];

const sampleBundles = [
  {
    networkCode: "MTN",
    dataType: "SME",
    name: "1GB SME - 30 Days",
    dataAmountMb: 1024,
    validityDays: 30,
    sellingPriceKobo: 100000,
    costPriceKobo: 85000,
  },
  {
    networkCode: "MTN",
    dataType: "GIFTING",
    name: "2GB Gifting - 30 Days",
    dataAmountMb: 2048,
    validityDays: 30,
    sellingPriceKobo: 200000,
    costPriceKobo: 175000,
  },
  {
    networkCode: "MTN",
    dataType: "CORPORATE_GIFTING",
    name: "3GB Corporate - 30 Days",
    dataAmountMb: 3072,
    validityDays: 30,
    sellingPriceKobo: 300000,
    costPriceKobo: 270000,
  },
  {
    networkCode: "AIRTEL",
    dataType: "SME",
    name: "1GB SME - 30 Days",
    dataAmountMb: 1024,
    validityDays: 30,
    sellingPriceKobo: 100000,
    costPriceKobo: 85000,
  },
  {
    networkCode: "AIRTEL",
    dataType: "GIFTING",
    name: "2GB Gifting - 30 Days",
    dataAmountMb: 2048,
    validityDays: 30,
    sellingPriceKobo: 200000,
    costPriceKobo: 175000,
  },
  {
    networkCode: "AIRTEL",
    dataType: "CORPORATE_GIFTING",
    name: "3GB Corporate - 30 Days",
    dataAmountMb: 3072,
    validityDays: 30,
    sellingPriceKobo: 300000,
    costPriceKobo: 270000,
  },
  {
    networkCode: "GLO",
    dataType: "SME",
    name: "1GB SME - 30 Days",
    dataAmountMb: 1024,
    validityDays: 30,
    sellingPriceKobo: 100000,
    costPriceKobo: 85000,
  },
  {
    networkCode: "GLO",
    dataType: "GIFTING",
    name: "2GB Gifting - 30 Days",
    dataAmountMb: 2048,
    validityDays: 30,
    sellingPriceKobo: 200000,
    costPriceKobo: 175000,
  },
  {
    networkCode: "GLO",
    dataType: "CORPORATE_GIFTING",
    name: "3GB Corporate - 30 Days",
    dataAmountMb: 3072,
    validityDays: 30,
    sellingPriceKobo: 300000,
    costPriceKobo: 270000,
  },
  {
    networkCode: "9MOBILE",
    dataType: "SME",
    name: "1GB SME - 30 Days",
    dataAmountMb: 1024,
    validityDays: 30,
    sellingPriceKobo: 100000,
    costPriceKobo: 85000,
  },
  {
    networkCode: "9MOBILE",
    dataType: "GIFTING",
    name: "2GB Gifting - 30 Days",
    dataAmountMb: 2048,
    validityDays: 30,
    sellingPriceKobo: 200000,
    costPriceKobo: 175000,
  },
  {
    networkCode: "9MOBILE",
    dataType: "CORPORATE_GIFTING",
    name: "3GB Corporate - 30 Days",
    dataAmountMb: 3072,
    validityDays: 30,
    sellingPriceKobo: 300000,
    costPriceKobo: 270000,
  },
] as const;

async function main() {
  console.log("Seeding local test catalogue...");

  const networkRecords = new Map<string, string>();

  for (const network of networks) {
    const record = await prisma.network.upsert({
      where: { code: network.code },
      update: {
        name: network.name,
        isActive: true,
      },
      create: {
        ...network,
        isActive: true,
      },
    });

    networkRecords.set(record.code, record.id);
  }

  const supplier = await prisma.supplier.upsert({
    where: { code: "LOCAL_TEST" },
    update: {
      name: "Local Test Supplier",
      isActive: true,
    },
    create: {
      code: "LOCAL_TEST",
      name: "Local Test Supplier",
      isActive: true,
    },
  });

  for (const bundle of sampleBundles) {
    const networkId = networkRecords.get(bundle.networkCode);

    if (!networkId) {
      throw new Error(`Network not found: ${bundle.networkCode}`);
    }

    const dataBundle = await prisma.dataBundle.upsert({
      where: {
        networkId_dataType_name: {
          networkId,
          dataType: bundle.dataType,
          name: bundle.name,
        },
      },
      update: {
        dataAmountMb: bundle.dataAmountMb,
        validityDays: bundle.validityDays,
        sellingPriceKobo: bundle.sellingPriceKobo,
        isActive: true,
      },
      create: {
        networkId,
        dataType: bundle.dataType,
        name: bundle.name,
        dataAmountMb: bundle.dataAmountMb,
        validityDays: bundle.validityDays,
        sellingPriceKobo: bundle.sellingPriceKobo,
        isActive: true,
      },
    });

    await prisma.supplierProduct.upsert({
      where: {
        dataBundleId_supplierId: {
          dataBundleId: dataBundle.id,
          supplierId: supplier.id,
        },
      },
      update: {
        supplierProductId: `LOCAL-${bundle.networkCode}-${bundle.dataType}`,
        costPriceKobo: bundle.costPriceKobo,
        isAvailable: true,
      },
      create: {
        dataBundleId: dataBundle.id,
        supplierId: supplier.id,
        supplierProductId: `LOCAL-${bundle.networkCode}-${bundle.dataType}`,
        costPriceKobo: bundle.costPriceKobo,
        isAvailable: true,
      },
    });
  }

  console.log(`Created/updated ${networks.length} networks.`);
  console.log(`Created/updated ${sampleBundles.length} bundles.`);
  console.log("Local test supplier mappings are ready.");
}

main()
  .catch((error) => {
    console.error("Catalogue seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
