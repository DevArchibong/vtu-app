import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("Data catalogue routes", () => {
  describe("GET /api/networks", () => {
    it("returns a list of networks", async () => {
      const response = await request(app).get("/api/networks");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("networks");
      expect(Array.isArray(response.body.networks)).toBe(true);
      expect(response.body.networks).toHaveLength(4);
    });
  });

  describe("GET /api/data-types", () => {
    it("returns all supported data types", async () => {
      const response = await request(app).get("/api/data-types");

      expect(response.status).toBe(200);
      expect(response.body.dataTypes).toEqual([
        { code: "SME", name: "SME" },
        { code: "GIFTING", name: "Gifting" },
        {
          code: "CORPORATE_GIFTING",
          name: "Corporate Gifting",
        },
      ]);
    });
  });

  describe("GET /api/data-bundles", () => {
    it("returns matching active bundles with correct prices", async () => {
      const response = await request(app).get(
        "/api/data-bundles?network=MTN&type=SME",
      );

      expect(response.status).toBe(200);
      expect(response.body.bundles).toHaveLength(1);

      const bundle = response.body.bundles[0];

      expect(bundle.network.code).toBe("MTN");
      expect(bundle.dataType).toBe("SME");
      expect(bundle.dataAmountMb).toBe(1024);
      expect(bundle.validityDays).toBe(30);
      expect(bundle.sellingPriceKobo).toBe(100000);
      expect(bundle.sellingPriceNaira).toBe(1000);
    });

    it("does not return inactive bundles", async () => {
      const bundle = await prisma.dataBundle.findFirst({
        where: {
          dataType: "SME",
          network: { code: "MTN" },
        },
        select: {
          id: true,
          isActive: true,
        },
      });

      if (!bundle) {
        throw new Error("Seeded MTN SME bundle was not found.");
      }

      try {
        await prisma.dataBundle.update({
          where: { id: bundle.id },
          data: { isActive: false },
        });

        const response = await request(app).get(
          "/api/data-bundles?network=MTN&type=SME",
        );

        expect(response.status).toBe(200);
        expect(response.body.bundles).toHaveLength(0);
      } finally {
        await prisma.dataBundle.update({
          where: { id: bundle.id },
          data: { isActive: bundle.isActive },
        });
      }
    });

    it("does not return bundles from inactive suppliers", async () => {
      const supplier = await prisma.supplier.findUnique({
        where: { code: "LOCAL_TEST" },
        select: {
          id: true,
          isActive: true,
        },
      });

      if (!supplier) {
        throw new Error("Local test supplier was not found.");
      }

      try {
        await prisma.supplier.update({
          where: { id: supplier.id },
          data: { isActive: false },
        });

        const response = await request(app).get(
          "/api/data-bundles?network=MTN&type=SME",
        );

        expect(response.status).toBe(200);
        expect(response.body.bundles).toHaveLength(0);
      } finally {
        await prisma.supplier.update({
          where: { id: supplier.id },
          data: { isActive: supplier.isActive },
        });
      }
    });

    it("does not return bundles with unavailable supplier products", async () => {
      const supplierProduct = await prisma.supplierProduct.findFirst({
        where: {
          supplier: { code: "LOCAL_TEST" },
          dataBundle: {
            dataType: "SME",
            network: { code: "MTN" },
          },
        },
        select: {
          id: true,
          isAvailable: true,
        },
      });

      if (!supplierProduct) {
        throw new Error("Seeded MTN SME supplier product was not found.");
      }

      try {
        await prisma.supplierProduct.update({
          where: { id: supplierProduct.id },
          data: { isAvailable: false },
        });

        const response = await request(app).get(
          "/api/data-bundles?network=MTN&type=SME",
        );

        expect(response.status).toBe(200);
        expect(response.body.bundles).toHaveLength(0);
      } finally {
        await prisma.supplierProduct.update({
          where: { id: supplierProduct.id },
          data: { isAvailable: supplierProduct.isAvailable },
        });
      }
    });

    it("returns bundles sorted by selling price from lowest to highest", async () => {
      const network = await prisma.network.findUnique({
        where: { code: "MTN" },
        select: { id: true },
      });

      const supplier = await prisma.supplier.findUnique({
        where: { code: "LOCAL_TEST" },
        select: { id: true },
      });

      if (!network || !supplier) {
        throw new Error("Required test network or supplier was not found.");
      }

      let testBundleId: string | undefined;
      let testSupplierProductId: string | undefined;

      try {
        const testBundle = await prisma.dataBundle.create({
          data: {
            networkId: network.id,
            dataType: "SME",
            name: `Sorting Test Bundle ${Date.now()}`,
            dataAmountMb: 512,
            validityDays: 7,
            sellingPriceKobo: 50000,
          },
        });

        testBundleId = testBundle.id;

        const testProduct = await prisma.supplierProduct.create({
          data: {
            dataBundleId: testBundle.id,
            supplierId: supplier.id,
            supplierProductId: `SORT-TEST-${Date.now()}`,
            costPriceKobo: 40000,
            isAvailable: true,
          },
        });

        testSupplierProductId = testProduct.id;

        const response = await request(app).get(
          "/api/data-bundles?network=MTN&type=SME",
        );

        expect(response.status).toBe(200);
        expect(response.body.bundles.length).toBeGreaterThanOrEqual(2);

        const prices = response.body.bundles.map(
          (bundle: { sellingPriceKobo: number }) =>
            bundle.sellingPriceKobo,
        );

        expect(prices).toEqual(
          [...prices].sort((a: number, b: number) => a - b),
        );

        expect(prices[0]).toBe(50000);
      } finally {
        if (testSupplierProductId) {
          await prisma.supplierProduct.delete({
            where: { id: testSupplierProductId },
          });
        }

        if (testBundleId) {
          await prisma.dataBundle.delete({
            where: { id: testBundleId },
          });
        }
      }
    });

    it("returns bundles for all four networks", async () => {
      const networks = ["MTN", "AIRTEL", "GLO", "9MOBILE"];

      for (const network of networks) {
        const response = await request(app).get(
          `/api/data-bundles?network=${network}&type=SME`,
        );

        expect(response.status).toBe(200);
        expect(response.body.bundles).toHaveLength(1);
        expect(response.body.bundles[0].network.code).toBe(network);
      }
    });

    it("rejects an invalid network", async () => {
      const response = await request(app).get(
        "/api/data-bundles?network=INVALID&type=SME",
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("INVALID_NETWORK");
    });

    it("rejects an invalid data type", async () => {
      const response = await request(app).get(
        "/api/data-bundles?network=MTN&type=INVALID",
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("INVALID_DATA_TYPE");
    });

    it("rejects missing query parameters", async () => {
      const response = await request(app).get("/api/data-bundles");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("INVALID_NETWORK");
    });
  });
});