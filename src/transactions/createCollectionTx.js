import { payments, crypto, Psbt } from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair';
import bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { toOutputScript } from 'bitcoinjs-lib/src/address.js';
import { generateSeed, generateCollectionSeed } from '../utils/generateSeed.js';
import { getNetwork } from '../utils/getNetwork.js';
import { SERVICE_ADDRESS_BITCOIN_MAINNET } from '../../config/constants.js';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371.js';
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export const createCollectionTx = (order_id, systemNetwork, dataArray, inputs, inputs2, order_dust_val, order_vbytes_cost, order_checkpoint_index, order_checkpoint_steps) => {
  let transactionArray = dataArray
  let txCostSoFar = 0



  const network = getNetwork(systemNetwork)
  const { node } = generateSeed(order_id, network)
  const { node: node2, internalPubkey } = generateCollectionSeed(order_id, network)
  const tweakedNode2 = node2.tweak(
    crypto.taggedHash('TapTweak', internalPubkey),
  );
  // const tweakedNode = node.tweak(
  //   crypto.taggedHash('TapTweak', internalPubkey),
  // );

  const leafScriptAsm = `${internalPubkey.toString(
    'hex',
  )} OP_CHECKSIG`;

  const leafScript = bitcoin.script.fromASM(leafScriptAsm);

  const scriptTree = {
    output: leafScript,
  };

  const { output, address, hash } = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree,
    network,
  });
  // console.log(address)

  const prev_output = payments.p2tr({ internalPubkey, network });
  // console.log(prev_output.hash)
  const tweakedSigner = tweakSigner(node2, {
    tweakHash: hash,
    network,
  });


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
        revealPsbt.addInput({
          sequence: 0xffffffff - 2, // set the sequence number to be 2 less than the maximum
          hash: inputs2[0].txid,
          index: inputs2[0].vout,
          witnessUtxo: {
            script: toOutputScript(transactionArray[i - 1].serviceAddress, network),
            value: inputs2[0].value // set the value of the output to be committed
          },
          tapInternalKey: internalPubkey,
          // tapMerkleRoot: hash,
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
        revealPsbt.addInput({
          sequence: 0xffffffff - 2, // set the sequence number to be 2 less than the maximum
          hash: transactionArray[i - 1].txid,
          index: 2,
          witnessUtxo: {
            script: toOutputScript(transactionArray[i].serviceAddress, network),
            value: inputs2[0].value // set the value of the output to be committed
          },
          tapInternalKey: internalPubkey,
          // tapMerkleRoot: hash
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
        // console.log(inputs[0].value - order_dust_val - transactionArray[i].minFee)
        revealPsbt.addOutput({
          address: transactionArray[i + 1].serviceAddress, network,
          value: parseInt(inputs[0].value - order_dust_val - transactionArray[i].minFee)
        })
        // console.log(inputs2[0].value)
        revealPsbt.addOutput({
          address: transactionArray[i + 1].serviceAddress, network,
          value: inputs2[0].value
        })
        txCostSoFar += transactionArray[i].minFee
      } else if (i === 1 && i === transactionArray.length - 1) {
        let refferalFee = 0
        let serviceFee = inputs[0].value - order_dust_val - (txCostSoFar + transactionArray[i].minFee) * order_vbytes_cost

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
        revealPsbt.addOutput({
          address: transactionArray[1].customerAddress,
          value: inputs2[0].value
        })
      } else if (i === transactionArray.length - 1) {
        let refferalFee = 0
        let serviceFee = parseInt(transactionArray[i - 1].txData.outs[1].value - order_dust_val - (txCostSoFar + transactionArray[i].minFee) * order_vbytes_cost + txCostSoFar)
        if (transactionArray[i].customerReferral) {
          refferalFee = Math.round(serviceFee * 0.25)
          if (refferalFee > 545 && refferalFee < serviceFee - refferalFee) {
            serviceFee = parseInt(serviceFee - refferalFee)
            revealPsbt.addOutput({
              address: transactionArray[i].customerReferral,
              value: parseInt(refferalFee) // set the value of the output for the reveal transaction
            });
          }
        }
        revealPsbt.addOutput({
          address: SERVICE_ADDRESS_BITCOIN_MAINNET,
          value: serviceFee
        })
        revealPsbt.addOutput({
          address: transactionArray[1].customerAddress,
          value: inputs2[0].value
        })
      } else if (i % order_checkpoint_steps === 0 && i !== transactionArray.length) {
        revealPsbt.addOutput({
          script: toOutputScript(transactionArray[i + 1].serviceAddress, network),
          value: parseInt(transactionArray[i - 1].txData.outs[1].value - order_dust_val - (txCostSoFar + transactionArray[i].minFee) * order_vbytes_cost + txCostSoFar)
        })
        revealPsbt.addOutput({
          script: toOutputScript(transactionArray[i + 1].serviceAddress, network),
          value: inputs2[0].value
        })
        txCostSoFar = 0
      } else {
        revealPsbt.addOutput({
          script: toOutputScript(transactionArray[i + 1].serviceAddress, network),
          value: parseInt(transactionArray[i - 1].txData.outs[1].value - order_dust_val - transactionArray[i].minFee)
        })
        revealPsbt.addOutput({
          address: transactionArray[i + 1].serviceAddress,
          value: inputs2[0].value
        })
        txCostSoFar += transactionArray[i].minFee
      }
      // console.log(i)

      revealPsbt.signInput(0, node) // sign the commitment transaction with the root key
      if (i === 1) {
        revealPsbt.signInput(1, tweakedNode2) // sign the commitment transaction with the root key
      } else {
        revealPsbt.signInput(1, tweakedNode2) // sign the commitment transaction with the root key
      }
      // }
      // revealPsbt.signInput(1, tweakedNode2) // sign the commitment transaction with the root key
      // revealPsbt.signInput(1, tweakedNode2) // sign the commitment transaction with the root key
      // revealPsbt.signInput(1, node2) // sign the commitment transaction with the root key
      revealPsbt.finalizeAllInputs() // finalize the input for the commitment transaction
      const txData = revealPsbt.extractTransaction(true);
      const txHex = txData.toHex()
      const txid = txData.getId()
      transactionArray[i].txData = txData
      transactionArray[i].txHex = txHex
      transactionArray[i].txid = txid
      // console.log(transactionArray[i].txHex)
    }
  }

  revealOutput()
  // console.log(transactionArray[1])
  return transactionArray
}

function tweakSigner(signer, opts) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey = signer.privateKey;
  if (!privateKey) {
    throw new Error('Private key is required for tweaking signer!');
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash),
  );
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!');
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

function tapTweakHash(pubKey, h) {
  return bitcoin.crypto.taggedHash(
    'TapTweak',
    Buffer.concat(h ? [pubKey, h] : [pubKey]),
  );
}