import db, { startWalCheckpoint } from '../db/toki-premint.js';
import cron from 'node-cron';
import axios from 'axios';
import fs, { readFileSync } from 'fs';
import bitcoin from 'bitcoinjs-lib';
import { createChainedTx } from './transactions/createChainedTx.js';
import { createBatchedTx } from './transactions/createBatchedTx.js';
import { createCollectionTx } from './transactions/createCollectionTx.js';
import { checkUtxo, getFeeEstimate, getMinFeeEstimate, isTransactionConfirmed, postTransactions } from './api/bitcoinApi.js';
import { getNetwork } from './utils/getNetwork.js';
import { prepareRefund } from './transactions/prepareRefund.js';
import { readJsonFile, writeJsonFile } from './utils/jsonUtil.js';
import { logger } from './utils/logger.js'

// const selectOrdersByStatus = db.prepare('SELECT * FROM orders WHERE order_status = ?');
const selectOrdersByStatus = db.prepare('SELECT * FROM orders WHERE order_status IN (?, ?)');
const updateOrderStatusByOrderId = db.prepare('UPDATE orders SET order_status = ? WHERE order_id = ?')
const selectCustomerAddressesByOrderId = db.prepare('SELECT order_customer_addresses FROM orders WHERE order_id = ?');
const selectTransactionTypeByOrderId = db.prepare('SELECT order_transaction_mode FROM orders WHERE order_id = ?');
const selectSessionIdBySessionUuid = db.prepare('SELECT session_id FROM sessions WHERE session_uuid = ?');
const updateOrderStatusAndRefundTransactionsByOrderId = db.prepare("UPDATE orders SET order_status = ?, order_refund_transactions = ? WHERE order_id = ?")
const updateOrderStatusAndCommitHashAndServiceTransactionsByOrderId = db.prepare("UPDATE orders SET order_status = ?, order_commit_hash = ?, order_service_transactions = ? WHERE order_id = ?")
const updateOrderCommitHashByOrderId = db.prepare("UPDATE orders SET order_commit_hash = ? WHERE order_id = ?")
const updateOrderStatusAndServiceTransactionsByOrderId = db.prepare("UPDATE orders SET order_status = ?, order_service_transactions = ? WHERE order_id = ?")
const updateOrderStatusAndCommitHashAndAndCheckpointIndexAndServiceTransactionsByOrderId = db.prepare("UPDATE orders SET order_status = ?, order_commit_hash = ?, order_checkpoint_index = ?, order_service_transactions = ? WHERE order_id = ?")
const updateOrderStatusAndCheckpointIndexByOrderId = db.prepare("UPDATE orders SET order_status = ?, order_checkpoint_index = ? WHERE order_id = ?")
const updateOrderStatusAndCommitHashAndAndCheckpointIndexByOrderId = db.prepare("UPDATE orders SET order_status = ?, order_commit_hash = ?, order_checkpoint_index = ? WHERE order_id = ?")

async function processOrder(order) {
  const {
    order_id,
    order_transaction_mode,
    order_commit_hash,
    order_service_address,
    order_service_address_collection,
    order_referral_address,
    order_last_date,
    order_customer_addresses,
    order_checkpoint_index,
    order_checkpoint_steps,
    order_dust_val,
    order_vbytes_count,
    order_vbytes_cost,
    order_service_cost,
    order_network,
    order_status,
    session_uuid
  } = order;

  const orderLastDate = new Date(order_last_date);
  const now = new Date();
  const diffInMs = now - orderLastDate;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays > 3 & order_status !== 'processing') {
    // Update order status to 'timeout'
    await updateOrderStatusByOrderId.run(['timeout', order_id]);
  }

  if (order_transaction_mode === 'collection' && order_commit_hash !== null) {
    const isConfirmed = await isTransactionConfirmed(order_commit_hash);
    if (!isConfirmed) {
      return;
    }

    try {
      let txid = []

      const dataArray = await readJsonFile(`./orders/${order_id}.json`);

      for (let i = 0; i < dataArray.length; i++) {
        txid.push(dataArray[i].txid)
      }

      let status = 'submit_success'
      let maxStep = dataArray.length
      if ((dataArray.slice(order_checkpoint_index).length) >= (order_checkpoint_steps)) {
        maxStep = order_checkpoint_steps + order_checkpoint_index
        status = 'processing'
      }

      const submitTx = await postTransactions(dataArray.slice(order_checkpoint_index, maxStep));
      const update_status = await updateOrderStatusAndCommitHashAndAndCheckpointIndexByOrderId.run(status, txid[maxStep - 1], maxStep, order_id);
    } catch (error) {
      const update_status = await updateOrderStatusByOrderId.run('submit_failed', order_id);
      logger.error(error);
    }
  }

  if (order_transaction_mode === 'collection' && order_commit_hash === null) {
    // console.log(0)
    const utxo = await checkUtxo(order_service_address);
    const utxo2 = await checkUtxo(order_service_address_collection);
    // console.log(utxo)
    if (!(utxo && utxo2)) {
      return;
    }

    // console.log(utxo)
    if (utxo.value !== order_service_cost) {
      if (utxo.value < 5000) {
        const update_status = await updateOrderStatusByOrderId.run('refund_impossible', order_id);
      } else {
        try {
          const feeEstimate = await getFeeEstimate();
          const { order_customer_addresses } = await selectCustomerAddressesByOrderId.get(order_id);
          const { session_id } = await selectSessionIdBySessionUuid.get(session_uuid);

          try {
            const refund = await prepareRefund({ order_id, order_customer_addresses }, utxo, feeEstimate, session_id, getNetwork(order_network));
            const submit = await postTransactions([{ txHex: refund }]);
            const output = [{ txid: submit, vout: 0, value: utxo.value - feeEstimate * 111 }]
            const update_status = await updateOrderStatusAndRefundTransactionsByOrderId.run('refund_success', JSON.stringify(output), order_id);
          } catch (error) {
            const update_status = await updateOrderStatusByOrderId.run('refund_failed', order_id);
            logger.error(error)
          }
        } catch (error) {
          logger.error(error);
        }
      }
    }

    if (utxo.value === order_service_cost) {

      try {
        let txid = []

        const dataArrayTemp = await readJsonFile(`./orders/${order_id}.json`);

        const inputs = [{
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
        }]

        const inputs2 = [{
          txid: utxo2.txid,
          vout: utxo2.vout,
          value: utxo2.value,
        }]

        const dataArray = await createCollectionTx(order_id, order_network, dataArrayTemp, inputs, inputs2, order_dust_val, order_vbytes_cost, order_checkpoint_index, order_checkpoint_steps)
        await writeJsonFile(`./orders/${order_id}.json`, dataArray);

        for (let i = 0; i < dataArray.length; i++) {
          txid.push(dataArray[i].txid)
        }

        let maxStep = dataArray.length
        if (dataArray.slice(order_checkpoint_index).length > order_checkpoint_steps) {
          maxStep = order_checkpoint_steps + order_checkpoint_index
        }

        const submitTx = await postTransactions(dataArray.slice(order_checkpoint_index, maxStep));
        const update_status = await updateOrderStatusAndCommitHashAndAndCheckpointIndexAndServiceTransactionsByOrderId.run('processing', txid[maxStep - 1], maxStep, JSON.stringify(txid.slice(1)), order_id);
      } catch (error) {
        const update_status = await updateOrderStatusByOrderId.run('submit_failed', order_id);
        logger.error(error);
      }
    }
  }

  if (order_transaction_mode === 'chained' && order_commit_hash !== null) {
    const isConfirmed = await isTransactionConfirmed(order_commit_hash);
    if (!isConfirmed) {
      return;
    }

    try {
      let txid = []

      const dataArray = await readJsonFile(`./orders/${order_id}.json`);

      for (let i = 0; i < dataArray.length; i++) {
        txid.push(dataArray[i].txid)
      }

      let status = 'submit_success'
      let maxStep = dataArray.length
      if ((dataArray.slice(order_checkpoint_index).length) >= (order_checkpoint_steps)) {
        maxStep = order_checkpoint_steps + order_checkpoint_index
        status = 'processing'
      }

      const submitTx = await postTransactions(dataArray.slice(order_checkpoint_index, maxStep));
      const update_status = await updateOrderStatusAndCommitHashAndAndCheckpointIndexByOrderId.run(status, txid[maxStep - 1], maxStep, order_id);
    } catch (error) {
      const update_status = await updateOrderStatusByOrderId.run('submit_failed', order_id);
      logger.error(error);
    }
  }

  if (order_transaction_mode === 'chained' && order_commit_hash === null) {
    // console.log(0)
    const utxo = await checkUtxo(order_service_address);
    if (!utxo) {
      return;
    }

    // console.log(utxo)
    if (utxo.value !== order_service_cost) {
      if (utxo.value < 5000) {
        const update_status = await updateOrderStatusByOrderId.run('refund_impossible', order_id);
      } else {
        try {
          const feeEstimate = await getFeeEstimate();
          const { order_customer_addresses } = await selectCustomerAddressesByOrderId.get(order_id);
          const { session_id } = await selectSessionIdBySessionUuid.get(session_uuid);

          try {
            const refund = await prepareRefund({ order_id, order_customer_addresses }, utxo, feeEstimate, session_id, getNetwork(order_network));
            const submit = await postTransactions([{ txHex: refund }]);
            const output = [{ txid: submit, vout: 0, value: utxo.value - feeEstimate * 111 }]
            const update_status = await updateOrderStatusAndRefundTransactionsByOrderId.run('refund_success', JSON.stringify(output), order_id);
          } catch (error) {
            const update_status = await updateOrderStatusByOrderId.run('refund_failed', order_id);
            logger.error(error)
          }
        } catch (error) {
          logger.error(error);
        }
      }
    }

    if (utxo.value === order_service_cost) {

      try {
        let txid = []

        const dataArrayTemp = await readJsonFile(`./orders/${order_id}.json`);

        const inputs = [{
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
        }]
        const minProtocolFee = await getMinFeeEstimate();

        const dataArray = await createChainedTx(order_id, order_network, dataArrayTemp, minProtocolFee, inputs, order_dust_val, order_vbytes_cost, order_checkpoint_index, order_checkpoint_steps)
        await writeJsonFile(`./orders/${order_id}.json`, dataArray);

        for (let i = 0; i < dataArray.length; i++) {
          txid.push(dataArray[i].txid)
        }
        let status = 'submit_success'
        let maxStep = dataArray.length
        if (dataArray.slice(order_checkpoint_index).length > order_checkpoint_steps) {
          maxStep = order_checkpoint_steps + order_checkpoint_index
          status = 'processing'
        }

        const submitTx = await postTransactions(dataArray.slice(order_checkpoint_index, maxStep));
        const update_status = await updateOrderStatusAndCommitHashAndAndCheckpointIndexAndServiceTransactionsByOrderId.run(status, txid[maxStep - 1], maxStep, JSON.stringify(txid.slice(1)), order_id);
      } catch (error) {
        const update_status = await updateOrderStatusByOrderId.run('submit_failed', order_id);
        logger.error(error);
      }
    }
  }

  if (order_transaction_mode === 'batched' && order_commit_hash !== null) {

    const isConfirmed = await isTransactionConfirmed(order_commit_hash);
    if (!isConfirmed) {
      return;
    }

    try {

      const dataArray = await readJsonFile(`./orders/${order_id}.json`);

      const submitTx = await postTransactions(dataArray.slice(1));
      const update_status = await updateOrderStatusByOrderId.run('submit_success', order_id);
    } catch (error) {
      const update_status = await updateOrderStatusByOrderId.run('submit_failed', order_id);
      logger.error(error);
    }
  }

  if (order_transaction_mode === 'batched' && order_commit_hash === null) {

    const utxo = await checkUtxo(order_service_address);
    if (!utxo) {
      return;
    }

    if (utxo.value !== order_service_cost) {
      if (utxo.value < 5000) {
        const update_status = await updateOrderStatusByOrderId.run('refund_impossible', order_id);
      } else {
        try {

          const feeEstimate = await getFeeEstimate();
          const { order_customer_addresses } = await selectCustomerAddressesByOrderId.get(order_id);
          const { session_id } = await selectSessionIdBySessionUuid.get(session_uuid);
          const inputs = [{ txid: utxo.txid, vout: utxo.vout, value: utxo.value }];

          try {
            const refund = await prepareRefund({ order_id, order_customer_addresses }, utxo, feeEstimate, session_id, getNetwork(order_network));
            const submit = await postTransactions([{ txHex: refund }]);
            const output = [{ txid: submit, vout: 0, value: utxo.value - feeEstimate * 111 }]
            const update_status = await updateOrderStatusAndRefundTransactionsByOrderId.run('refund_success', JSON.stringify(output), order_id);
          } catch (error) {
            const update_status = await updateOrderStatusByOrderId.run('refund_failed', order_id);
            logger.error(error)
          }
        } catch (error) {
          logger.error(error);
        }
      }
    }

    if (utxo.value === order_service_cost) {
      try {
        let txid = []
        const dataArrayTemp = await readJsonFile(`./orders/${order_id}.json`);

        const inputs = [{
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
        }]
        const dataArray = await createBatchedTx(order_id, order_network, dataArrayTemp, inputs, order_dust_val, order_vbytes_cost)
        await writeJsonFile(`./orders/${order_id}.json`, dataArray);

        for (let i = 0; i < dataArray.length; i++) {
          txid.push(dataArray[i].txid)
        }

        const submitTx = await postTransactions([dataArray[0]]);
        const update_status = await updateOrderStatusAndCommitHashAndServiceTransactionsByOrderId.run('processing', txid[0], JSON.stringify(txid.slice(1)), order_id);
      } catch (error) {
        const update_status = await updateOrderStatusByOrderId.run('submit_failed', order_id);
        logger.error(error);
      }
    }
  }
}


async function processPendingOrders() {
  try {
    const orders = await selectOrdersByStatus.all(['pending', 'processing']);
    for (const order of orders) {
      logger.log(order.order_id, order.order_status, order.order_transaction_mode, order.order_commit_hash, order.order_service_address, order.order_service_cost, order.order_vbytes_count)
      await processOrder(order);
    }
  } catch (error) {
    logger.error(error);
  }
}

cron.schedule('* * * * *', async () => {
  // console.log('test')
  await processPendingOrders();
})

startWalCheckpoint()