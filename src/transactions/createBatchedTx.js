import { payments, crypto, Psbt } from 'bitcoinjs-lib'
import { toOutputScript } from 'bitcoinjs-lib/src/address.js';
import { generateSeed } from '../utils/generateSeed.js';
import { getNetwork } from '../utils/getNetwork.js';
import { SERVICE_ADDRESS_BITCOIN_MAINNET } from '../../config/constants.js';

export const createBatchedTx = (order_id, systemNetwork, dataArray, inputs, order_dust_val, order_vbytes_cost) => {
  let transactionArray = dataArray
  let txCostSoFar = 0

  const network = getNetwork(systemNetwork)
  const { node, internalPubkey } = generateSeed(order_id, network)
  const tweakedNode = node.tweak(
    crypto.taggedHash('TapTweak', internalPubkey),
  );

  const commitOutput = () => {

    const commitPsbt = new Psbt({ network })
    commitPsbt.setVersion(2); // set the version number to 1
    commitPsbt.setMaximumFeeRate(999999999);
    commitPsbt.addInput({
      sequence: 0xffffffff - 2, // set the sequence number to be 2 less than the maximum
      hash: inputs[0].txid,
      index: inputs[0].vout,
      witnessUtxo: {
        script: toOutputScript(transactionArray[0].serviceAddress, network),
        value: inputs[0].value // set the value of the output to be committed
      },
      tapInternalKey: internalPubkey,
    })

    for (let i = 1; i < transactionArray.length; i++) {

      const txCost = order_vbytes_cost * transactionArray[i].minFee + order_dust_val
      txCostSoFar += txCost

      if (i !== transactionArray.length - 1) {
        commitPsbt.addOutput({
          script: toOutputScript(transactionArray[i].serviceAddress, network),
          value: txCost
        })
      } else {
        commitPsbt.addOutput({
          script: toOutputScript(transactionArray[i].serviceAddress, network),
          value: inputs[0].value - txCostSoFar - (order_vbytes_cost * transactionArray[0].minFee) + txCost
        })
      }
    }
    commitPsbt.signInput(0, tweakedNode) // sign the commitment transaction with the root key
    commitPsbt.finalizeAllInputs() // finalize the input for the commitment transaction

    const txData = commitPsbt.extractTransaction(true);
    const txHex = txData.toHex()
    const txid = txData.getId()
    transactionArray[0].txData = txData
    transactionArray[0].txHex = txHex
    transactionArray[0].txid = txid
  }

  const revealOutput = () => {

    for (let i = 1; i < transactionArray.length; i++) {

      const revealPsbt = new Psbt({ network });
      revealPsbt.setVersion(2); // set the version number to 1
      revealPsbt.setMaximumFeeRate(999999999);
      revealPsbt.addInput({
        sequence: 0xffffffff - 2, // set the sequence number to be 2 less than the maximum
        hash: transactionArray[0].txid,
        index: i - 1,
        witnessUtxo: {
          script: transactionArray[0].txData.outs[i - 1].script,
          value: transactionArray[0].txData.outs[i - 1].value // set the value of the output to be committed
        },
      });
      revealPsbt.updateInput(0, {
        tapLeafScript: [
          {
            leafVersion: transactionArray[i].serviceRedeem.redeemVersion,
            script: Buffer.from(transactionArray[i].serviceRedeem.output.data),
            controlBlock: Buffer.from(transactionArray[i].serviceWitness[transactionArray[i].serviceWitness.length - 1].data),
          },
        ],
      });
      revealPsbt.addOutput({
        address: transactionArray[i].customerAddress,
        value: order_dust_val // set the value of the output for the reveal transaction
      });
      if (i === transactionArray.length - 1) {
        let refferalFee = 0
        let serviceFee = transactionArray[0].txData.outs[i - 1].value - order_dust_val - (order_vbytes_cost * transactionArray[i].minFee)

        if (transactionArray[i].customerReferral) {
          refferalFee = Math.round(serviceFee * 0.25)
          if (refferalFee > 545 && refferalFee < serviceFee - refferalFee) {
            serviceFee = serviceFee - refferalFee
            revealPsbt.addOutput({
              address: transactionArray[i].customerReferral,
              value: refferalFee // set the value of the output for the reveal transaction
            });
          }
        }
        revealPsbt.addOutput({
          address: SERVICE_ADDRESS_BITCOIN_MAINNET,
          value: serviceFee, // set the value of the Taproot output after committing
        });
      }

      revealPsbt.signInput(0, node); // sign the reveal transaction with the root key
      revealPsbt.finalizeAllInputs(); // finalize the input for the reveal transaction

      const txDataChild = revealPsbt.extractTransaction(true);
      const txHexChild = txDataChild.toHex()
      const txidChild = txDataChild.getId()
      transactionArray[i].txData = txDataChild
      transactionArray[i].txHex = txHexChild
      transactionArray[i].txid = txidChild
    }
  }

  commitOutput()
  revealOutput()

  return transactionArray

}
