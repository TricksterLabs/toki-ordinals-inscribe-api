import { payments, crypto, Psbt } from 'bitcoinjs-lib'
import { toOutputScript } from 'bitcoinjs-lib/src/address.js';
import { bitcoin } from 'bitcoinjs-lib/src/networks.js';
import { generateSeed } from '../utils/generateSeed.js';
import { getNetwork } from '../utils/getNetwork.js';
import { SERVICE_ADDRESS_BITCOIN_MAINNET } from '../../config/constants.js';

export const createChainedTx = (order_id, systemNetwork, dataArray, minProtocolFee, inputs, order_dust_val, order_vbytes_cost, order_checkpoint_index, order_checkpoint_steps) => {
  let transactionArray = dataArray
  let txCostSoFar = 0

  const network = getNetwork(systemNetwork)
  const { node, internalPubkey } = generateSeed(order_id, network)

  const revealOutput = () => {
    for (let i = 1; i < dataArray.length; i++) {
      const revealPsbt = new Psbt({ network })
      if (i === 1) {
        revealPsbt.setVersion(2); // set the version number to 1
        revealPsbt.setMaximumFeeRate(999999999);
        revealPsbt.addInput({
          sequence: 0xffffffff - 2, // set the sequence number to be 2 less than the maximum
          hash: inputs[0].txid,
          index: inputs[0].vout,
          witnessUtxo: {
            script: toOutputScript(transactionArray[i].serviceAddress, network),
            value: inputs[0].value // set the value of the output to be committed
          },
        })
      } else {
        revealPsbt.setVersion(2); // set the version number to 1
        revealPsbt.setMaximumFeeRate(999999999);
        revealPsbt.addInput({
          sequence: 0xffffffff - 2, // set the sequence number to be 2 less than the maximum
          hash: transactionArray[i - 1].txid,
          index: 1,
          witnessUtxo: {
            script: toOutputScript(transactionArray[i].serviceAddress, network),
            value: transactionArray[i - 1].txData.outs[1].value // set the value of the output to be committed
          },
        })
      }
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
        value: order_dust_val
      })
      if (i === 1 & i !== transactionArray.length - 1) {
        revealPsbt.addOutput({
          script: toOutputScript(transactionArray[i + 1].serviceAddress, network),
          value: inputs[0].value - order_dust_val - transactionArray[i].minFee * minProtocolFee
        })
        txCostSoFar += transactionArray[i].minFee
      } else if (i === 1 && i === transactionArray.length - 1) {
        let refferalFee = 0
        let serviceFee = inputs[0].value - order_dust_val - (txCostSoFar + transactionArray[i].minFee) * order_vbytes_cost + txCostSoFar * minProtocolFee

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
          value: serviceFee
        })
      } else if (i === transactionArray.length - 1) {
        let refferalFee = 0
        let serviceFee = transactionArray[i - 1].txData.outs[1].value - order_dust_val - (txCostSoFar + transactionArray[i].minFee) * order_vbytes_cost + txCostSoFar * minProtocolFee
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
          value: serviceFee
        })
      } else if (i % order_checkpoint_steps === 0 && i !== transactionArray.length) {
        revealPsbt.addOutput({
          script: toOutputScript(transactionArray[i + 1].serviceAddress, network),
          value: transactionArray[i - 1].txData.outs[1].value - order_dust_val - (txCostSoFar + transactionArray[i].minFee) * order_vbytes_cost + txCostSoFar * minProtocolFee
        })
        txCostSoFar = 0
      } else {
        revealPsbt.addOutput({
          script: toOutputScript(transactionArray[i + 1].serviceAddress, network),
          value: transactionArray[i - 1].txData.outs[1].value - order_dust_val - transactionArray[i].minFee * minProtocolFee
        })
        txCostSoFar += transactionArray[i].minFee
      }

      revealPsbt.signInput(0, node) // sign the commitment transaction with the root key
      revealPsbt.finalizeAllInputs() // finalize the input for the commitment transaction
      const txData = revealPsbt.extractTransaction(true);
      const txHex = txData.toHex()
      const txid = txData.getId()
      transactionArray[i].txData = txData
      transactionArray[i].txHex = txHex
      transactionArray[i].txid = txid
    }
  }

  revealOutput()

  return transactionArray
}
