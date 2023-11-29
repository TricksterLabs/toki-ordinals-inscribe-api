import { createChainedTx } from '../src/transactions/createChainedTx.js'
import { readJsonFile } from '../src/utils/jsonUtil.js'

const order_id = 34
const network = 'btc-mainnet'
const dataArray = await readJsonFile(`./orders/${order_id}.json`)
const order_dust_val = 546
const order_vbytes_cost = 5
const order_checkpoint_index = 1
const order_checkpoint_steps = 20

const inputs = [
  {
    txid: '92f07a992f8c0a0caf252613e892e2499efa0e990c240666c67abdc796fa67d1',
    vout: 1,
    value: 4141,
  }
]

// console.log(dataArray)

createChainedTx(order_id, network, dataArray, inputs, order_dust_val, order_vbytes_cost, order_checkpoint_index, order_checkpoint_steps)
