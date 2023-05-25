import { Transaction } from "@stacks/stacks-blockchain-api-types";

export type ResponseData =
  | {
      txid: string;
      tx: Transaction;
      reasons: Reason[];
      rawLogs: string[];
    }
  | { message: string };

export interface Context {
  tx: Transaction;
  reasons: Reason[];
  logs: string[];
}

export interface Reason {
  exclusive?: boolean;
  description: string;
  readMore?: string;
  references?: string[];
}
