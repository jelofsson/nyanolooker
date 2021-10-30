const fetch = require("node-fetch");
const cron = require("node-cron");
const uniqBy = require("lodash/uniqBy");
const BigNumber = require("bignumber.js");
const { doDelegatedEntitiesCron } = require("./delegatedEntity");
const { rawToNyano } = require("../utils");
const { rpc } = require("../rpc");
const { nodeCache } = require("../client/cache");
const { Sentry } = require("../sentry");
const {
  KNOWN_ACCOUNTS,
  KNOWN_ACCOUNTS_BALANCE,
  EXPIRE_48H,
} = require("../constants");
const extraKnownAccounts = require("./knownAccounts.json");
const faucetAccounts = require("../../src/pages/Faucets/faucets.json");

const doKnownAccountsCron = async () => {
  let knownAccounts = [];
  try {
    const res = await fetch("https://mynano.ninja/api/accounts/aliases");
    knownAccounts = (await res.json()) || [];

    // Merge knownAccounts.json list
    knownAccounts = uniqBy(knownAccounts.concat(extraKnownAccounts), "account");
    knownAccounts = uniqBy(knownAccounts.concat(faucetAccounts), "account");

    nodeCache.set(KNOWN_ACCOUNTS, knownAccounts);
  } catch (err) {
    console.log("Error", err);
    Sentry.captureException(err);
  }

  return knownAccounts;
};

const doKnownAccountsBalanceCron = async () => {
  let knownAccountsBalance = [];

  try {
    const knownAccounts = await (nodeCache.get(KNOWN_ACCOUNTS) ||
      doKnownAccountsCron());

    let accounts = knownAccounts.flatMap(({ account }) => [account]);

    let ignoredKnownAccountBalances =
      nodeCache.get(`${KNOWN_ACCOUNTS_BALANCE}_IGNORED`) || [];

    // Remove accounts with balance lower than 1 NANO for 48h
    if (ignoredKnownAccountBalances.length) {
      accounts = accounts.filter(
        account => !ignoredKnownAccountBalances.includes(account),
      );
    }

    const { balances } =
      (await rpc("accounts_balances", {
        accounts,
      })) || {};

    knownAccountsBalance = balances
      ? knownAccounts
          .map(({ account, alias }) => ({
            account,
            alias,
            balance: balances[account]
              ? rawToNyano(new BigNumber(balances[account].balance || 0))
              : 0,
            pending: balances[account]
              ? rawToNyano(new BigNumber(balances[account].pending || 0))
              : 0,
            total: balances[account]
              ? rawToNyano(
                  new BigNumber(balances[account].balance || 0).plus(
                    balances[account].pending || 0,
                  ),
                )
              : 0,
          }))
          .filter(({ alias }) => !!alias)
      : [];

    ignoredKnownAccountBalances = knownAccountsBalance
      .filter(({ total }) => total < 1)
      .flatMap(({ account }) => [account]);

    nodeCache.set(
      `${KNOWN_ACCOUNTS_BALANCE}_IGNORED`,
      ignoredKnownAccountBalances || [],
      EXPIRE_48H,
    );

    nodeCache.set(KNOWN_ACCOUNTS_BALANCE, knownAccountsBalance);
  } catch (err) {
    console.log("Error", err);
    Sentry.captureException(err);
  }

  return knownAccountsBalance;
};

// Once every 5 minutes
// https://crontab.guru/#*/5_*_*_*_*
cron.schedule("*/5 * * * *", async () => {
  if (process.env.NODE_ENV !== "production") return;

  doKnownAccountsCron();
});

// At every 15th minute.
// https://crontab.guru/#*/15_*_*_*_*
cron.schedule("*/15 * * * *", async () => {
  if (process.env.NODE_ENV !== "production") return;

  doKnownAccountsBalanceCron();
});

if (process.env.NODE_ENV === "production") {
  setImmediate(async () => {
    await doKnownAccountsBalanceCron();
    doDelegatedEntitiesCron();
  });
}

module.exports = {
  doKnownAccountsCron,
  doKnownAccountsBalanceCron,
};
