import { createBatchedTx } from '../src/transactions/createBatchedTx.js'
import { readJsonFile } from '../src/utils/jsonUtil.js'

const order_id = 42
const network = 'btc-mainnet'
const dataArray = await readJsonFile(`./orders/${order_id}.json`)
const order_dust_val = 546
const order_vbytes_cost = 3
// const order_checkpoint_index = 1
// const order_checkpoint_steps = 4

const inputs = [
  {
    txid: '1a7e6324acd7d151f658a8a06278da22a7bd76e5587ba61bd6993ee696be38ef',
    vout: 0,
    value: 21808,
  }
]

// console.log(dataArray)

createBatchedTx(order_id, network, dataArray, inputs, order_dust_val, order_vbytes_cost)
