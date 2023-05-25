import { TransactionsApi } from "@stacks/blockchain-api-client";
import { Transaction } from "@stacks/stacks-blockchain-api-types";
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "redis";

import { ENABLED_RULES } from "../../../src/_rules";
import { Context, ResponseData } from "../../../src/_types";

const api = new TransactionsApi();
const redis = createClient({
  url: process.env.REDIS_URL,
});
redis.on("error", (err) => console.log("Redis Client Error", err));

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  let { txid } = req.query;

  if (!txid) {
    return res.status(400).json({ message: "No txid given" });
  }

  if (Array.isArray(txid)) {
    return res.status(400).json({ message: "Multiple txids given" });
  }

  txid = txid.toLowerCase();
  txid = txid.startsWith("0x") ? txid.slice(2) : txid;

  if (!/^[0-9a-f]{64}$/.test(txid)) {
    return res.status(400).json({ message: "Not a valid txid" });
  }

  const txPromise = api.getTransactionById({ txId: txid });

  await redis.connect();
  const redisPromise = redis.LRANGE(`txid-${txid}`, 0, 100);

  const [tx, logs] = (await Promise.all([txPromise, redisPromise])) as [
    Transaction,
    string[]
  ];

  const context: Context = { tx, logs, reasons: [] };

  for (const rule of ENABLED_RULES) {
    const reason = await rule(context);
    if (reason) {
      context.reasons.push(reason);
    }
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ txid, tx, rawLogs: logs, reasons: context.reasons });
  await redis.disconnect();
}
