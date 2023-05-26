import {
  SmartContract,
  SmartContractsApi,
} from "@stacks/blockchain-api-client";
import { Context, Reason } from "./_types";

export const ENABLED_RULES = [
  ruleNoFunds,
  rulePostCondition,
  ruleErrorCode,
  ruleBnsHelp,
] as ((ctx: Context) => Promise<Reason | void> | Reason | void)[];

function ruleNoFunds(ctx: Context) {
  if (ctx.reasons.length > 0) return;

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
  const fail = ctx.logs.find((log) =>
    log.includes("Post-condition check failure")
  );
  if (fail) {
    const match = fail.match(/Post\-condition check failure on (.*?), txid/);

    return {
      description: `A Post-Condition failed the transaction: \`${
        match ? match[1] : ""
      }\``,
    };
  }
}

async function ruleErrorCode(ctx: Context) {
  if (ctx.tx.tx_status !== "abort_by_response") return;
  if (ctx.tx.tx_type !== "contract_call") return;

  const api = new SmartContractsApi();
  const contract = (await api.getContractById({
    contractId: ctx.tx.contract_call.contract_id,
  })) as SmartContract;

  const error = ctx.tx.tx_result.repr.replace("(err ", "").replace(")", "");

  const definitions = contract.source_code
    .split("\n")
    .filter((l) => l.includes("define-constant"))
    .filter((l) => l.includes(error));

  const definition = definitions[0]
    ?.replace("define-constant", "")
    .replace("(", "")
    .replace(")", "")
    .trim()
    .match(/^\S+/)?.[0];

  if (!definition) return;

  return {
    description: `The contract returned an error: \`${definition}\``,
  };
}

async function ruleBnsHelp(ctx: Context) {
  if (
    ctx.tx.tx_type !== "contract_call" ||
    ctx.tx.contract_call.contract_id !== "SP000000000000000000002Q6VF78.bns"
  ) {
    return;
  }

  if (
    ctx.reasons.some((reason) =>
      reason.description.includes("ERR_NAME_PREORDER_NOT_FOUND")
    )
  ) {
    return {
      description:
        "Before registering a name, you need to preorder it. Using the `name-preorder` method on the BNS contract preorders a name by telling all BNS nodes the salted hash of the BNS name. It pays the registration fee to the namespace owner's designated address. Preorders are required so other users can't front-run your name registration when revealed.",
      readMore: "https://docs.stacks.co/docs/stacks-academy/bns",
      references: ["https://btc.us"],
    };
  }
}
