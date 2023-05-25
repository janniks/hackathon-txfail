import type { NextApiRequest, NextApiResponse } from "next";
import { TransactionsApi } from "@stacks/blockchain-api-client";

import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on("error", (err) => console.log("Redis Client Error", err));

const rules = [ruleNoFunds, rulePostCondition];

const api = new TransactionsApi();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  let { txid } = req.query;

  if (Array.isArray(txid)) {
    return res.status(400).json({ message: "Multiple txids given" });
  }

  if (!txid) {
    return res.status(400).json({ message: "No txid given" });
  }

  txid = txid.startsWith("0x") ? txid.slice(2) : txid;

  const tx = await api.getTransactionById({ txId: txid });

  await redis.connect();
  const logs = await redis.LRANGE(`txid-${txid}`, 0, 100);

  const { reasons } = rules.reduce(
    (acc, rule) => {
      const reason = rule(acc);
      if (reason) acc.reasons.push(reason);
      return acc;
    },
    { tx, logs, reasons: [] } as Context
  );

  res.status(200).json({ txid, rawLogs: logs, reasons });
  await redis.disconnect();
}

type ResponseData =
  | {
      txid: string;
      reasons: Reason[];
      rawLogs: string[];
    }
  | { message: string };

interface Context {
  tx: object;
  reasons: Reason[];
  logs: string[];
}

interface Reason {
  exclusive?: boolean;
  description: string;
  readMore?: string;
  references?: string[];
}

function ruleNoFunds(ctx: Context) {
  // could make it a lot more functional if we don't want reflection on existing reasons
  if (ctx.reasons.length > 0) return; // ignore rule of already found sensible response

  if (ctx.logs.some((log) => log.includes("NoFunds"))) {
    return {
      description:
        "It looks like the signer doesn't have enough funds for this transaction",
      readMore: "https://docs.stacks.co/blabla",
      references: [
        "[Stuff](https://stuff.com/stacksstuff)",
        "[More Stuff](https://blockacademy.com/tx-blocks)",
      ],
    };
  }
}

function rulePostCondition(ctx: Context) {
  // could make it a lot more functional if we don't want reflection on existing reasons
  if (ctx.reasons.length > 0) return; // ignore rule of already found sensible response

  const fail = ctx.logs.find((log) =>
    log.includes("Post-condition check failure")
  );
  if (fail) {
    const match = fail.match(/Post\-condition check failure on (.*?), txid/);

    return {
      description: `A Post-Condition failed the transaction: ${
        match ? match[1] : ""
      }`,
    };
  }
}
