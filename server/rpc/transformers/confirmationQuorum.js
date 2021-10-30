const BigNumber = require("bignumber.js");
const { rawToNyano } = require("../../utils");

const confirmationQuorumTransformer = confirmationQuorum => {
  const minWeight = rawToNyano(
    new BigNumber(confirmationQuorum.online_stake_total)
      .times(0.001)
      .toNumber(),
  );

  confirmationQuorum.principal_representative_min_weight = minWeight;

  return confirmationQuorum;
};

exports.transformer = confirmationQuorumTransformer;
