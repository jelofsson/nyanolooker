const BigNumber = require("bignumber.js");

const rawToNyano = raw => {
  const value = new BigNumber(raw.toString());
  return value.shiftedBy(30 * -1 + 6).toNumber();
};

exports.rawToNyano = rawToNyano;
