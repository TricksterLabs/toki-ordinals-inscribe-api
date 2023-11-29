import bitcoin from 'bitcoinjs-lib';
import bip39 from 'bip39';
import * as tinysecp from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import { SERVICE_MNEMONIC } from '../../config/constants.js';
bitcoin.initEccLib(tinysecp);
const bip32 = BIP32Factory(tinysecp);

export const generateSeed = (order_id, network) => {
  const seed = bip39.mnemonicToSeedSync(SERVICE_MNEMONIC);
  const root = bip32.fromSeed(seed, network);
  const path = `m/99'/0'/0'/0/${order_id}`
  const nodeBuffer = root.derivePath(path);
  const internalPubkey = nodeBuffer.publicKey.subarray(1, 33)
  const node = nodeBuffer
  return { node, internalPubkey }
}

export const generateCollectionSeed = (order_id, network) => {
  const seed = bip39.mnemonicToSeedSync(SERVICE_MNEMONIC);
  const root = bip32.fromSeed(seed, network);
  const path = `m/99'/0'/0'/1/${order_id}`
  const nodeBuffer = root.derivePath(path);
  const internalPubkey = nodeBuffer.publicKey.subarray(1, 33)
  const node = nodeBuffer
  return { node, internalPubkey }
}