-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('SME', 'GIFTING', 'CORPORATE_GIFTING');

-- CreateTable
CREATE TABLE "Network" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataBundle" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "dataType" "DataType" NOT NULL,
    "name" TEXT NOT NULL,
    "dataAmountMb" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "sellingPriceKobo" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "dataBundleId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "costPriceKobo" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Network_code_key" ON "Network"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Network_name_key" ON "Network"("name");

-- CreateIndex
CREATE INDEX "DataBundle_networkId_dataType_isActive_idx" ON "DataBundle"("networkId", "dataType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DataBundle_networkId_dataType_name_key" ON "DataBundle"("networkId", "dataType", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "SupplierProduct_dataBundleId_isAvailable_idx" ON "SupplierProduct"("dataBundleId", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_supplierId_supplierProductId_key" ON "SupplierProduct"("supplierId", "supplierProductId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_dataBundleId_supplierId_key" ON "SupplierProduct"("dataBundleId", "supplierId");

-- AddForeignKey
ALTER TABLE "DataBundle" ADD CONSTRAINT "DataBundle_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_dataBundleId_fkey" FOREIGN KEY ("dataBundleId") REFERENCES "DataBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
