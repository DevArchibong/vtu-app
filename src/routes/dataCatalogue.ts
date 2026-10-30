
import { Router, Request, Response, NextFunction } from "express";
import {
  getActiveNetworks,
  getDataTypes,
  getActiveDataBundles,
  type DataType,
} from "../services/dataCatalogueService";

export const dataCatalogueRouter = Router();

const VALID_NETWORKS = ["MTN", "AIRTEL", "GLO", "9MOBILE"];

const VALID_DATA_TYPES = [
  "SME",
  "GIFTING",
  "CORPORATE_GIFTING",
];

/**
 * GET /api/networks
 * Returns active mobile networks.
 */
dataCatalogueRouter.get(
  "/networks",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const networks = await getActiveNetworks();
      res.status(200).json({ networks });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/data-types
 * Returns supported data types.
 */
dataCatalogueRouter.get(
  "/data-types",
  (_req: Request, res: Response) => {
    res.status(200).json({ dataTypes: getDataTypes() });
  },
);

/**
 * GET /api/data-bundles?network=MTN&type=SME
 * Returns matching active data bundles.
 */
dataCatalogueRouter.get(
  "/data-bundles",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const network = req.query.network;
      const type = req.query.type;

      if (
        typeof network !== "string" ||
        !VALID_NETWORKS.includes(network.toUpperCase())
      ) {
        res.status(400).json({
          error: "INVALID_NETWORK",
          message: "Please provide a valid network.",
        });
        return;
      }

      if (
        typeof type !== "string" ||
        !VALID_DATA_TYPES.includes(type.toUpperCase())
      ) {
        res.status(400).json({
          error: "INVALID_DATA_TYPE",
          message: "Please provide a valid data type.",
        });
        return;
      }

      const bundles = await getActiveDataBundles(
        network.toUpperCase(),
        type.toUpperCase() as DataType,
      );

      res.status(200).json({ bundles });
    } catch (error) {
      next(error);
    }
  },
);
