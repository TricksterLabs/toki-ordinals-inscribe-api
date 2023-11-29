import axios from 'axios';
import { ElectrumClient } from '@samouraiwallet/electrum-client';
import bitcoin from 'bitcoinjs-lib'
import { logger } from '../utils/logger.js'
import * as tinysecp from 'tiny-secp256k1';
bitcoin.initEccLib(tinysecp);

// Create a global Electrum client instance
const client = new ElectrumClient(50001, "0.0.0.0", "tcp");
client.initElectrum({ client: 'electrum-client-js', version: ['1.2', '1.4'] }, {
  retryPeriod: 5000,
  maxRetry: 10,
  pingPeriod: 5000,
});

const getUtxos = async (address) => {
  try {
    const script = bitcoin.address.toOutputScript(address);
    const scriptHash = bitcoin.crypto.sha256(script).reverse().toString('hex');

    const utxos = await client.blockchainScripthash_listunspent(scriptHash)
    const unconfirmedDescendants = await Promise.all(utxos.map(async (utxo) => {
      const tx = await client.blockchainTransaction_get(utxo.tx_hash, true);
      const numDescendants = tx.vin.filter(input => input.txid === utxo.tx_hash).length;
      return numDescendants;
    }));

    const hasTooManyDescendants = unconfirmedDescendants.some(numDescendants => numDescendants > 2);
    if (hasTooManyDescendants) {
      throw new Error('At least one UTXO has more than 2 unconfirmed descendants');
    }

    return utxos;
  } catch (err) {
    logger.error(err)
    throw new Error('Could not fetch utxos');
  }
}

export const isTransactionConfirmed = async (txid) => {
  try {
    const tx = await client.blockchainTransaction_get(txid, true);
    if (tx.confirmations > 0) {
      logger.log(`Transaction ${txid} has ${tx.confirmations} confirmations`);
      return true;
    } else {
      logger.log(`Transaction ${txid} has not been confirmed yet`);
      return false;
    }
  } catch (err) {
    logger.error(err)
    throw new Error(`Could not fetch transaction details for ${txid}`);
  };
}

const postTransaction = async (txHexes) => {
  for (const txHex of txHexes) {
    let retries = 3;
    while (retries > 0) {
      try {
        const tx = await client.blockchainTransaction_broadcast(txHex.txHex)
        logger.log(tx)
        // console.log("Unspent transactions for", address, utxos);
        // await client.close();
        break;
      } catch (error) {
        logger.error(`Error posting transaction: ${error.message}`);

        if (retries === 1) {
          // Final retry, throw error to propagate to calling function
          // await client.close();
          throw new Error(`Error posting transaction: ${error.message}`);
        } else {
          // Retry after delay
          logger.log(`Retrying transaction in 3 seconds (${retries} retries left)`);
          // await client.close();
          await new Promise((resolve) => setTimeout(resolve, 3000));
          retries--;
        }
      }
    }
  }
};

export const postTransactions = async (txHexes) => {
  try {
    await postTransaction(txHexes);
  } catch (error) {
    logger.error(`Error posting transactions: ${error.message}`);
    throw new Error(`Error posting transactions: ${error.message}`);
  }
};

export const checkUtxo = async (address) => {
  try {
    const utxo = await getUtxos(address);
    if (utxo && utxo.length > 0) {
      return {
        txid: utxo[0].tx_hash,
        vout: utxo[0].tx_pos,
        value: utxo[0].value,
      }
    }
  } catch (error) {
    logger.error(error);
  }
  return null;
}

export const getFeeEstimate = async () => {
  try {
    const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
    return response.data.halfHourFee;
  } catch (error) {
    logger.error(error);
    throw new Error('Could not fetch fee estimate');
  }
}

export const getMinFeeEstimate = async () => {
  try {
    const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
    let minimumFee = response.data.minimumFee
    // if (response.data.minimumFee == 1) {
    //   minimumFee = 1
    // } else {
    //   minimumFee = response.data.minimumFee * 1.1
    // }
    // console.log(minimumFee)
    return minimumFee
  } catch (error) {
    logger.error(error);
    throw new Error('Could not fetch fee estimate');
  }
}