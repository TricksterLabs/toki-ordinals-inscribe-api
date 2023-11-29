import bip39 from 'bip39';
import * as tinysecp from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import bitcoin from 'bitcoinjs-lib';
bitcoin.initEccLib(tinysecp);
const bip32 = BIP32Factory(tinysecp);
import { SERVICE_MNEMONIC } from '../../config/constants.js';

const signAndFinalizePsbt = (psbt, node) => {
  const tweakedChildNode = node.tweak(
    bitcoin.crypto.taggedHash('TapTweak', node.publicKey.subarray(1, 33)),
  );

  return psbt.signAllInputs(tweakedChildNode).finalizeAllInputs();
};

export const prepareRefund = (order, utxo, feeEstimate, session_id, network) => {
  const { order_id, order_customer_addresses } = order;
  const mnemonic = SERVICE_MNEMONIC
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  const path = `m/88'/0'/0'/0/${order_id}`;
  const node = root.derivePath(path);
  const internalPubkey = node.publicKey.subarray(1, 33);
  const { output } = bitcoin.payments.p2tr({ internalPubkey, network });

  // console.log('address', address2)
  // console.log('utxo_value', utxo.value)
  // console.log('utxo_vout', utxo.vout)
  // console.log('utxo_txid', utxo.txid)
  // console.log('feeEstimate', feeEstimate)
  const inputTx = {
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      value: utxo.value,
      script: output
    },
    tapInternalKey: internalPubkey,
  };

  const outputTx = {
    value: utxo.value - feeEstimate * 111,
    address: JSON.parse(order_customer_addresses)[0],
  };

  const psbt = new bitcoin.Psbt({ network })
    .addInput(inputTx)
    .addOutput(outputTx);

  const txHex = signAndFinalizePsbt(psbt, node).extractTransaction().toHex();
  // console.log(txHex)
  return txHex;
};