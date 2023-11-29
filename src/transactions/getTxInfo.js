import { payments } from 'bitcoinjs-lib'

export const getRevealTxInfo = (internalPubkey, network, inscription) => {

  const leafScript = Buffer.from(inscription, 'hex');

  const scriptTree = {
    output: leafScript,
  }

  const redeem = {
    output: leafScript,
    redeemVersion: 192,
  };

  const { witness, address } = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network,
  });

  // const { address, output, witness } = payments.p2tr({ internalPubkey, scriptTree, redeem, network });

  return { address, witness, redeem }
}

export const getCommitTxInfo = (internalPubkey, network) => {
  const { address } = payments.p2tr({ internalPubkey, network });
  return { address }
}
