
import express from 'express';
import fs from 'fs';
// import { getData } from './getData.js';
import db from '../db/toki-premint.js';
import bitcoin from 'bitcoinjs-lib';
import Database from 'better-sqlite3';
import bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as tinysecp from 'tiny-secp256k1';
const bip32 = BIP32Factory(tinysecp);
import cors from 'cors'
import { validateAddress } from './utils/validateAddress.js';
import { getNetwork } from './utils/getNetwork.js';
import { MAX_FILE_SIZE, MAX_TOTAL_SIZE } from '../config/constants.js';
import { generateSession } from './utils/generateSession.js';
import { logger } from './utils/logger.js'

import { readJsonFile, writeJsonFile } from './utils/jsonUtil.js';

import { generateSeed, generateCollectionSeed } from './utils/generateSeed.js';
import { generateInscription } from './utils/generateInscription.js';
import { getMinFee } from './utils/getMinFee.js';
import { getCommitTxInfo, getRevealTxInfo } from './transactions/getTxInfo.js';

const app = express();

app.use(cors())
app.use(express.json({ limit: '102400kb' }));
app.use(express.urlencoded({ limit: '102400kb', extended: true }));

const insertSessionUuidIntoSessions = db.prepare('INSERT INTO sessions(session_uuid) VALUES(?)')
const selectSessionUuidBySessionUuid = db.prepare('SELECT session_uuid FROM sessions WHERE session_uuid = ?')
const insertNewOrderBySessionUuid = db.prepare('INSERT INTO orders(session_uuid) VALUES(?)')
const updateOrderByOrderId = db.prepare('UPDATE orders SET order_network = ?, order_transaction_mode = ?, order_file_size = ?, order_checkpoint_steps = ?, order_checkpoint_index = ?, order_vbytes_count = ?, order_file_count = ?, order_vbytes_cost = ?, order_dust_val = ?, order_referral_address = ?, order_customer_addresses = ?, order_service_address = ?, order_service_address_collection = ?, order_status = ?, order_service_cost = ? WHERE order_id = ?')
const selectOrdersBySessionUuid = db.prepare('SELECT * FROM orders WHERE session_uuid = ?')
const selectOrderBySessionUuidAndOrderId = db.prepare('SELECT * FROM orders WHERE session_uuid = ? AND order_id = ?')

// Define the upload route
app.post('/submit', async (req, res) => {
  try {

    const { session, network, referral, order_vbytes_cost, order_dust_val, order_transaction_mode, order_checkpoint_steps, data, customer_addresses } = req.body;

    let session_uuid;

    // If the session parameter is not included, generate a new session_uuid
    if (!session) {
      session_uuid = generateSession()
      // Insert the new session into the sessions table
      const update_session = insertSessionUuidIntoSessions.run(session_uuid);
    } else {
      // If the session parameter is included, check if it exists in the sessions table
      const sessionRow = selectSessionUuidBySessionUuid.get(session);
      if (!sessionRow) {
        // If the session does not exist, generate a new session_uuid
        session_uuid = generateSession();
        // Insert the new session into the sessions table
        const update_session = insertSessionUuidIntoSessions.run(session_uuid);
      } else {
        // If the session exists, use the session_uuid from the request body
        session_uuid = session;
      }
    }

    // Check if the order_transaction_mode parameter is valid
    if (isNaN(order_vbytes_cost) || order_vbytes_cost < 1 || order_vbytes_cost > 500 || parseFloat(order_vbytes_cost.toFixed(2)) !== order_vbytes_cost) {
      throw new Error('order_vbytes_cost must be a float with maximum 2 decimal places between 1 and 50');
    }

    // Check if the order_dust_val parameter is valid
    if (!Number.isInteger(order_dust_val) || order_dust_val < 546 || order_dust_val > 10000) {
      throw new Error('order_dust_val must be an integer between 546 and 10000');
    }

    // Check if the order_transaction_mode parameter is valid
    const allowedModes = ['batched', 'chained', 'collection'];
    if (!allowedModes.includes(order_transaction_mode)) {
      throw new Error('Invalid mode');
    }

    // Check if the network parameter is valid
    const order_network = network;
    const systemNetwork = getNetwork(network);

    // If the referral parameter is included, check if it is valid
    let order_referral_address = null
    if (validateAddress(referral, systemNetwork)) {
      order_referral_address = referral;
    }

    // Check if customer_addresses are valid
    let order_customer_addresses = customer_addresses
    for (const address of customer_addresses) {
      if (!validateAddress(address, systemNetwork)) {
        throw new Error(`Invalid address for network: ${address}`);
      }
    }

    // Check if the data parameter is valid
    const fileCount = Object.keys(data).length;
    let totalSize = 0;
    let checkpointSize = 0;

    if (!Number.isInteger(order_checkpoint_steps) || order_checkpoint_steps < 1 || order_checkpoint_steps > 20) {
      throw new Error(`Invalid order_checkpoint_steps value: ${order_checkpoint_steps}. Must be an integer between 1 and 20 (inclusive).`);
    }

    for (const [index, [filename, file]] of Object.entries(Object.entries(data))) {
      const rawData = Buffer.from(file.rawData.data);
      const size = rawData.length;
      totalSize += size;
      checkpointSize += size;

      if (size > MAX_FILE_SIZE) {
        throw new Error(`File ${filename} is too big: ${size} bytes`);
      }

      file.rawData = rawData;

      if ((order_transaction_mode === 'chained' || order_transaction_mode === 'collection') && index % order_checkpoint_steps === 0) {
        if (checkpointSize > MAX_TOTAL_SIZE) {
          throw new Error(`Total file size for checkpoint ${index / order_checkpoint_steps} is too big: ${checkpointSize} bytes`);
        }
        checkpointSize = 0;
      }
    }

    if ((order_transaction_mode === 'chained' || order_transaction_mode === 'collection') && checkpointSize > 0) {
      if (checkpointSize > MAX_TOTAL_SIZE) {
        throw new Error(`Total file size for last checkpoint is too big: ${checkpointSize} bytes`);
      }
    }

    // Check if the number of customer addresses matches the submitted amount
    if (fileCount !== order_customer_addresses.length) {
      throw new Error(`Number of customer addresses (${order_customer_addresses.length}) does not match the submitted amount (${fileCount})`);
    }
    const order_file_count = fileCount;
    const order_file_size = totalSize;

    // Create a new order for the session
    const orderRow = insertNewOrderBySessionUuid.run(session_uuid);
    const order_id = orderRow.lastInsertRowid;

    const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
    // console.log(node)

    const folderPath = `./orders`

    let order_vbytes_count = 0
    let currentServiceAddress
    let currentServiceAddressCollection = null
    let order_checkpoint_index
    let dataArray = []

    if (order_transaction_mode === 'collection') {
      order_checkpoint_index = 1
      for (let i = 0; i <= fileCount; i++) {
        if (i === 0) {
          const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
          const { internalPubkey: internalPubkeyCollection, node: nodeCollection } = generateCollectionSeed(order_id, systemNetwork)
          const minFee = 0
          const { address: serviceAddress } = getCommitTxInfo(internalPubkey, systemNetwork)
          const { address: serviceAddressCollection } = getCommitTxInfo(internalPubkeyCollection, systemNetwork)
          order_vbytes_count += minFee
          currentServiceAddress = serviceAddress
          currentServiceAddressCollection = serviceAddressCollection
          dataArray.push({ serviceAddress, serviceAddressCollection, minFee })
        } else {
          const fileObject = Object.values(data)[i - 1];
          const inscription = generateInscription(internalPubkey, fileObject)
          const { address: serviceAddress, witness: serviceWitness, redeem: serviceRedeem } = getRevealTxInfo(internalPubkey, systemNetwork, inscription)
          if (order_referral_address && i === fileCount) {
            const minFee = getMinFee(2, 4, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerAddress: order_customer_addresses[i - 1], customerReferral: order_referral_address })
          } else {
            const minFee = getMinFee(2, 3, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerAddress: order_customer_addresses[i - 1] })
          }
        }
      }
    }

    if (order_transaction_mode === 'chained') {
      order_checkpoint_index = 1
      for (let i = 0; i <= fileCount; i++) {
        if (i === 0) {
          const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
          const minFee = 0
          const { address: serviceAddress } = getCommitTxInfo(internalPubkey, systemNetwork)
          order_vbytes_count += minFee
          dataArray.push({ serviceAddress, minFee })
        } else {
          const fileObject = Object.values(data)[i - 1];
          const inscription = generateInscription(internalPubkey, fileObject)
          const { address: serviceAddress, witness: serviceWitness, redeem: serviceRedeem } = getRevealTxInfo(internalPubkey, systemNetwork, inscription)
          if (i === 1) {
            currentServiceAddress = serviceAddress
          }
          if (order_referral_address && i === fileCount) {
            const minFee = getMinFee(1, 3, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerAddress: order_customer_addresses[i - 1], customerReferral: order_referral_address })
          } else {
            const minFee = getMinFee(1, 2, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerAddress: order_customer_addresses[i - 1] })
          }
        }
      }
    }

    if (order_transaction_mode === 'batched') {
      order_checkpoint_index = 0
      for (let i = 0; i <= fileCount; i++) {
        if (i === 0) {
          const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
          const minFee = 68 + (order_file_count * 43)
          const { address: serviceAddress } = getCommitTxInfo(internalPubkey, systemNetwork)
          order_vbytes_count += minFee
          currentServiceAddress = serviceAddress
          dataArray.push({ serviceAddress, minFee })
        } else {
          const fileObject = Object.values(data)[i - 1];
          const inscription = generateInscription(internalPubkey, fileObject)
          const { address: serviceAddress, witness: serviceWitness, redeem: serviceRedeem } = getRevealTxInfo(internalPubkey, systemNetwork, inscription)
          if (order_referral_address && i === fileCount) {
            const minFee = getMinFee(1, 3, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerAddress: order_customer_addresses[i - 1], customerReferral: order_referral_address })
          } else if (i === fileCount) {
            const minFee = getMinFee(1, 2, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerAddress: order_customer_addresses[i - 1] })
          } else {
            const minFee = getMinFee(1, 1, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerAddress: order_customer_addresses[i - 1] })
          }
        }
      }
    }

    await writeJsonFile(`${folderPath}/${order_id}.json`, dataArray)

    const order_service_cost = parseInt((order_vbytes_count * order_vbytes_cost) * 1 + order_file_count * order_dust_val + 2500)

    // Update order
    const updateOrder = updateOrderByOrderId.run(order_network, order_transaction_mode, order_file_size, order_checkpoint_steps, order_checkpoint_index, order_vbytes_count, order_file_count, order_vbytes_cost, order_dust_val, order_referral_address, JSON.stringify(order_customer_addresses), currentServiceAddress, currentServiceAddressCollection, 'pending', order_service_cost, order_id);

    res.json({
      session: session_uuid,
      serviceAddress: currentServiceAddress,
      serviceAddressCollection: currentServiceAddressCollection,
      order_referral_address,
      order_checkpoint_steps,
      order_checkpoint_index,
      order_service_cost,
      order_network,
      order_file_count,
      order_file_size,
      order_dust_val,
      order_vbytes_count,
      order_vbytes_cost,
      order_id,
    });
  } catch (error) {
    logger.log(error)
    res.status(500).send(error.message)
  }
});

app.post('/estimate', async (req, res) => {
  try {

    const { data } = req.body;

    // // Check if the network parameter is valid
    // const order_network = network;

    // // If the referral parameter is included, check if it is valid

    // if (validateAddress(referral, systemNetwork)) {
    //   order_referral_address = referral;
    // }

    const fileCount = Object.keys(data).length;
    let totalSize = 0;
    for (const [filename, file] of Object.entries(data)) {
      const rawData = Buffer.from(file.rawData.data);
      const size = rawData.length;
      totalSize += size;

      if (size > MAX_FILE_SIZE) {
        throw new Error(`File ${filename} is too big: ${size} bytes`);
      }
      // console.log(size)
      file.rawData = rawData;
    }

    // Throw an error if the total size is too big
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error(`Total file size is too big: ${totalSize} bytes`);
    }

    const order_id = 0
    const systemNetwork = getNetwork('btc-mainnet');
    const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
    const order_referral_address = null
    const order_file_count = fileCount
    const order_file_size = totalSize

    const estimateCollection = () => {
      let order_vbytes_count = 0
      let currentServiceAddress
      let currentServiceAddressCollection
      let dataArray = []
      const order_checkpoint_index = 1
      for (let i = 0; i <= fileCount; i++) {
        if (i === 0) {
          const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
          const { internalPubkey: internalPubkeyCollection, node: nodeCollection } = generateCollectionSeed(order_id, systemNetwork)
          const minFee = 0
          const { address: serviceAddress } = getCommitTxInfo(internalPubkey, systemNetwork)
          const { address: serviceAddressCollection } = getCommitTxInfo(internalPubkeyCollection, systemNetwork)
          order_vbytes_count += minFee
          currentServiceAddress = serviceAddress
          currentServiceAddressCollection = serviceAddressCollection
          dataArray.push({ serviceAddress, serviceAddressCollection, minFee })
        } else {
          const fileObject = Object.values(data)[i - 1];
          const inscription = generateInscription(internalPubkey, fileObject)
          const { address: serviceAddress, witness: serviceWitness, redeem: serviceRedeem } = getRevealTxInfo(internalPubkey, systemNetwork, inscription)
          if (order_referral_address && i === fileCount) {
            const minFee = getMinFee(2, 4, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerReferral: order_referral_address })
          } else {
            const minFee = getMinFee(2, 3, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem })
          }
        }
      }
      return order_vbytes_count
    }

    const estimateChained = () => {
      let order_vbytes_count = 0
      let currentServiceAddress
      let dataArray = []
      const order_checkpoint_index = 1
      for (let i = 0; i <= fileCount; i++) {
        if (i === 0) {
          const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
          const minFee = 0
          const { address: serviceAddress } = getCommitTxInfo(internalPubkey, systemNetwork)
          order_vbytes_count += minFee
          currentServiceAddress = serviceAddress
          dataArray.push({ serviceAddress, minFee })
        } else {
          const fileObject = Object.values(data)[i - 1];
          const inscription = generateInscription(internalPubkey, fileObject)
          const { address: serviceAddress, witness: serviceWitness, redeem: serviceRedeem } = getRevealTxInfo(internalPubkey, systemNetwork, inscription)
          if (order_referral_address && i === fileCount) {
            const minFee = getMinFee(1, 3, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerReferral: order_referral_address })
          } else {
            const minFee = getMinFee(1, 2, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem })
          }
        }
      }
      return order_vbytes_count
    }

    const estimateBatched = () => {
      let order_vbytes_count = 0
      let currentServiceAddress
      let dataArray = []
      const order_checkpoint_index = 0
      for (let i = 0; i <= fileCount; i++) {
        if (i === 0) {
          const { internalPubkey, node } = generateSeed(order_id, systemNetwork)
          const minFee = 68 + (order_file_count * 43)
          const { address: serviceAddress } = getCommitTxInfo(internalPubkey, systemNetwork)
          order_vbytes_count += minFee
          currentServiceAddress = serviceAddress
          dataArray.push({ serviceAddress, minFee })
        } else {
          const fileObject = Object.values(data)[i - 1];
          const inscription = generateInscription(internalPubkey, fileObject)
          const { address: serviceAddress, witness: serviceWitness, redeem: serviceRedeem } = getRevealTxInfo(internalPubkey, systemNetwork, inscription)
          if (order_referral_address && i === fileCount) {
            const minFee = getMinFee(1, 3, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, customerReferral: order_referral_address })
          } else if (i === fileCount) {
            const minFee = getMinFee(1, 2, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, })
          } else {
            const minFee = getMinFee(1, 1, inscription)
            order_vbytes_count += minFee
            dataArray.push({ inscription, minFee, serviceAddress, serviceWitness, serviceRedeem, })
          }
        }
      }
      return order_vbytes_count
    }

    const collectionFee = estimateCollection()
    const chainedFee = estimateChained()
    const batchedFee = estimateBatched()

    const collectionFeePlusReferral = collectionFee + 43
    const chainedFeePlusReferral = chainedFee + 43
    const batchedFeePlusReferral = batchedFee + 43

    res.json({
      collectionFee,
      chainedFee,
      batchedFee,
      collectionFeePlusReferral,
      chainedFeePlusReferral,
      batchedFeePlusReferral,
      order_file_count,
      order_file_size
    });
  } catch (error) {
    logger.error(error)
    res.status(500).send(error.message)
  }
});

app.get('/orders/:session', async (req, res) => {
  try {
    // Get the session parameter from the request URL
    const { session } = req.params;

    // Check if the session parameter is provided
    if (!session) {
      throw new Error('Session parameter is required');
    }

    // Check if the session exists in the sessions table
    const sessionRow = selectSessionUuidBySessionUuid.get(session);
    if (!sessionRow) {
      throw new Error('Session not found');
    }

    const orders = selectOrdersBySessionUuid.all(session);

    res.json(orders);
  } catch (error) {
    logger.error(error)
    res.status(500).send(error.message)
  }
});

app.get('/orders/:session/:order_id', async (req, res) => {
  try {
    // Get the session and order_id parameters from the request URL
    const { session, order_id } = req.params;

    // Check if the session and order_id parameters are provided
    if (!session || !order_id) {
      throw new Error('Session and order_id parameters are required');
    }

    // Check if the session exists in the sessions table
    const sessionRow = selectSessionUuidBySessionUuid.get(session);
    if (!sessionRow) {
      throw new Error('Session not found');
    }

    const order = selectOrderBySessionUuidAndOrderId.get(session, order_id);

    // Check if the order exists in the orders table
    if (!order) {
      throw new Error('Order not found');
    }

    res.json(order);
  } catch (error) {
    logger.error(error)
    res.status(500).send(error.message)
  }
});



// Start the server
const PORT = 3333;
app.listen(PORT, () => {
  logger.log(`Server running on port ${PORT}`);
});